"""
Data Extractor V2 - OpenAI Vision Invoice Extraction
Per Approach Doc: 512MB, OpenAI Call #1
After extraction, triggers enrichment-worker for next pipeline step.
"""

import os
import io
import json
import logging
import base64
import mimetypes
import requests
import threading
from datetime import datetime
from typing import Dict, Any, Tuple

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore, storage, secretmanager
from openai import OpenAI
from pdf2image import convert_from_bytes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

db = firestore.Client()
storage_client = storage.Client()
PROJECT_ID = os.getenv('PROJECT_ID', 'watch-mail-trial')

# Service URLs for pipeline chaining
ENRICHMENT_WORKER_URL = os.getenv(
    'ENRICHMENT_WORKER_URL',
    'https://enrichment-worker-812016027146.asia-south1.run.app'
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


def detect_mime_type(file_content: bytes, filename: str = '') -> str:
    """Detect MIME type from file content or filename"""
    # Check magic bytes first
    if file_content[:4] == b'%PDF':
        return 'application/pdf'
    elif file_content[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    elif file_content[:2] == b'\xff\xd8':
        return 'image/jpeg'
    elif file_content[:4] == b'GIF8':
        return 'image/gif'
    elif file_content[:4] == b'RIFF' and file_content[8:12] == b'WEBP':
        return 'image/webp'
    
    # Fallback to filename extension
    if filename:
        mime_type, _ = mimetypes.guess_type(filename)
        if mime_type:
            return mime_type
    
    # Default to jpeg for unknown images
    return 'image/jpeg'


def prepare_image_for_openai(file_content: bytes, filename: str = '') -> Tuple[str, str]:
    """
    Prepare image content for OpenAI Vision API.
    Returns (base64_content, mime_type)
    For PDFs, converts first page to PNG.
    """
    mime_type = detect_mime_type(file_content, filename)
    
    if mime_type == 'application/pdf':
        # Convert PDF first page to PNG
        logger.info("📄 Converting PDF to image for OpenAI Vision")
        try:
            images = convert_from_bytes(file_content, first_page=1, last_page=1, dpi=200)
            if images:
                img_buffer = io.BytesIO()
                images[0].save(img_buffer, format='PNG')
                img_buffer.seek(0)
                return base64.b64encode(img_buffer.getvalue()).decode('utf-8'), 'image/png'
        except Exception as e:
            logger.error(f"PDF conversion failed: {e}")
            raise ValueError(f"Failed to convert PDF to image: {e}")
    
    # For regular images, just encode
    return base64.b64encode(file_content).decode('utf-8'), mime_type


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
        
        # Prepare image for OpenAI Vision (handles PDF conversion)
        filename = blob_path.split('/')[-1] if blob_path else ''
        base64_content, mime_type = prepare_image_for_openai(file_content, filename)
        logger.info(f"📷 Prepared image for OpenAI: {mime_type}")
        
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
                        {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_content}"}}
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
        
        line_items_count = len(extracted_data.get('line_items_raw', []))
        logger.info(f"✅ Extracted job {job_id}: {line_items_count} line items")
        
        # Trigger enrichment-worker for next pipeline step
        auth_header = request.headers.get('Authorization')
        client_id = data.get('client_id')
        
        def call_enrichment_worker():
            try:
                enrichment_payload = {
                    'tenant_id': tenant_id,
                    'job_id': job_id,
                    'client_id': client_id,
                    'line_items': extracted_data.get('line_items_raw', [])
                }
                
                headers = {'Content-Type': 'application/json'}
                if auth_header:
                    headers['Authorization'] = auth_header
                
                resp = requests.post(
                    f"{ENRICHMENT_WORKER_URL}/enrich-job",
                    json=enrichment_payload,
                    headers=headers,
                    timeout=600
                )
                
                if resp.ok:
                    logger.info(f"✅ Enrichment triggered for job {job_id}")
                else:
                    logger.error(f"❌ Enrichment trigger failed for {job_id}: {resp.status_code}")
                    db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                        'status': 'ENRICHMENT_FAILED',
                        'error': f"Enrichment trigger failed: {resp.status_code}",
                        'updated_at': datetime.utcnow().isoformat()
                    })
            except Exception as e:
                logger.error(f"❌ Failed to trigger enrichment for {job_id}: {e}")
                db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                    'status': 'ENRICHMENT_FAILED',
                    'error': str(e),
                    'updated_at': datetime.utcnow().isoformat()
                })
        
        # Call enrichment asynchronously
        threading.Thread(target=call_enrichment_worker, daemon=True).start()
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'line_items_count': line_items_count,
            'enrichment_triggered': True
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"❌ Extraction failed: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
