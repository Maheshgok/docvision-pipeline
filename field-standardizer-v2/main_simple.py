"""
Field Standardizer V2 - Standardize extracted fields using LLM
Per Approach Doc: 1GB, OpenAI Call #3
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, List

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore, secretmanager
from openai import OpenAI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

db = firestore.Client()
PROJECT_ID = os.getenv('PROJECT_ID', 'watch-mail-trial')


def get_openai_client() -> OpenAI:
    """Get OpenAI client with API key from Secret Manager"""
    try:
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{PROJECT_ID}/secrets/openai-api-key/versions/latest"
        response = client.access_secret_version(request={"name": name})
        api_key = response.payload.data.decode("UTF-8")
        return OpenAI(api_key=api_key)
    except Exception as e:
        logger.error(f"Failed to get OpenAI key: {e}")
        return OpenAI(api_key=os.getenv('OPENAI_API_KEY'))


openai_client = None


def get_tenant_id(req) -> str:
    """Extract tenant_id from request"""
    tenant_id = req.headers.get('X-Tenant-ID') or req.args.get('tenant_id')
    if not tenant_id:
        data = req.get_json(silent=True) or {}
        tenant_id = data.get('tenant_id')
    if not tenant_id:
        raise ValueError("tenant_id is required")
    return tenant_id


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'field-standardizer-v2'})


@app.route('/standardize', methods=['POST'])
def standardize_fields():
    """
    Standardize enriched data using LLM
    Per Approach Doc Section 7.6: OpenAI Call #3
    Input: enriched line items
    Output: standardized fields ready for journal entry
    """
    global openai_client
    if not openai_client:
        openai_client = get_openai_client()
    
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json()
        job_id = data.get('job_id')
        
        if not job_id:
            return jsonify({'error': 'job_id required'}), 400
        
        # Update status
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'STANDARDIZING',
            'updated_at': datetime.utcnow().isoformat()
        })
        
        # Get enriched data from all chunks
        chunks_ref = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('chunks')
        chunks = chunks_ref.where('status', '==', 'ENRICHED').stream()
        
        all_enriched_items = []
        for chunk in chunks:
            chunk_data = chunk.to_dict()
            enriched_items = chunk_data.get('enriched_line_items', [])
            all_enriched_items.extend(enriched_items)
        
        if not all_enriched_items:
            # No items to standardize
            db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                'status': 'STANDARDIZED',
                'updated_at': datetime.utcnow().isoformat()
            })
            return jsonify({'success': True, 'items_standardized': 0})
        
        # Get headers from extraction
        extraction_ref = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('extraction').document('main')
        extraction_doc = extraction_ref.get()
        headers = extraction_doc.to_dict().get('headers_raw', {}) if extraction_doc.exists else {}
        
        # Call OpenAI to standardize
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """You are an accounting standardization expert for Indian businesses.
Standardize the invoice data into journal entry format.

For each line item, ensure:
- account_code and account_name are properly formatted
- amounts are numeric values
- GST components (CGST, SGST, IGST) are correctly calculated
- HSN codes are valid 4-8 digit codes

Return JSON with:
- invoice_header: {invoice_number, invoice_date, vendor_name, vendor_gstin, total_amount}
- journal_entries: [{line_number, description, account_code, account_name, debit, credit, hsn_code, tax_rate}]
"""
                },
                {
                    "role": "user",
                    "content": f"Standardize this invoice data:\nHeaders: {json.dumps(headers)}\nLine Items: {json.dumps(all_enriched_items)}"
                }
            ],
            max_tokens=4000
        )
        
        response_text = response.choices[0].message.content
        
        # Parse response
        try:
            if '```json' in response_text:
                json_str = response_text.split('```json')[1].split('```')[0]
            elif '{' in response_text:
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                json_str = response_text[start:end]
            else:
                json_str = response_text
            
            standardized_data = json.loads(json_str)
        except:
            standardized_data = {
                'invoice_header': headers,
                'journal_entries': all_enriched_items
            }
        
        # Store standardized data
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('standardized').document('main').set({
            'invoice_header': standardized_data.get('invoice_header', {}),
            'journal_entries': standardized_data.get('journal_entries', []),
            'standardized_at': datetime.utcnow().isoformat(),
            'token_usage': response.usage.total_tokens if response.usage else 0
        })
        
        # Update job status
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'STANDARDIZED',
            'journal_entries_count': len(standardized_data.get('journal_entries', [])),
            'updated_at': datetime.utcnow().isoformat()
        })
        
        logger.info(f"✅ Standardized job {job_id}: {len(standardized_data.get('journal_entries', []))} entries")
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'journal_entries_count': len(standardized_data.get('journal_entries', []))
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"❌ Standardization failed: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
