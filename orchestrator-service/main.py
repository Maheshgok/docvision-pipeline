"""
Orchestrator Service - Lightweight Job Coordination
Per Approach Doc: 256MB, no LLM, no heavy dependencies

Pipeline: initial-api → orchestrator → data-extractor-v2 → enrichment-worker → field-standardizer-v2
"""

import os
import logging
import requests
import threading
from datetime import datetime
from typing import Dict, Any

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Initialize Firestore client
db = firestore.Client()

PROJECT_ID = os.getenv('PROJECT_ID', 'watch-mail-trial')

# Downstream service URL
DATA_EXTRACTOR_URL = os.getenv(
    'DATA_EXTRACTOR_URL',
    'https://data-extractor-v2-812016027146.asia-south1.run.app'
)


def get_tenant_id(req) -> str:
    """Extract tenant_id from request - required per approach doc"""
    tenant_id = req.headers.get('X-Tenant-ID') or req.args.get('tenant_id')
    if not tenant_id:
        # Try to get from JSON body
        data = req.get_json(silent=True) or {}
        tenant_id = data.get('tenant_id')
    if not tenant_id:
        raise ValueError("tenant_id is required")
    return tenant_id


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'orchestrator'})


@app.route('/jobs/<job_id>/status', methods=['GET'])
def get_job_status(job_id: str):
    """Get job status from Firestore"""
    try:
        tenant_id = get_tenant_id(request)
        
        doc = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).get()
        
        if not doc.exists:
            return jsonify({'error': 'Job not found'}), 404
        
        job_data = doc.to_dict()
        return jsonify({
            'job_id': job_id,
            'status': job_data.get('status'),
            'progress': _calculate_progress(job_data),
            'created_at': job_data.get('created_at'),
            'updated_at': job_data.get('updated_at')
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"❌ Status check failed: {e}")
        return jsonify({'error': 'Status check failed'}), 500


@app.route('/jobs/<job_id>/trigger-extraction', methods=['POST'])
def trigger_extraction(job_id: str):
    """
    Update status to EXTRACTING and trigger data-extractor-v2
    Called by initial-api after file upload to GCS
    """
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json() or {}
        
        gcs_input_path = data.get('gcs_input_path')
        client_id = data.get('client_id')
        
        if not gcs_input_path:
            return jsonify({'error': 'gcs_input_path is required'}), 400
        
        # Update job status to EXTRACTING
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'EXTRACTING',
            'updated_at': datetime.utcnow().isoformat()
        })
        
        logger.info(f"🚀 Triggering extraction for job {job_id}")
        
        # Get auth header to pass downstream
        auth_header = request.headers.get('Authorization')
        
        # Call data-extractor-v2 asynchronously
        def call_data_extractor():
            try:
                extractor_payload = {
                    'job_id': job_id,
                    'gcs_input_path': gcs_input_path,
                    'tenant_id': tenant_id,
                    'client_id': client_id
                }
                
                headers = {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': tenant_id
                }
                if auth_header:
                    headers['Authorization'] = auth_header
                
                resp = requests.post(
                    f"{DATA_EXTRACTOR_URL}/extract",
                    json=extractor_payload,
                    headers=headers,
                    timeout=600
                )
                
                if resp.ok:
                    logger.info(f"✅ Data extractor started for job {job_id}")
                else:
                    logger.error(f"❌ Data extractor failed for {job_id}: {resp.status_code}")
                    db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                        'status': 'FAILED',
                        'error': f"Extraction failed: {resp.status_code}",
                        'updated_at': datetime.utcnow().isoformat()
                    })
            except Exception as e:
                logger.error(f"❌ Failed to call data extractor for {job_id}: {e}")
                db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                    'status': 'FAILED',
                    'error': str(e),
                    'updated_at': datetime.utcnow().isoformat()
                })
        
        # Start extraction in background thread
        threading.Thread(target=call_data_extractor, daemon=True).start()
        
        return jsonify({'success': True, 'status': 'EXTRACTING'})
        
    except Exception as e:
        logger.error(f"❌ Trigger extraction failed: {e}")
        return jsonify({'error': 'Trigger failed'}), 500


@app.route('/jobs/<job_id>/update-status', methods=['POST'])
def update_status(job_id: str):
    """Generic status update endpoint for downstream services"""
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json() or {}
        new_status = data.get('status')
        
        if not new_status:
            return jsonify({'error': 'status is required'}), 400
        
        update_data = {
            'status': new_status,
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Add any additional data passed
        if data.get('line_items_count'):
            update_data['line_items_count'] = data.get('line_items_count')
        if data.get('chunks_total'):
            update_data['chunks_total'] = data.get('chunks_total')
        if data.get('chunks_completed'):
            update_data['chunks_completed'] = data.get('chunks_completed')
        if data.get('journal_entries_count'):
            update_data['journal_entries_count'] = data.get('journal_entries_count')
        
        # Add error info if FAILED
        if new_status == 'FAILED' and data.get('error'):
            update_data['error'] = data.get('error')
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update(update_data)
        
        logger.info(f"📝 Updated job {job_id} status to {new_status}")
        return jsonify({'success': True, 'status': new_status})
        
    except Exception as e:
        logger.error(f"❌ Status update failed: {e}")
        return jsonify({'error': 'Update failed'}), 500


@app.route('/jobs/<job_id>/complete', methods=['POST'])
def complete_job(job_id: str):
    """Mark job as completed with final results"""
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json() or {}
        
        update_data = {
            'status': 'COMPLETED',
            'completed_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Add final counts
        if data.get('journal_entries_count'):
            update_data['journal_entries_count'] = data.get('journal_entries_count')
        if data.get('total_amount'):
            update_data['total_amount'] = data.get('total_amount')
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update(update_data)
        
        logger.info(f"✅ Completed job {job_id}")
        return jsonify({'success': True, 'status': 'COMPLETED'})
        
    except Exception as e:
        logger.error(f"❌ Job completion failed: {e}")
        return jsonify({'error': 'Completion failed'}), 500


def _calculate_progress(job_data: Dict[str, Any]) -> int:
    """Calculate progress percentage based on status"""
    status = job_data.get('status', 'CREATED')
    progress_map = {
        'CREATED': 0,
        'UPLOADING': 10,
        'EXTRACTING': 25,
        'EXTRACTED': 40,
        'DISPATCHED': 50,
        'ENRICHING': 60,
        'ENRICHED': 75,
        'STANDARDIZING': 85,
        'STANDARDIZED': 95,
        'COMPLETED': 100,
        'FAILED': 0
    }
    return progress_map.get(status, 0)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
