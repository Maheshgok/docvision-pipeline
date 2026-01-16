"""
Workspace Initialization API for User-Isolated Storage
Handles creation of user-specific bucket structures and workspace setup
"""
import os
import json
import logging
from datetime import datetime
from google.cloud import storage, firestore
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)

# Initialize clients
project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
storage_client = storage.Client(project=project_id)
firestore_client = firestore.Client(project=project_id)

BUCKET_NAME = os.environ.get('BUCKET_NAME', 'watch-mail-trial-invoice-processing')

def verify_auth_token(auth_header):
    """Verify Firebase ID token and return user context"""
    if not auth_header or not auth_header.startswith('Bearer '):
        raise ValueError("Missing or invalid authorization token")
    
    id_token_str = auth_header.split(' ')[1]
    
    try:
        decoded_token = firebase_auth.verify_id_token(id_token_str)
        user_email = decoded_token.get('email')
        user_uid = decoded_token.get('uid')
        
        if not user_email or not user_uid:
            raise ValueError("Invalid token: missing email or UID")
            
        return {
            'email': user_email,
            'uid': user_uid
        }
    except Exception as e:
        raise ValueError(f"Token verification failed: {str(e)}")

def create_user_workspace_structure(user_uid: str, bucket_name: str):
    """Create isolated folder structure for user in GCS bucket"""
    try:
        bucket = storage_client.bucket(bucket_name)
        
        # Create folder structure by creating placeholder files
        folders = [
            f'users/{user_uid}/raw/.gitkeep',
            f'users/{user_uid}/processed/.gitkeep', 
            f'users/{user_uid}/archived/.gitkeep',
            f'users/{user_uid}/temp/.gitkeep'
        ]
        
        for folder_file in folders:
            blob = bucket.blob(folder_file)
            # Only create if doesn't exist
            if not blob.exists():
                blob.upload_from_string('')
                logger.info(f"✅ Created: {folder_file}")
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to create workspace structure: {e}")
        raise

def initialize_workspace_metadata(user_uid: str, user_email: str):
    """Initialize workspace metadata in Firestore"""
    try:
        workspace_data = {
            'user_uid': user_uid,
            'user_email': user_email,
            'workspace_id': f'ws_{user_uid[:8]}',
            'storage_quota_gb': 5,
            'storage_used_mb': 0,
            'initialized_at': datetime.utcnow(),
            'last_accessed': datetime.utcnow(),
            'folder_structure': {
                'raw': f'users/{user_uid}/raw/',
                'processed': f'users/{user_uid}/processed/',
                'archived': f'users/{user_uid}/archived/',
                'temp': f'users/{user_uid}/temp/'
            },
            'settings': {
                'auto_cleanup_days': 30,
                'max_file_size_mb': 50,
                'allowed_file_types': ['pdf', 'png', 'jpg', 'jpeg']
            }
        }
        
        # Store in Firestore under user's document
        doc_ref = firestore_client.collection('users').document(user_uid)
        doc_ref.update({
            'workspace': workspace_data,
            'workspace_initialized': True,
            'updated_at': datetime.utcnow()
        })
        
        logger.info(f"✅ Workspace metadata created for user: {user_email}")
        return workspace_data
        
    except Exception as e:
        logger.error(f"Failed to initialize workspace metadata: {e}")
        raise

def initialize_workspace_endpoint(request, jsonify):
    """Main endpoint for workspace initialization"""
    try:
        # Verify authentication
        auth_header = request.headers.get('Authorization')
        user_context = verify_auth_token(auth_header)
        
        data = request.get_json() or {}
        user_uid = user_context['uid']
        user_email = user_context['email']
        
        # Validate request
        if not user_uid or not user_email:
            return jsonify({'error': 'Missing user information'}), 400
        
        logger.info(f"🏗️ Initializing workspace for user: {user_email} (UID: {user_uid[:8]}...)")
        
        # Check if workspace already exists
        doc_ref = firestore_client.collection('users').document(user_uid)
        doc = doc_ref.get()
        
        if doc.exists and doc.to_dict().get('workspace_initialized'):
            workspace_data = doc.to_dict().get('workspace', {})
            logger.info(f"⚡ Workspace already exists for user: {user_email}")
            return jsonify({
                'status': 'success',
                'message': 'Workspace already initialized',
                'workspaceId': workspace_data.get('workspace_id', f'ws_{user_uid[:8]}'),
                'storageQuota': workspace_data.get('storage_quota_gb', 5),
                'initialized': True,
                'existing': True
            })
        
        # Step 1: Create GCS folder structure
        create_user_workspace_structure(user_uid, BUCKET_NAME)
        
        # Step 2: Initialize Firestore metadata
        workspace_metadata = initialize_workspace_metadata(user_uid, user_email)
        
        logger.info(f"🎉 Workspace initialization completed for user: {user_email}")
        
        return jsonify({
            'status': 'success',
            'message': 'Workspace initialized successfully',
            'workspaceId': workspace_metadata['workspace_id'],
            'storageQuota': workspace_metadata['storage_quota_gb'],
            'initialized': True,
            'existing': False,
            'folderStructure': workspace_metadata['folder_structure']
        })
        
    except ValueError as auth_error:
        logger.error(f"Authentication error: {auth_error}")
        return jsonify({'error': str(auth_error)}), 401
        
    except Exception as e:
        logger.error(f"Workspace initialization failed: {e}", exc_info=True)
        return jsonify({
            'error': 'Failed to initialize workspace',
            'details': str(e)
        }), 500

def get_workspace_status(request, jsonify):
    """Get current workspace status for user"""
    try:
        # Verify authentication
        auth_header = request.headers.get('Authorization')
        user_context = verify_auth_token(auth_header)
        
        user_uid = user_context['uid']
        
        # Get workspace data from Firestore
        doc_ref = firestore_client.collection('users').document(user_uid)
        doc = doc_ref.get()
        
        if not doc.exists:
            return jsonify({'error': 'User not found'}), 404
            
        user_data = doc.to_dict()
        workspace_data = user_data.get('workspace', {})
        
        return jsonify({
            'status': 'success',
            'initialized': user_data.get('workspace_initialized', False),
            'workspace': workspace_data
        })
        
    except ValueError as auth_error:
        return jsonify({'error': str(auth_error)}), 401
        
    except Exception as e:
        logger.error(f"Failed to get workspace status: {e}")
        return jsonify({'error': 'Failed to get workspace status'}), 500

if __name__ == '__main__':
    # This would be integrated into the main initial-api Flask app
    pass