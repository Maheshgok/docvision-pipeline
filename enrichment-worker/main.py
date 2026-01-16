"""
Enrichment Worker - Line Item Enrichment with COA Matching
Per Approach Doc: 1-2GB, OpenAI Call #2
After enrichment, triggers field-standardizer-v2 for final processing.
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
from google.cloud import firestore
from google.cloud import secretmanager
from openai import OpenAI
from concurrent.futures import ThreadPoolExecutor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

db = firestore.Client()
PROJECT_ID = os.getenv('PROJECT_ID', 'watch-mail-trial')

# Service URL for pipeline chaining
FIELD_STANDARDIZER_URL = os.getenv(
    'FIELD_STANDARDIZER_URL',
    'https://field-standardizer-v2-812016027146.asia-south1.run.app'
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
        # Fallback to env var
        return OpenAI(api_key=os.getenv('OPENAI_API_KEY'))


# Initialize clients
openai_client = None
executor = ThreadPoolExecutor(max_workers=5)


def get_client_profile(tenant_id: str, client_id: str) -> Dict[str, Any]:
    """Fetch client profile with Chart of Accounts"""
    if not client_id:
        return {}
    try:
        doc = db.collection('users').document(tenant_id).collection('client_organizations').document(client_id).get()
        return doc.to_dict() if doc.exists else {}
    except Exception as e:
        logger.error(f"Failed to fetch client profile: {e}")
        return {}


def match_account_from_coa(description: str, amount: float, coa: List[Dict], cap_threshold: float) -> Dict[str, Any]:
    """Match line item to Chart of Accounts using keywords"""
    if not coa:
        return {}
    
    desc_lower = description.lower()
    best_match = None
    best_score = 0
    
    for account in coa:
        if not account.get('is_active', True):
            continue
        score = 0
        for kw in account.get('keywords', []):
            if kw.lower() in desc_lower:
                score += 10
        if score > best_score:
            best_score = score
            best_match = account
    
    if best_match:
        return {
            'account_code': best_match.get('account_code'),
            'account_name': best_match.get('account_name'),
            'account_type': best_match.get('account_type'),
            'match_score': best_score,
            'is_capitalizable': amount >= cap_threshold if cap_threshold > 0 else False
        }
    return {}


def parse_amount(value) -> float:
    """Parse amount string handling commas, currency symbols, etc."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    # Remove commas, currency symbols, spaces
    cleaned = str(value).replace(',', '').replace('₹', '').replace('$', '').replace(' ', '').strip()
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def enrich_line_item(item: Dict, client_profile: Dict) -> Dict:
    """Enrich single line item with OpenAI + COA matching"""
    global openai_client
    if not openai_client:
        openai_client = get_openai_client()
    
    description = item.get('description', '')
    amount = parse_amount(item.get('amount') or item.get('total') or 0)
    
    # Try COA match first
    coa = client_profile.get('chart_of_accounts', [])
    cap_threshold = client_profile.get('capitalization_threshold', 0)
    coa_match = match_account_from_coa(description, amount, coa, cap_threshold)
    
    # Build context for OpenAI
    coa_context = ""
    if coa:
        coa_summary = ", ".join([f"{a['account_code']}:{a['account_name']}" for a in coa[:10] if a.get('is_active')])
        coa_context = f" Available accounts: {coa_summary}"
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": """You are an invoice line item classifier for Indian accounting.
For each line item, provide classification AND balanced journal entry with debit/credit.

Return JSON with:
- hsn_code: HSN/SAC code (4-8 digits)
- tax_category: GST rate (e.g. GST_18_PERCENT, GST_5_PERCENT)
- product_category: Service, Goods, or specific category
- account_code: GL account code if available
- account_name: GL account name
- journal_entry: {
    "entries": [
      {"account": "Expense Account", "debit": amount, "credit": 0},
      {"account": "CGST Input", "debit": cgst_amount, "credit": 0},
      {"account": "SGST Input", "debit": sgst_amount, "credit": 0},
      {"account": "Vendor Payable", "debit": 0, "credit": total_with_tax}
    ]
  }
Ensure total debits = total credits for balanced entry."""},
                {"role": "user", "content": f"Classify and create balanced journal entry for: {description}, Amount: {amount}.{coa_context}"}
            ],
            max_tokens=500,
            temperature=0.2
        )
        
        # Parse OpenAI response
        response_text = response.choices[0].message.content
        try:
            if '```json' in response_text:
                json_str = response_text.split('```json')[1].split('```')[0]
            elif '{' in response_text:
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                json_str = response_text[start:end]
            else:
                json_str = response_text
            ai_result = json.loads(json_str)
        except:
            ai_result = {}
        
        enrichment = {
            'hsn_code': ai_result.get('hsn_code', '998314'),
            'tax_category': ai_result.get('tax_category', 'GST_18_PERCENT'),
            'product_category': ai_result.get('product_category', 'Service'),
            'account_code': ai_result.get('account_code') or (coa_match.get('account_code') if coa_match else None),
            'account_name': ai_result.get('account_name') or (coa_match.get('account_name') if coa_match else None),
            'journal_entry': ai_result.get('journal_entry', {}),
            **(coa_match if coa_match else {}),
            'enriched_at': datetime.utcnow().isoformat()
        }
        
        # Calculate and add is_balanced flag for the journal entry
        journal_entry = enrichment.get('journal_entry', {})
        entries = journal_entry.get('entries', [])
        total_debit = sum(float(e.get('debit', 0) or 0) for e in entries)
        total_credit = sum(float(e.get('credit', 0) or 0) for e in entries)
        is_balanced = abs(total_debit - total_credit) < 0.01
        
        enrichment['is_balanced'] = is_balanced
        enrichment['total_debit'] = round(total_debit, 2)
        enrichment['total_credit'] = round(total_credit, 2)
        
        if not is_balanced:
            logger.warning(f"⚠️ Unbalanced entry for '{description}': debit={total_debit}, credit={total_credit}")
        
        return {**item, 'enrichment_data': enrichment}
        
    except Exception as e:
        logger.error(f"OpenAI call failed: {e}")
        return {**item, 'enrichment_error': str(e)}


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'enrichment-worker'})


@app.route('/enrich-job', methods=['POST'])
def enrich_job():
    """
    Process all line items for a job - called by data-extractor-v2
    After enrichment, triggers field-standardizer-v2
    """
    try:
        data = request.get_json()
        tenant_id = data.get('tenant_id')
        job_id = data.get('job_id')
        client_id = data.get('client_id')
        line_items = data.get('line_items', [])
        
        if not tenant_id or not job_id:
            return jsonify({'error': 'tenant_id and job_id required'}), 400
        
        # Update job status to ENRICHING
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'ENRICHING',
            'updated_at': datetime.utcnow().isoformat()
        })
        
        # Get client profile for COA matching
        client_profile = get_client_profile(tenant_id, client_id)
        
        # Enrich each line item
        enriched_items = [enrich_line_item(item, client_profile) for item in line_items]
        
        # Debug logging
        logger.info(f"🔍 ENRICHMENT DEBUG: Enriched {len(enriched_items)} items for job {job_id}")
        for idx, item in enumerate(enriched_items):
            logger.info(f"🔍 ENRICHMENT DEBUG: Item {idx} keys: {list(item.keys())}")
            enrichment_data = item.get('enrichment_data', {})
            if enrichment_data:
                logger.info(f"🔍 ENRICHMENT DEBUG: Item {idx} enrichment_data keys: {list(enrichment_data.keys())}")
                journal_entry = enrichment_data.get('journal_entry', {})
                entries = journal_entry.get('entries', [])
                logger.info(f"🔍 ENRICHMENT DEBUG: Item {idx} has {len(entries)} journal entries")
                logger.info(f"🔍 ENRICHMENT DEBUG: Item {idx} is_balanced={enrichment_data.get('is_balanced')}, total_debit={enrichment_data.get('total_debit')}, total_credit={enrichment_data.get('total_credit')}")
        
        # Store enriched data in Firestore
        enrichment_doc = {
            'enriched_line_items': enriched_items,
            'client_id': client_id,
            'items_count': len(enriched_items),
            'completed_at': datetime.utcnow().isoformat()
        }
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('enrichment').document('main').set(enrichment_doc)
        
        # Update job status to ENRICHED
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'ENRICHED',
            'updated_at': datetime.utcnow().isoformat()
        })
        
        logger.info(f"✅ Enriched job {job_id}: {len(enriched_items)} items")
        
        # Trigger field-standardizer for final processing
        auth_header = request.headers.get('Authorization')
        
        def call_field_standardizer():
            try:
                # Get headers from extraction
                extraction_doc = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('extraction').document('main').get()
                headers_raw = extraction_doc.to_dict().get('headers_raw', {}) if extraction_doc.exists else {}
                
                standardizer_payload = {
                    'tenant_id': tenant_id,
                    'job_id': job_id,
                    'headers_raw': headers_raw,
                    'enriched_line_items': enriched_items
                }
                
                headers = {'Content-Type': 'application/json'}
                if auth_header:
                    headers['Authorization'] = auth_header
                
                resp = requests.post(
                    f"{FIELD_STANDARDIZER_URL}/standardize",
                    json=standardizer_payload,
                    headers=headers,
                    timeout=600
                )
                
                if resp.ok:
                    logger.info(f"✅ Standardization triggered for job {job_id}")
                else:
                    logger.error(f"❌ Standardization trigger failed for {job_id}: {resp.status_code}")
                    db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                        'status': 'STANDARDIZATION_FAILED',
                        'error': f"Standardization trigger failed: {resp.status_code}",
                        'updated_at': datetime.utcnow().isoformat()
                    })
            except Exception as e:
                logger.error(f"❌ Failed to trigger standardization for {job_id}: {e}")
                db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                    'status': 'STANDARDIZATION_FAILED',
                    'error': str(e),
                    'updated_at': datetime.utcnow().isoformat()
                })
        
        # Call standardizer asynchronously
        threading.Thread(target=call_field_standardizer, daemon=True).start()
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'items_enriched': len(enriched_items),
            'standardization_triggered': True
        })
        
    except Exception as e:
        logger.error(f"❌ Job enrichment failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/enrich-chunk', methods=['POST'])
def enrich_chunk():
    """Process a chunk of line items (legacy endpoint)"""
    try:
        data = request.get_json()
        tenant_id = data.get('tenant_id')
        job_id = data.get('job_id')
        chunk_id = data.get('chunk_id')
        client_id = data.get('client_id')
        line_items = data.get('line_items', [])
        
        if not tenant_id or not job_id:
            return jsonify({'error': 'tenant_id and job_id required'}), 400
        
        # Get client profile for COA
        client_profile = get_client_profile(tenant_id, client_id)
        
        # Enrich each line item
        enriched_items = [enrich_line_item(item, client_profile) for item in line_items]
        
        # Store enriched chunk in Firestore
        chunk_doc = {
            'chunk_id': chunk_id,
            'status': 'COMPLETED',
            'enriched_line_items': enriched_items,
            'completed_at': datetime.utcnow().isoformat()
        }
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('enriched_chunks').document(chunk_id).set(chunk_doc)
        
        logger.info(f"✅ Enriched chunk {chunk_id}: {len(enriched_items)} items")
        
        return jsonify({'success': True, 'chunk_id': chunk_id, 'items_processed': len(enriched_items)})
        
    except Exception as e:
        logger.error(f"❌ Chunk enrichment failed: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
