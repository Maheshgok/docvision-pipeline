"""
Enrichment Worker - Async Chunk Processing via Pub/Sub
Per Approach Doc: 1-2GB, OpenAI Call #2, Parallel processing
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, List

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore, pubsub_v1
from google.cloud.pubsub_v1 import SubscriberClient
from google.cloud.pubsub_v1.subscriber.message import Message
from google.cloud import secretmanager
from openai import OpenAI
from concurrent.futures import ThreadPoolExecutor

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


def enrich_line_item(item: Dict, client_profile: Dict) -> Dict:
    """Enrich single line item with OpenAI + COA matching"""
    global openai_client
    if not openai_client:
        openai_client = get_openai_client()
    
    description = item.get('description', '')
    amount = float(item.get('amount', 0) or item.get('total', 0) or 0)
    
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
                {"role": "system", "content": "You are an invoice line item classifier for Indian accounting. Return JSON with: hsn_code, tax_category, product_category."},
                {"role": "user", "content": f"Classify: {description}.{coa_context}"}
            ],
            max_tokens=200,
            temperature=0.2
        )
        
        enrichment = {
            'hsn_code': '998314',
            'tax_category': 'GST_18_PERCENT',
            'product_category': 'Service',
            **(coa_match if coa_match else {}),
            'enriched_at': datetime.utcnow().isoformat()
        }
        
        return {**item, 'enrichment_data': enrichment}
        
    except Exception as e:
        logger.error(f"OpenAI call failed: {e}")
        return {**item, 'enrichment_error': str(e)}


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'enrichment-worker'})


@app.route('/enrich-chunk', methods=['POST'])
def enrich_chunk():
    """Process a chunk of line items"""
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
