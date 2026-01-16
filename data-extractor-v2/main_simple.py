"""
Data Extractor V2 - OpenAI Vision Invoice Extraction
Per Approach Doc: 512MB, OpenAI Call #1
"""

import os
import json
import logging
import base64
from datetime import datetime
from typing import Dict, Any

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore, storage, secretmanager
from openai import OpenAI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

db = firestore.Client()
storage_client = storage.Client()
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
    return jsonify({'status': 'healthy', 'service': 'data-extractor-v2'})


@app.route('/extract', methods=['POST'])
def extract_invoice():
    """
    Extract data from invoice using OpenAI Vision
    Per Approach Doc Section 7.3: OpenAI Call #1
    Output: headers_raw + line_items_raw
    """
    global openai_client
    if not openai_client:
        openai_client = get_openai_client()
    
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json()
        job_id = data.get('job_id')
        gcs_path = data.get('gcs_input_path')
        
        if not job_id or not gcs_path:
            return jsonify({'error': 'job_id and gcs_input_path required'}), 400
        
        # Update job status to EXTRACTING
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'EXTRACTING',
            'updated_at': datetime.utcnow().isoformat()
        })
        
        # Download file from GCS
        bucket_name = gcs_path.split('/')[2]
        blob_path = '/'.join(gcs_path.split('/')[3:])
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        file_content = blob.download_as_bytes()
        
        # Encode for OpenAI Vision
        base64_content = base64.b64encode(file_content).decode('utf-8')
        
        # Call OpenAI Vision API
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": """You are an invoice data extraction expert. Extract all data from the invoice.
Return JSON with:
- headers_raw: {invoice_number, invoice_date, vendor_name, vendor_gstin, buyer_name, buyer_gstin, total_amount, tax_amount}
- line_items_raw: [{description, quantity, unit_price, amount, hsn_code, tax_rate}]"""
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract all data from this invoice:"},
                        {"type": "image_url", "image_url": {"url": f"data:application/pdf;base64,{base64_content}"}}
                    ]
                }
            ],
            max_tokens=4000
        )
        
        # Parse response
        response_text = response.choices[0].message.content
        
        # Try to extract JSON from response
        try:
            # Look for JSON in response
            if '```json' in response_text:
                json_str = response_text.split('```json')[1].split('```')[0]
            elif '{' in response_text:
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                json_str = response_text[start:end]
            else:
                json_str = response_text
            
            extracted_data = json.loads(json_str)
        except:
            extracted_data = {
                'headers_raw': {'raw_text': response_text},
                'line_items_raw': []
            }
        
        # Store extraction at: tenants/{tenant_id}/jobs/{job_id}/extraction/main
        extraction_doc = {
            'headers_raw': extracted_data.get('headers_raw', {}),
            'line_items_raw': extracted_data.get('line_items_raw', []),
            'extracted_at': datetime.utcnow().isoformat(),
            'token_usage': response.usage.total_tokens if response.usage else 0
        }
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('extraction').document('main').set(extraction_doc)
        
        # Update job status
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'EXTRACTED',
            'line_items_count': len(extracted_data.get('line_items_raw', [])),
            'updated_at': datetime.utcnow().isoformat()
        })
        
        logger.info(f"✅ Extracted job {job_id}: {len(extracted_data.get('line_items_raw', []))} line items")
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'line_items_count': len(extracted_data.get('line_items_raw', []))
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"❌ Extraction failed: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
