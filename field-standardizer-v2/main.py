"""
Field Standardizer V2 - Standardize extracted fields using LLM
Per Approach Doc: 1GB, OpenAI Call #3
"""

import os
import json
import logging
import requests
import threading
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

# Service URL for data-combiner (final step)
DATA_COMBINER_URL = os.getenv(
    'DATA_COMBINER_URL',
    'https://data-combiner-812016027146.asia-south1.run.app'
)


def get_openai_client() -> OpenAI:
    """Get OpenAI client with API key from Secret Manager"""
    try:
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{PROJECT_ID}/secrets/openai-api-key-secret/versions/latest"
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
    Marks job as COMPLETED when done.
    """
    global openai_client
    if not openai_client:
        openai_client = get_openai_client()
    
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json()
        job_id = data.get('job_id')
        
        # Accept enriched items directly from request or fetch from Firestore
        enriched_line_items = data.get('enriched_line_items', [])
        headers_raw = data.get('headers_raw', {})
        
        logger.info(f"🔍 STANDARDIZER DEBUG: Received job {job_id}")
        logger.info(f"🔍 STANDARDIZER DEBUG: enriched_line_items count: {len(enriched_line_items)}")
        logger.info(f"🔍 STANDARDIZER DEBUG: headers_raw: {json.dumps(headers_raw, default=str)[:500]}")
        if enriched_line_items:
            logger.info(f"🔍 STANDARDIZER DEBUG: First item structure: {json.dumps(enriched_line_items[0], default=str)[:1000]}")
        
        if not job_id:
            return jsonify({'error': 'job_id required'}), 400
        
        # Update status
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'STANDARDIZING',
            'updated_at': datetime.utcnow().isoformat()
        })
        
        # If enriched items not passed, fetch from Firestore
        if not enriched_line_items:
            # Try enrichment/main first (new format)
            enrichment_doc = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('enrichment').document('main').get()
            if enrichment_doc.exists:
                enriched_line_items = enrichment_doc.to_dict().get('enriched_line_items', [])
            else:
                # Fallback to chunks collection (legacy format)
                chunks_ref = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('chunks')
                chunks = chunks_ref.where('status', '==', 'ENRICHED').stream()
                for chunk in chunks:
                    chunk_data = chunk.to_dict()
                    items = chunk_data.get('enriched_line_items', [])
                    enriched_line_items.extend(items)
        
        # If headers not passed, fetch from Firestore
        if not headers_raw:
            extraction_doc = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('extraction').document('main').get()
            if extraction_doc.exists:
                headers_raw = extraction_doc.to_dict().get('headers_raw', {})
        
        if not enriched_line_items:
            # No items to standardize - mark as completed
            db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                'status': 'COMPLETED',
                'completed_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            })
            return jsonify({'success': True, 'items_standardized': 0, 'status': 'COMPLETED'})
        
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
                    "content": f"Standardize this invoice data:\nHeaders: {json.dumps(headers_raw)}\nLine Items: {json.dumps(enriched_line_items)}"
                }
            ],
            max_tokens=4000
        )
        
        response_text = response.choices[0].message.content
        
        logger.info(f"🔍 STANDARDIZER DEBUG: LLM response length: {len(response_text)}")
        logger.info(f"🔍 STANDARDIZER DEBUG: LLM raw response: {response_text[:2000]}")
        
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
            logger.info(f"🔍 STANDARDIZER DEBUG: Parsed standardized_data keys: {list(standardized_data.keys())}")
        except Exception as parse_err:
            logger.warning(f"⚠️ STANDARDIZER DEBUG: JSON parse failed: {parse_err}, using fallback")
            standardized_data = {
                'invoice_header': headers_raw,
                'journal_entries': enriched_line_items
            }
        
        journal_entries = standardized_data.get('journal_entries', [])
        
        logger.info(f"🔍 STANDARDIZER DEBUG: journal_entries count: {len(journal_entries)}")
        if journal_entries:
            logger.info(f"🔍 STANDARDIZER DEBUG: First journal entry: {json.dumps(journal_entries[0], default=str)[:1000]}")
        
        # Store standardized data in job subcollection
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('standardized').document('main').set({
            'invoice_header': standardized_data.get('invoice_header', {}),
            'journal_entries': journal_entries,
            'standardized_at': datetime.utcnow().isoformat(),
            'token_usage': response.usage.total_tokens if response.usage else 0
        })
        
        # Get original job data for the result document
        job_doc = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).get()
        job_data = job_doc.to_dict() if job_doc.exists else {}
        
        # Update job status to COMBINING
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'COMBINING',
            'updated_at': datetime.utcnow().isoformat()
        })
        
        logger.info(f"✅ Standardized job {job_id}: {len(journal_entries)} entries, calling data-combiner")
        
        # Call data-combiner to finalize and write to datastore
        auth_header = request.headers.get('Authorization')
        
        def call_data_combiner():
            try:
                combiner_payload = {
                    'job_id': job_id,
                    'processed_data': {
                        'standardized_header': standardized_data.get('invoice_header', {}),
                        'standardized_journal_entries': journal_entries
                    },
                    'user_context': {
                        'uid': tenant_id,
                        'email': job_data.get('user_email', ''),
                        'filename': job_data.get('original_filename', 'unknown')
                    },
                    'job_metadata': {
                        'gcs_input_path': job_data.get('gcs_input_path', ''),
                        'created_at': job_data.get('created_at', datetime.utcnow().isoformat())
                    }
                }
                
                headers = {'Content-Type': 'application/json'}
                if auth_header:
                    headers['Authorization'] = auth_header
                
                resp = requests.post(
                    f"{DATA_COMBINER_URL}/combine-and-store",
                    json=combiner_payload,
                    headers=headers,
                    timeout=120
                )
                
                if resp.ok:
                    logger.info(f"✅ Data-combiner completed for job {job_id}")
                    # Mark job as COMPLETED
                    db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                        'status': 'COMPLETED',
                        'journal_entries_count': len(journal_entries),
                        'completed_at': datetime.utcnow().isoformat(),
                        'updated_at': datetime.utcnow().isoformat()
                    })
                else:
                    logger.error(f"❌ Data-combiner failed for {job_id}: {resp.status_code}")
                    db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                        'status': 'COMBINER_FAILED',
                        'error': f"Combiner failed: {resp.status_code}",
                        'updated_at': datetime.utcnow().isoformat()
                    })
            except Exception as e:
                logger.error(f"❌ Failed to call data-combiner for {job_id}: {e}")
                db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                    'status': 'COMBINER_FAILED',
                    'error': str(e),
                    'updated_at': datetime.utcnow().isoformat()
                })
        
        # Call combiner asynchronously
        threading.Thread(target=call_data_combiner, daemon=True).start()
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'status': 'COMBINING',
            'journal_entries_count': len(journal_entries),
            'combiner_triggered': True
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"❌ Standardization failed: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)