"""
Chunk Dispatcher - Distributes line items into processing batches
Per Approach Doc: 256MB, No LLM (orchestration only)
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, List

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore, pubsub_v1

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

db = firestore.Client()
publisher = pubsub_v1.PublisherClient()
PROJECT_ID = os.getenv('PROJECT_ID', 'watch-mail-trial')


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
    return jsonify({'status': 'healthy', 'service': 'chunk-dispatcher'})


@app.route('/dispatch', methods=['POST'])
def dispatch_chunks():
    """
    Dispatch line items into processing chunks
    Per Approach Doc Section 7.4: Chunk Dispatcher (no LLM)
    Creates chunks of ~5-10 line items each for parallel processing
    """
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json()
        job_id = data.get('job_id')
        chunk_size = data.get('chunk_size', 5)  # Default 5 items per chunk
        
        if not job_id:
            return jsonify({'error': 'job_id required'}), 400
        
        # Get extraction data
        extraction_ref = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('extraction').document('main')
        extraction_doc = extraction_ref.get()
        
        if not extraction_doc.exists:
            return jsonify({'error': 'Extraction not found'}), 404
        
        extraction_data = extraction_doc.to_dict()
        line_items = extraction_data.get('line_items_raw', [])
        
        if not line_items:
            # No line items to process
            db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                'status': 'DISPATCHED',
                'chunks_total': 0,
                'chunks_completed': 0,
                'updated_at': datetime.utcnow().isoformat()
            })
            return jsonify({'success': True, 'chunks_created': 0})
        
        # Create chunks
        chunks = []
        for i in range(0, len(line_items), chunk_size):
            chunk = line_items[i:i + chunk_size]
            chunk_id = f"chunk_{i // chunk_size}"
            chunks.append({
                'chunk_id': chunk_id,
                'line_items': chunk,
                'start_index': i,
                'end_index': min(i + chunk_size, len(line_items))
            })
        
        # Store chunks and dispatch to PubSub
        topic_path = publisher.topic_path(PROJECT_ID, 'enrichment-queue')
        
        for chunk in chunks:
            # Store chunk in Firestore
            db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('chunks').document(chunk['chunk_id']).set({
                'line_items': chunk['line_items'],
                'status': 'PENDING',
                'created_at': datetime.utcnow().isoformat()
            })
            
            # Publish to enrichment queue
            message = {
                'tenant_id': tenant_id,
                'job_id': job_id,
                'chunk_id': chunk['chunk_id']
            }
            
            try:
                publisher.publish(topic_path, json.dumps(message).encode('utf-8'))
                logger.info(f"📤 Published {chunk['chunk_id']} for job {job_id}")
            except Exception as e:
                logger.warning(f"PubSub publish failed: {e}")
        
        # Update job status
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'DISPATCHED',
            'chunks_total': len(chunks),
            'chunks_completed': 0,
            'updated_at': datetime.utcnow().isoformat()
        })
        
        logger.info(f"✅ Dispatched {len(chunks)} chunks for job {job_id}")
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'chunks_created': len(chunks),
            'total_line_items': len(line_items)
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"❌ Dispatch failed: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
