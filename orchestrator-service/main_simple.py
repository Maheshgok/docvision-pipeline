"""
Orchestrator Service - Lightweight Job Coordination
Per Approach Doc: 256MB, no LLM, no heavy dependencies
"""

import os
import uuid
import logging
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


@app.route('/jobs', methods=['POST'])
def create_job():
    """
    Create new processing job
    Per Approach Doc Section 7.2:
    - Generate job_id
    - Initialize Firestore job document
    - Set initial job status
    """
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json() or {}
        
        # Generate unique job ID
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        
        # Create job document at: tenants/{tenant_id}/jobs/{job_id}
        job_doc = {
            'status': 'CREATED',
            'created_at': datetime.utcnow().isoformat(),
            'gcs_input_path': data.get('gcs_input_path'),
            'original_filename': data.get('original_filename'),
            'file_size_bytes': data.get('file_size_bytes'),
            'tenant_id': tenant_id,
            'user_id': data.get('user_id'),
            'client_id': data.get('client_id')  # For COA lookup during enrichment
        }
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).set(job_doc)
        
        logger.info(f"✅ Created job {job_id} for tenant {tenant_id}")
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'tenant_id': tenant_id,
            'status': 'CREATED'
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"❌ Job creation failed: {e}")
        return jsonify({'error': 'Job creation failed'}), 500


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
    """Update status to EXTRACTING - extraction service polls for this"""
    try:
        tenant_id = get_tenant_id(request)
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'EXTRACTING',
            'updated_at': datetime.utcnow().isoformat()
        })
        
        logger.info(f"🚀 Triggered extraction for job {job_id}")
        return jsonify({'success': True, 'status': 'EXTRACTING'})
        
    except Exception as e:
        logger.error(f"❌ Trigger extraction failed: {e}")
        return jsonify({'error': 'Trigger failed'}), 500


@app.route('/jobs/<job_id>/update-status', methods=['POST'])
def update_status(job_id: str):
    """Generic status update endpoint"""
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
        
        # Optional: add error info if FAILED
        if new_status == 'FAILED' and data.get('error'):
            update_data['error'] = data.get('error')
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update(update_data)
        
        return jsonify({'success': True, 'status': new_status})
        
    except Exception as e:
        logger.error(f"❌ Status update failed: {e}")
        return jsonify({'error': 'Update failed'}), 500


def _calculate_progress(job_data: Dict[str, Any]) -> int:
    """Calculate progress percentage based on status"""
    status = job_data.get('status', 'CREATED')
    progress_map = {
        'CREATED': 0,
        'EXTRACTING': 20,
        'ENRICHING': 50,
        'STANDARDIZING': 80,
        'COMBINING': 90,
        'COMPLETED': 100,
        'FAILED': 0
    }
    return progress_map.get(status, 0)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
