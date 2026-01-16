"""
Archive Manager Cloud Run Service

Handles moving completed invoice results from active collection to archive
for better real-time performance and simplified querying.

Endpoints:
- POST /archive-completed: Archive all completed results for a user
- POST /archive-displayed: Archive all displayed results for a user  
- GET /health: Health check
"""

import os
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

# Initialize Flask app
app = Flask(__name__)

# CORS configuration - permissive for frontend access
allowed_origins = ["*"]  # Allow all origins for now
CORS(app, origins=allowed_origins, supports_credentials=False)

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    # Use default application credentials in Cloud Run
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)

# Initialize Firestore
db = firestore.Client()

# Collections
ACTIVE_COLLECTION = 'invoice_results'
ARCHIVE_COLLECTION = 'invoice_results_archive'

# Environment variables
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT', 'watch-mail-trial')

# Security headers middleware
@app.after_request
def add_security_headers(response):
    """Add security headers to all responses"""
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

def verify_firebase_token(auth_header: str) -> Optional[Dict]:
    """Verify Firebase ID token and return full user context"""
    try:
        if not auth_header:
            print("❌ No authorization header provided")
            return None
            
        if not auth_header.startswith('Bearer '):
            print(f"❌ Invalid authorization header format: {auth_header[:20]}...")
            return None
        
        id_token_str = auth_header.split('Bearer ')[1]
        print(f"🔍 Attempting to verify token for project: {PROJECT_ID}")
        
        # Use Firebase Admin SDK to verify the token
        decoded_token = firebase_auth.verify_id_token(id_token_str)
        
        user_email = decoded_token.get('email')
        user_uid = decoded_token.get('uid')
        
        if not user_email or not user_uid:
            print("❌ Invalid token: missing email or UID")
            return None
            
        # Extract organization information from custom claims if available
        custom_claims = decoded_token.get('custom_claims', {}) or {}
        organization_id = custom_claims.get('organizationId')
        organization_role = custom_claims.get('organizationRole')
        
        user_context = {
            'email': user_email,
            'uid': user_uid,
            'organization_id': organization_id,
            'organization_role': organization_role
        }
        
        print(f"✅ Token verified successfully for user: {user_email} (UID: {user_uid[:8]}...) Org: {organization_id or 'None'}")
        return user_context
    except Exception as e:
        print(f"❌ Token verification failed: {e}")
        print(f"❌ Token verification error type: {type(e)}")
        return None

def get_user_context_from_request() -> Optional[Dict]:
    """Extract full user context from Authorization header"""
    auth_header = request.headers.get('Authorization')
    print(f"🔍 Processing request with auth header: {bool(auth_header)}")
    
    user_context = verify_firebase_token(auth_header)
    
    if not user_context:
        print("❌ No valid user context from token")
        return None
    
    email = user_context.get('email')
    print(f"✅ Authenticated user: {email} (UID: {user_context.get('uid', '')[:8]}...)")
    return user_context

def get_collection_paths(user_context: Dict) -> Dict[str, str]:
    """Get the appropriate collection paths based on user/organization context"""
    user_uid = user_context['uid']
    organization_id = user_context.get('organization_id')
    
    if organization_id:
        # Use organization-scoped collections
        return {
            'active': f'organizations/{organization_id}/invoice_results',
            'archive': f'organizations/{organization_id}/invoice_results_archive'
        }
    elif user_uid:
        # Use user-isolated collections
        return {
            'active': f'users/{user_uid}/invoice_results',
            'archive': f'users/{user_uid}/invoice_results_archive'
        }
    else:
        # Fallback to legacy root collections
        return {
            'active': 'invoice_results',
            'archive': 'invoice_results_archive'
        }

def build_user_query(collection_ref, user_context: Dict, collection_path: str):
    """Build appropriate query filter based on user context and permissions"""
    organization_id = user_context.get('organization_id')
    organization_role = user_context.get('organization_role')
    user_uid = user_context['uid']
    user_email = user_context['email']
    
    # For user-isolated collections (users/{uid}/...), no additional filtering needed
    if collection_path.startswith(f'users/{user_uid}/'):
        print(f"📂 Using user-isolated collection: {collection_path} - no additional filtering needed")
        return collection_ref
    
    # For organization collections, filter based on user permissions
    if organization_id:
        is_admin = organization_role == 'admin'
        if is_admin:
            # Admins can archive all organization data
            return collection_ref.where('organizationId', '==', organization_id)
        else:
            # Regular users can only archive their own data
            return collection_ref.where('organizationId', '==', organization_id)\
                                .where('userUID', '==', user_uid)
    else:
        # For legacy collections, filter by user identifiers
        return collection_ref.where('user_email', '==', user_email)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'archive-manager',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.1',
        'project_id': PROJECT_ID
    })

@app.route('/test-auth', methods=['POST'])
def test_auth():
    """Test authentication endpoint"""
    print("🧪 Test auth request received")
    
    auth_header = request.headers.get('Authorization')
    print(f"🔍 Auth header present: {bool(auth_header)}")
    
    if auth_header:
        print(f"🔍 Auth header format: {auth_header[:20]}...")
    
    user_email = get_user_email_from_request()
    
    return jsonify({
        'authenticated': bool(user_email),
        'user_email': user_email,
        'timestamp': datetime.utcnow().isoformat(),
        'has_auth_header': bool(auth_header)
    })

@app.route('/archive-completed', methods=['POST'])
def archive_completed_results():
    """
    Archive all completed results for the authenticated user
    This moves completed items from active collection to archive
    """
    print("🔄 Archive completed request received")
    
    user_context = get_user_context_from_request()
    if not user_context:
        print("❌ Authentication failed - returning 401")
        return jsonify({'error': 'Authentication required'}), 401
    
    user_email = user_context['email']
    user_uid = user_context['uid']
    print(f"🔍 Processing archive request for user: {user_email} (UID: {user_uid[:8]}...)")
    
    try:
        # Get appropriate collection paths
        collection_paths = get_collection_paths(user_context)
        print(f"📂 Archive paths - Active: {collection_paths['active']}, Archive: {collection_paths['archive']}")
        
        # Query for ALL results (sweep entire active collection for this user)
        active_ref = db.collection(collection_paths['active'])
        all_query = build_user_query(active_ref, user_context, collection_paths['active'])
        
        print(f"🔍 Querying ALL documents in collection: {collection_paths['active']}")
        all_docs = all_query.get()
        
        print(f"📊 Found {len(all_docs)} total documents to archive")
        
        if not all_docs:
            print("ℹ️ No documents to archive - active collection is empty")
            return jsonify({
                'message': 'No documents to archive - active collection is empty',
                'archived_count': 0,
                'user_email': user_email
            })
        
        # Archive documents in batches
        batch = db.batch()
        archived_count = 0
        batch_size = 500  # Firestore batch limit
        
        for doc in all_docs:
            if archived_count >= batch_size:
                # Commit current batch and start new one
                batch.commit()
                batch = db.batch()
                archived_count = 0
            
            # Add document to archive with additional metadata
            doc_data = doc.to_dict()
            doc_data['archived_at'] = datetime.utcnow().isoformat()
            doc_data['archive_reason'] = 'sweep_all_documents'
            doc_data['original_doc_id'] = doc.id
            doc_data['original_collection'] = collection_paths['active']
            
            # Add to archive using organization-aware path
            archive_ref = db.collection(collection_paths['archive']).document()
            batch.set(archive_ref, doc_data)
            
            # Delete from active collection
            batch.delete(doc.reference)
            
            archived_count += 1
        
        # Commit final batch
        if archived_count > 0:
            batch.commit()
        
        print(f"✅ Archived {len(all_docs)} documents for user: {user_email}")
        print(f"📊 Archive summary - From: {collection_paths['active']} → To: {collection_paths['archive']}")
        
        return jsonify({
            'message': 'All documents archived successfully',
            'archived_count': len(all_docs),
            'user_email': user_email,
            'archive_timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Archive error: {e}")
        return jsonify({'error': f'Archive failed: {str(e)}'}), 500

@app.route('/archive-displayed', methods=['POST'])
def archive_displayed_results():
    """
    Archive all displayed results for the authenticated user
    This moves displayed items from active collection to archive
    """
    user_context = get_user_context_from_request()
    if not user_context:
        return jsonify({'error': 'Authentication required'}), 401
    
    user_email = user_context['email']
    user_uid = user_context['uid']
    print(f"📦 Archive displayed request for user: {user_email} (UID: {user_uid[:8]}...)")
    
    try:
        # Get appropriate collection paths
        collection_paths = get_collection_paths(user_context)
        print(f"📂 Archive paths - Active: {collection_paths['active']}, Archive: {collection_paths['archive']}")
        
        # Query for displayed results using organization-aware filtering
        active_ref = db.collection(collection_paths['active'])
        displayed_query = build_user_query(active_ref, user_context, collection_paths['active'])\
                                          .where('frontend_status', '==', 'displayed')
        
        displayed_docs = displayed_query.get()
        
        if not displayed_docs:
            return jsonify({
                'message': 'No displayed results to archive',
                'archived_count': 0,
                'user_email': user_email
            })
        
        # Archive documents in batches
        batch = db.batch()
        archived_count = 0
        batch_size = 500
        
        for doc in displayed_docs:
            if archived_count >= batch_size:
                batch.commit()
                batch = db.batch()
                archived_count = 0
            
            # Add document to archive with metadata
            doc_data = doc.to_dict()
            doc_data['archived_at'] = datetime.utcnow().isoformat()
            doc_data['archive_reason'] = 'displayed_auto_archive'
            doc_data['original_doc_id'] = doc.id
            doc_data['original_collection'] = collection_paths['active']
            
            # Add to archive using organization-aware path
            archive_ref = db.collection(collection_paths['archive']).document()
            batch.set(archive_ref, doc_data)
            
            # Delete from active collection
            batch.delete(doc.reference)
            
            archived_count += 1
        
        # Commit final batch
        if archived_count > 0:
            batch.commit()
        
        print(f"✅ Archived {len(displayed_docs)} displayed results for user: {user_email}")
        print(f"📊 Archive summary - From: {collection_paths['active']} → To: {collection_paths['archive']}")
        
        return jsonify({
            'message': 'Displayed results archived successfully',
            'archived_count': len(displayed_docs),
            'user_email': user_email,
            'archive_timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Archive error: {e}")
        return jsonify({'error': f'Archive failed: {str(e)}'}), 500

@app.route('/archive-all-old', methods=['POST'])
def archive_old_results():
    """
    Archive all results older than specified days for the authenticated user
    Default: 7 days
    """
    user_context = get_user_context_from_request()
    if not user_context:
        return jsonify({'error': 'Authentication required'}), 401
    
    user_email = user_context['email']
    
    # Get days parameter (default 7)
    data = request.get_json() or {}
    days_old = data.get('days_old', 7)
    
    try:
        # Calculate cutoff date
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        cutoff_iso = cutoff_date.isoformat()
        
        # Get appropriate collection paths
        collection_paths = get_collection_paths(user_context)
        
        # Query for old results using organization-aware filtering
        active_ref = db.collection(collection_paths['active'])
        old_query = build_user_query(active_ref, user_context, collection_paths['active'])\
                                   .where('created_at', '<', cutoff_iso)
        
        old_docs = old_query.get()
        
        if not old_docs:
            return jsonify({
                'message': f'No results older than {days_old} days to archive',
                'archived_count': 0,
                'user_email': user_email,
                'cutoff_date': cutoff_iso
            })
        
        # Archive documents
        batch = db.batch()
        archived_count = 0
        
        for doc in old_docs:
            if archived_count >= 500:
                batch.commit()
                batch = db.batch()
                archived_count = 0
            
            # Add document to archive
            doc_data = doc.to_dict()
            doc_data['archived_at'] = datetime.utcnow().isoformat()
            doc_data['archive_reason'] = f'age_based_archive_{days_old}days'
            doc_data['original_doc_id'] = doc.id
            doc_data['original_collection'] = collection_paths['active']
            
            # Add to archive using organization-aware path
            archive_ref = db.collection(collection_paths['archive']).document()
            batch.set(archive_ref, doc_data)
            
            # Delete from active collection
            batch.delete(doc.reference)
            
            archived_count += 1
        
        # Commit final batch
        if archived_count > 0:
            batch.commit()
        
        print(f"✅ Archived {len(old_docs)} old results for user: {user_email}")
        
        return jsonify({
            'message': f'Results older than {days_old} days archived successfully',
            'archived_count': len(old_docs),
            'user_email': user_email,
            'cutoff_date': cutoff_iso,
            'archive_timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Archive error: {e}")
        return jsonify({'error': f'Archive failed: {str(e)}'}), 500

@app.route('/get-archived', methods=['GET'])
def get_archived_results():
    """
    Retrieve archived results for the authenticated user
    Supports pagination and date filtering
    """
    user_context = get_user_context_from_request()
    if not user_context:
        return jsonify({'error': 'Authentication required'}), 401
    
    user_email = user_context['email']
    
    try:
        # Get query parameters
        limit = min(int(request.args.get('limit', 50)), 500)  # Max 500
        page = int(request.args.get('page', 1))
        days_back = int(request.args.get('days_back', 30))  # Default 30 days
        
        # Calculate offset
        offset = (page - 1) * limit
        
        # Date filter
        cutoff_date = datetime.utcnow() - timedelta(days=days_back)
        cutoff_iso = cutoff_date.isoformat()
        
        # Get appropriate collection paths
        collection_paths = get_collection_paths(user_context)
        
        # Query archived results using organization-aware filtering
        archive_ref = db.collection(collection_paths['archive'])
        query = build_user_query(archive_ref, user_context, collection_paths['archive'])\
                               .where('archived_at', '>=', cutoff_iso)\
                               .order_by('archived_at', direction=firestore.Query.DESCENDING)\
                               .limit(limit)\
                               .offset(offset)
        
        archived_docs = query.get()
        
        results = []
        for doc in archived_docs:
            doc_data = doc.to_dict()
            doc_data['archive_doc_id'] = doc.id
            results.append(doc_data)
        
        return jsonify({
            'results': results,
            'count': len(results),
            'page': page,
            'limit': limit,
            'days_back': days_back,
            'user_email': user_email
        })
        
    except Exception as e:
        print(f"❌ Get archived error: {e}")
        return jsonify({'error': f'Failed to retrieve archived results: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(debug=True, host='0.0.0.0', port=port)