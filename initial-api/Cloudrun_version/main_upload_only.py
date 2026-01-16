"""
Initial API Service - Upload Only (Clean Version)
Handles file uploads to Google Cloud Storage and user authentication
Based on stable GitHub repository version

Status: Upload-only service without processing dependencies
"""
import os
import json
import logging
import hashlib
import secrets
from datetime import datetime, timedelta
from google.cloud import storage, firestore
from flask import Flask, jsonify, request
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variables
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'watch-mail-trial-invoice-processing')
if not BUCKET_NAME:
    logger.error("BUCKET_NAME environment variable is required")

# Initialize clients with explicit project ID
project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
storage_client = storage.Client(project=project_id)
firestore_client = firestore.Client(project=project_id)

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    # Use default credentials (service account) in production
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {
        'projectId': project_id
    })

print(f"Initialized clients for project: {project_id}")
print(f"Firebase Admin SDK initialized for project: {project_id}")

# Initialize Flask app for Cloud Run
app = Flask(__name__)

# Configure CORS properly for authenticated requests
CORS(app, 
     resources={
         r"/*": {
             "origins": ["https://invoiceparse.netlify.app", "http://localhost:3000", "http://localhost:3001", "*"],
             "methods": ["GET", "POST", "PUT", "OPTIONS"],
             "allow_headers": ["Authorization", "Content-Type", "X-Requested-With", "Accept", "Origin"],
             "supports_credentials": True,
             "expose_headers": ["Content-Type"]
         }
     })

# Add explicit OPTIONS handler for preflight requests
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = jsonify({})
        origin = request.headers.get('Origin')
        allowed_origins = ['https://invoiceparse.netlify.app', 'https://profound-babka-8bbaa6.netlify.app', 'http://localhost:3000', 'http://localhost:3001']
        if origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Requested-With, Accept, Origin'
        response.headers['Access-Control-Max-Age'] = '3600'
        return response

# Ensure CORS headers on all responses
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    allowed_origins = ['https://invoiceparse.netlify.app', 'https://profound-babka-8bbaa6.netlify.app', 'http://localhost:3000', 'http://localhost:3001']
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Requested-With, Accept, Origin'
    response.headers['Access-Control-Expose-Headers'] = 'Content-Type'
    return response

def verify_auth_token(auth_header):
    """Verify Firebase ID token and return full user context"""
    if not auth_header or not auth_header.startswith('Bearer '):
        raise ValueError("Missing or invalid authorization token")
    
    id_token_str = auth_header.split(' ')[1]
    
    try:
        decoded_token = firebase_auth.verify_id_token(id_token_str)
        user_email = decoded_token.get('email')
        user_uid = decoded_token.get('uid')
        
        if not user_email or not user_uid:
            raise ValueError("Invalid token: missing required claims")
        
        logger.info(f"🔐 Token verified for user: {user_email}")
        
        return {
            'uid': user_uid,
            'email': user_email,
            'name': decoded_token.get('name', ''),
            'picture': decoded_token.get('picture', ''),
            'email_verified': decoded_token.get('email_verified', False),
            'firebase': decoded_token.get('firebase', {}),
            'provider_id': decoded_token.get('firebase', {}).get('sign_in_provider', 'unknown'),
            'auth_time': decoded_token.get('auth_time', 0),
            'iat': decoded_token.get('iat', 0),
            'exp': decoded_token.get('exp', 0)
        }
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise ValueError(f"Token verification failed: {e}")

@app.route('/upload_invoice', methods=['POST', 'OPTIONS'])
def upload_file():
    """
    Direct file upload endpoint.
    Accepts multipart/form-data with a file field.
    Returns a token and file location information.
    """
    if request.method == 'OPTIONS':
        response = jsonify({})
        origin = request.headers.get('Origin')
        allowed_origins = ['https://invoiceparse.netlify.app', 'https://profound-babka-8bbaa6.netlify.app', 'http://localhost:3000', 'http://localhost:3001']
        if origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
        return response
    
    logger.info("File upload request received")
    
    # Verify authentication first
    try:
        auth_header = request.headers.get('Authorization')
        user_context = verify_auth_token(auth_header)
        user_email = user_context['email']  # For backward compatibility in logs
        
        logger.info(f"Upload request authenticated for user: {user_email} (UID: {user_context['uid'][:8]}...)")
        
        # CRITICAL: Validate workspace exists before allowing upload
        doc_ref = firestore_client.collection('users').document(user_context['uid'])
        doc = doc_ref.get()
        
        if not doc.exists or not doc.to_dict().get('workspace_initialized'):
            logger.error(f"Workspace not initialized for user: {user_email}")
            return jsonify({
                "error": "Workspace not initialized",
                "message": "Please complete workspace setup in onboarding before uploading files",
                "action": "redirect_to_onboarding"
            }), 403
            
        logger.info(f"✅ Workspace validated for user: {user_email}")
    except ValueError as e:
        logger.error(f"Authentication failed: {e}")
        return jsonify({"error": "Invalid authentication token", "details": str(e)}), 401
    
    # Validate environment variables
    if not BUCKET_NAME:
        logger.error("BUCKET_NAME environment variable not set")
        return jsonify({"error": "Server configuration error: BUCKET_NAME not set"}), 500
    
    if 'file' not in request.files:
        logger.error("No file provided in request")
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if file.filename == '':
        logger.error("Empty filename provided")
        return jsonify({"error": "No file selected"}), 400
    
    try:
        # Generate production-ready job ID with customer tracking
        
        # Generate unique path with timestamp and user isolation
        timestamp = datetime.utcnow().strftime('%Y/%m/%d/%H-%M-%S')
        user_folder = user_context['uid'][:8]  # First 8 chars of UID for privacy
        filename = f"users/{user_folder}/raw/{timestamp}_{file.filename}"
        
        logger.info(f"Processing upload for file: {filename}")
        
        # Get bucket and create a blob
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(filename)
        
        # Upload the file
        blob.upload_from_file(file)
        logger.info(f"Successfully uploaded file to {filename}")
        
        # Generate production-ready job ID: {CUST_NUM}-{ASSET_REF}-{TOKEN}
        # 1. Customer number (3-char alphanumeric from email hash)
        email_hash = hashlib.md5(user_email.encode()).hexdigest()
        cust_num = f"{email_hash[:2].upper()}{ord(email_hash[2]) % 10}"
        
        # 2. Asset reference (6-char from bucket path + sequence)
        path_hash = hashlib.sha256(filename.encode()).hexdigest()
        asset_ref = f"{path_hash[:4].upper()}{timestamp[-2:]}"
        
        # 3. Security token (4-char random)
        token = secrets.token_hex(2).upper()
        
        # Combine into production job ID
        job_id = f"{cust_num}-{asset_ref}-{token}"
        
        logger.info(f"🆔 GENERATED JOB ID: {job_id} for user: {user_email}")
        logger.info(f"🧩 Job ID components: cust={cust_num}, asset={asset_ref}, token={token}")
        
        # Return successful upload response
        logger.info(f"File uploaded successfully. Job ID: {job_id}, Bucket path: {BUCKET_NAME}/{filename}")
        
        return jsonify({
            "status": "success",
            "job_id": job_id,  # Frontend expects this field
            "filename": filename,
            "bucket": BUCKET_NAME,
            "gcsPath": f"gs://{BUCKET_NAME}/{filename}",
            "bucket_path": f"{BUCKET_NAME}/{filename}",  # Add this for queue processor
            "upload_complete": True,  # Indicate upload completed
            "processing_mode": "manual"  # Indicate manual processing mode
        }), 200
        
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to upload file: {str(e)}"}), 500

@app.route('/health', methods=['GET', 'OPTIONS'])
def health_check():
    """Health check endpoint - standard Cloud Run health check"""
    if request.method == 'OPTIONS':
        response = jsonify({})
        origin = request.headers.get('Origin')
        allowed_origins = ['https://invoiceparse.netlify.app', 'https://profound-babka-8bbaa6.netlify.app', 'http://localhost:3000', 'http://localhost:3001']
        if origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
        return response
    
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "initial-api",
        "mode": "upload_only",
        "bucket": BUCKET_NAME
    }), 200

@app.route('/', methods=['GET'])
def api_info():
    """API information endpoint"""
    return jsonify({
        "service": "initial-api",
        "version": "2.0.0",
        "mode": "upload_only",
        "endpoints": [
            "/health",
            "/upload_invoice"
        ]
    }), 200

@app.route('/signed-url', methods=['GET', 'OPTIONS'])
def generate_signed_url():
    """
    Generate a signed URL for viewing uploaded documents
    """
    if request.method == 'OPTIONS':
        response = jsonify({})
        origin = request.headers.get('Origin')
        allowed_origins = ['https://invoiceparse.netlify.app', 'https://profound-babka-8bbaa6.netlify.app', 'http://localhost:3000', 'http://localhost:3001']
        if origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
        return response
    
    logger.info("Signed URL request received")
    
    # Verify authentication first
    try:
        auth_header = request.headers.get('Authorization')
        user_context = verify_auth_token(auth_header)
        user_email = user_context['email']  # Extract email for path validation
        logger.info(f"Signed URL request authenticated for user: {user_email}")
        
        # Get path from query parameters
        gcs_path = request.args.get('path', '')
        if not gcs_path:
            return jsonify({"error": "Missing 'path' query parameter"}), 400
        
        # Validate path belongs to user (security check)
        user_folder = user_context['uid'][:8]
        expected_prefix = f"users/{user_folder}/"
        
        if not gcs_path.startswith(expected_prefix):
            logger.warning(f"Unauthorized path access attempted by {user_email}: {gcs_path}")
            return jsonify({"error": "Unauthorized access to file"}), 403
        
        # Generate signed URL
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(gcs_path)
        
        # Check if blob exists
        if not blob.exists():
            return jsonify({"error": "File not found"}), 404
        
        # Generate signed URL (valid for 1 hour)
        expiration = datetime.utcnow() + timedelta(hours=1)
        
        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=expiration,
            method="GET",
            service_account_email="cloudrun-invoice-uploader@watch-mail-trial.iam.gserviceaccount.com"
        )
        
        logger.info(f"Signed URL generated for {gcs_path} (expires: {expiration.isoformat()})")
        
        return jsonify({
            "signedUrl": signed_url,
            "expires": expiration.isoformat(),
            "path": gcs_path
        }), 200
        
    except ValueError as e:
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        logger.error(f"Error generating signed URL: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to generate signed URL: {str(e)}"}), 500

if __name__ == "__main__":
    # Set default environment variables for local testing
    os.environ.setdefault('BUCKET_NAME', 'watch-mail-trial-invoice-processing')
    
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)), debug=False)