"""
Shared Authentication Utilities
Handles tenant and user validation for multi-tenant SaaS architecture
"""

import os
import json
import logging
from typing import Dict, Any, Optional, Tuple
from functools import wraps

# Lazy import firebase_admin - only needed for token verification
firebase_admin = None
firebase_auth = None
credentials = None

def _ensure_firebase_loaded():
    """Lazy load firebase-admin only when needed"""
    global firebase_admin, firebase_auth, credentials
    if firebase_admin is None:
        try:
            import firebase_admin as fa
            from firebase_admin import auth as fa_auth, credentials as fa_cred
            firebase_admin = fa
            firebase_auth = fa_auth
            credentials = fa_cred
        except ImportError:
            raise ImportError(
                "firebase-admin is required for token verification. "
                "Install with: pip install firebase-admin"
            )

try:
    from flask import request, jsonify
except ImportError:
    request = None
    jsonify = None

logger = logging.getLogger(__name__)

class AuthUtils:
    """Centralized authentication and tenant validation utilities"""
    
    def __init__(self):
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self._firebase_initialized = False
        
    def initialize_firebase(self):
        """Initialize Firebase Admin SDK if not already done (lazy initialization)"""
        if self._firebase_initialized:
            return
            
        _ensure_firebase_loaded()
        
        if not firebase_admin._apps:
            try:
                # Use default credentials in Cloud Run environment
                cred = credentials.ApplicationDefault()
                firebase_admin.initialize_app(cred, {
                    'projectId': self.project_id
                })
                logger.info("🔐 Firebase Admin SDK initialized")
            except Exception as e:
                logger.error(f"❌ Failed to initialize Firebase Admin: {e}")
                raise
        
        self._firebase_initialized = True
    
    def extract_auth_token(self, auth_header: str) -> str:
        """Extract Bearer token from Authorization header"""
        if not auth_header or not auth_header.startswith('Bearer '):
            raise ValueError("Missing or invalid Authorization header format")
        
        return auth_header.split(' ')[1]
    
    def verify_token_and_extract_context(self, id_token: str) -> Dict[str, Any]:
        """
        Verify Firebase ID token and extract tenant/user context
        Returns: {
            'user_id': str,
            'tenant_id': str, 
            'email': str,
            'organization_id': str (optional),
            'organization_role': str (optional)
        }
        """
        # Ensure Firebase is initialized before verifying tokens
        self.initialize_firebase()
        
        try:
            decoded_token = firebase_auth.verify_id_token(id_token)
            
            user_id = decoded_token.get('uid')
            email = decoded_token.get('email')
            
            if not user_id or not email:
                raise ValueError("Invalid token: missing user ID or email")
            
            # Extract custom claims for multi-tenant support
            custom_claims = decoded_token.get('custom_claims', {})
            
            # For multi-tenant, we need tenant_id
            # This could come from custom claims or derived from organization
            tenant_id = custom_claims.get('tenant_id') or custom_claims.get('organizationId')
            
            if not tenant_id:
                # For now, use user_id as tenant_id for single-tenant users
                # In production, this should be properly configured
                tenant_id = f"tenant_{user_id}"
                logger.warning(f"⚠️ No tenant_id found, using derived: {tenant_id}")
            
            context = {
                'user_id': user_id,
                'tenant_id': tenant_id,
                'email': email,
                'organization_id': custom_claims.get('organizationId'),
                'organization_role': custom_claims.get('organizationRole'),
                'raw_token': decoded_token
            }
            
            logger.info(f"🔐 Token verified for user {user_id} in tenant {tenant_id}")
            return context
            
        except Exception as e:
            logger.error(f"❌ Token verification failed: {e}")
            raise ValueError(f"Invalid authentication token: {e}")
    
    def validate_tenant_access(self, context: Dict[str, Any], required_tenant_id: str) -> bool:
        """Validate that the authenticated user has access to the specified tenant"""
        user_tenant_id = context.get('tenant_id')
        
        if user_tenant_id != required_tenant_id:
            logger.warning(f"🚫 Tenant access denied: user tenant {user_tenant_id} != required {required_tenant_id}")
            return False
        
        return True
    
    def require_auth_and_tenant(self, f):
        """
        Decorator to require authentication and tenant context
        Injects 'auth_context' into the route function
        """
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                # Extract Authorization header
                auth_header = request.headers.get('Authorization')
                if not auth_header:
                    return jsonify({
                        'error': 'Authentication required',
                        'code': 'AUTH_MISSING'
                    }), 401
                
                # Extract and verify token
                id_token = self.extract_auth_token(auth_header)
                auth_context = self.verify_token_and_extract_context(id_token)
                
                # Add context to request for use in route
                kwargs['auth_context'] = auth_context
                
                return f(*args, **kwargs)
                
            except ValueError as e:
                return jsonify({
                    'error': str(e),
                    'code': 'AUTH_INVALID'
                }), 401
            except Exception as e:
                logger.error(f"❌ Auth decorator error: {e}")
                return jsonify({
                    'error': 'Authentication failed',
                    'code': 'AUTH_ERROR'
                }), 500
        
        return decorated_function
    
    def get_tenant_scoped_path(self, tenant_id: str, collection: str, *path_parts) -> str:
        """Generate tenant-scoped Firestore path"""
        base_path = f"tenants/{tenant_id}"
        if collection:
            base_path = f"{base_path}/{collection}"
        
        for part in path_parts:
            base_path = f"{base_path}/{part}"
        
        return base_path
    
    def get_gcs_tenant_path(self, tenant_id: str, bucket_type: str, *path_parts) -> str:
        """Generate tenant-scoped GCS path"""
        if bucket_type not in ['raw', 'final']:
            raise ValueError("bucket_type must be 'raw' or 'final'")
        
        base_path = f"{tenant_id}"
        for part in path_parts:
            base_path = f"{base_path}/{part}"
        
        return base_path

# Global instance for use across services
auth_utils = AuthUtils()

def require_auth_and_tenant(f):
    """Convenience decorator using global auth_utils instance"""
    return auth_utils.require_auth_and_tenant(f)

def extract_tenant_context(request_headers: Dict[str, str]) -> Dict[str, Any]:
    """Standalone function to extract tenant context from request headers"""
    auth_header = request_headers.get('Authorization')
    if not auth_header:
        raise ValueError("Authorization header required")
    
    id_token = auth_utils.extract_auth_token(auth_header)
    return auth_utils.verify_token_and_extract_context(id_token)