"""
Session-Aware Service Manager for Invoice Processing Pipeline
- Monitors user sessions via Firebase Auth
- Manages Cloud Run service scaling based on user activity
- Prevents cold start cycles by keeping services warm during active sessions
"""

import os
import json
import time
import logging
import requests
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from concurrent.futures import ThreadPoolExecutor
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth, firestore
from google.cloud import run_v2
from google.oauth2 import service_account
from google.api_core import exceptions as gcp_exceptions

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

class SessionAwareServiceManager:
    def __init__(self):
        # Initialize Firebase with default credentials (no service account file needed)
        try:
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            
            self.db = firestore.client()
            logger.info("✅ Firebase initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Firebase initialization failed: {e}")
            # Continue without Firebase - session manager can still work for service management
            self.db = None
        
        # Initialize Cloud Run client for service management
        self.run_client = run_v2.ServicesClient()
        self.project_id = 'watch-mail-trial'
        self.region = 'asia-south1'
        
        # Service configuration for Cloud Run management
        self.managed_services = {
            'data-extractor': {
                'url': 'https://data-extractor-812016027146.asia-south1.run.app',
                'service_name': 'data-extractor'
            },
            'queue-enrichment-processor': {
                'url': 'https://queue-enrichment-processor-812016027146.asia-south1.run.app',
                'service_name': 'queue-enrichment-processor'
            },
            'field-standardizer': {
                'url': 'https://field-standardizer-812016027146.asia-south1.run.app',
                'service_name': 'field-standardizer'
            },
            'data-combiner': {
                'url': 'https://data-combiner-812016027146.asia-south1.run.app',
                'service_name': 'data-combiner'
            },
            'pipeline-orchestrator': {
                'url': 'https://pipeline-orchestrator-812016027146.asia-south1.run.app',
                'service_name': 'pipeline-orchestrator'
            }
        }
        
        # Session tracking
        self.active_sessions = set()
        self.last_activity = datetime.now()
        self.warmup_in_progress = False
        self.services_warm = False
        self.min_instances_active = False  # Track if we've set min-instances=1
        
        # Configuration from environment variables (no redeployment needed for changes)
        self.idle_timeout = timedelta(minutes=int(os.getenv('IDLE_TIMEOUT_MINUTES', '5')))
        self.warmup_timeout = int(os.getenv('WARMUP_TIMEOUT_SECONDS', '180'))
        self.session_timeout = timedelta(minutes=int(os.getenv('SESSION_TIMEOUT_MINUTES', '15')))
        
        # Log current configuration
        logger.info(f"⚙️ Session Configuration:")
        logger.info(f"   - Idle timeout: {self.idle_timeout.total_seconds()/60}min")
        logger.info(f"   - Warmup timeout: {self.warmup_timeout}s")  
        logger.info(f"   - Session timeout: {self.session_timeout.total_seconds()/60}min")
        
        # Start background monitoring
        self.start_session_monitor()
        
        logger.info("🎯 Session-Aware Service Manager initialized with Cloud Run management")

    def start_session_monitor(self):
        """Start background thread to monitor session health"""
        def monitor_task():
            while True:
                try:
                    # Check every 30 seconds
                    time.sleep(30)
                    
                    # 1. Clean up expired sessions
                    self.cleanup_expired_sessions()
                    
                    # 2. Verify active sessions are still valid
                    self.verify_active_sessions()
                    
                    # 3. Check if we need to shutdown services
                    if len(self.active_sessions) == 0 and self.services_warm:
                        time_since_activity = datetime.now() - self.last_activity
                        if time_since_activity > self.idle_timeout:
                            logger.info("💤 No active sessions detected - scheduling shutdown")
                            self.shutdown_services()
                    
                except Exception as e:
                    logger.error(f"❌ Session monitor error: {e}")
                    
        import threading
        threading.Thread(target=monitor_task, daemon=True).start()
        logger.info("👁️ Session monitor started")

    def cleanup_expired_sessions(self):
        """Remove expired sessions from tracking"""
        try:
            cutoff_time = datetime.now() - self.session_timeout
            
            # Check Firestore for expired sessions
            expired_sessions = self.db.collection('active_sessions').where(
                'last_activity', '<', cutoff_time
            ).get()
            
            for doc in expired_sessions:
                session_data = doc.to_dict()
                user_id = session_data.get('user_id')
                
                if user_id in self.active_sessions:
                    self.active_sessions.remove(user_id)
                    logger.info(f"🧹 Cleaned up expired session for user {user_id}")
                
                # Remove from Firestore
                doc.reference.delete()
                
        except Exception as e:
            logger.error(f"❌ Session cleanup failed: {e}")

    def verify_active_sessions(self):
        """Verify that active sessions are still valid"""
        try:
            if not self.active_sessions:
                return
            
            # Get current active sessions from Firestore
            active_docs = self.db.collection('active_sessions').where(
                'status', '==', 'active'
            ).get()
            
            firestore_active = set(doc.to_dict().get('user_id') for doc in active_docs)
            
            # Remove sessions that are no longer in Firestore
            removed_sessions = self.active_sessions - firestore_active
            for user_id in removed_sessions:
                self.active_sessions.remove(user_id)
                logger.info(f"🧹 Removed invalid session for user {user_id}")
            
            # Update last activity if any sessions are still active
            if self.active_sessions:
                self.last_activity = datetime.now()
                
        except Exception as e:
            logger.error(f"❌ Session verification failed: {e}")

    def set_min_instances_for_services(self, min_instances: int) -> dict:
        """Set minimum instances for all managed Cloud Run services"""
        results = {}
        
        logger.info(f"🔧 Setting min-instances={min_instances} for all processing services...")
        
        def update_service_min_instances(service_name: str, service_config: dict):
            try:
                service_path = f"projects/{self.project_id}/locations/{self.region}/services/{service_config['service_name']}"
                
                # Get current service configuration
                service = self.run_client.get_service(name=service_path)
                
                # Update the service with new min-instances
                service.spec.template.metadata.annotations["autoscaling.knative.dev/minScale"] = str(min_instances)
                
                # Apply the update
                update_request = run_v2.UpdateServiceRequest(service=service)
                operation = self.run_client.update_service(request=update_request)
                
                # Wait for operation to complete (with timeout)
                result = operation.result(timeout=120)
                
                logger.info(f"✅ {service_name}: min-instances set to {min_instances}")
                return {
                    'status': 'success',
                    'min_instances': min_instances,
                    'service_name': service_name
                }
                
            except gcp_exceptions.NotFound:
                logger.error(f"❌ {service_name}: Service not found")
                return {'status': 'error', 'error': 'Service not found'}
            except gcp_exceptions.PermissionDenied:
                logger.error(f"❌ {service_name}: Permission denied - check IAM roles")
                return {'status': 'error', 'error': 'Permission denied'}
            except Exception as e:
                logger.error(f"❌ {service_name}: Failed to set min-instances - {str(e)}")
                return {'status': 'error', 'error': str(e)}
        
        # Update all services concurrently
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_service = {
                executor.submit(update_service_min_instances, name, config): name 
                for name, config in self.managed_services.items()
            }
            
            for future in future_to_service:
                service_name = future_to_service[future]
                try:
                    result = future.result(timeout=150)  # 2.5 minutes per service
                    results[service_name] = result
                except Exception as e:
                    results[service_name] = {
                        'status': 'error',
                        'error': f'Operation timeout or failed: {str(e)}'
                    }
                    logger.error(f"❌ {service_name}: Operation failed - {e}")
        
        success_count = sum(1 for r in results.values() if r.get('status') == 'success')
        total_services = len(self.managed_services)
        
        logger.info(f"🔧 Min-instances update complete: {success_count}/{total_services} services updated")
        
        return {
            'operation': f'set_min_instances_{min_instances}',
            'success_count': success_count,
            'total_services': total_services,
            'results': results,
            'timestamp': datetime.now().isoformat()
        }

    def activate_services(self) -> dict:
        """Activate all services by setting min-instances=1"""
        if self.min_instances_active:
            logger.info("🔥 Services already active (min-instances=1)")
            return {'status': 'already_active', 'min_instances_active': True}
        
        logger.info("🚀 ACTIVATING SERVICES: Setting min-instances=1 to prevent cold starts")
        
        result = self.set_min_instances_for_services(1)
        
        if result['success_count'] >= 3:  # At least 3 services activated successfully
            self.min_instances_active = True
            logger.info("✅ Services activated successfully - min-instances=1 set")
        else:
            logger.error(f"❌ Service activation incomplete: {result['success_count']}/5 services")
        
        return result

    def deactivate_services(self) -> dict:
        """Deactivate services by setting min-instances=0 (allow scale-to-zero)"""
        if not self.min_instances_active:
            logger.info("💤 Services already deactivated (min-instances=0)")
            return {'status': 'already_deactivated', 'min_instances_active': False}
        
        logger.info("💤 DEACTIVATING SERVICES: Setting min-instances=0 to save costs")
        
        result = self.set_min_instances_for_services(0)
        
        if result['success_count'] >= 3:  # At least 3 services deactivated successfully
            self.min_instances_active = False
            self.services_warm = False
            logger.info("✅ Services deactivated successfully - min-instances=0 set")
        else:
            logger.error(f"❌ Service deactivation incomplete: {result['success_count']}/5 services")
        
        return result
        """
        MULTIPLE DETECTION METHODS for session closure:
        1. Explicit logout calls from frontend
        2. Session timeout (15 minutes without activity)
        3. Firebase Auth token expiration
        4. Page unload detection (beforeunload events)
        5. Heartbeat timeout (no activity for 2+ minutes)
        """
        
        # Method 1: Direct tracking
        if len(self.active_sessions) == 0:
            logger.info("🔍 All sessions closed: No active sessions in tracker")
            return True
        
        # Method 2: Activity timeout
        time_since_activity = datetime.now() - self.last_activity
        if time_since_activity > self.session_timeout:
            logger.info(f"🔍 All sessions closed: No activity for {time_since_activity}")
            self.active_sessions.clear()  # Clear stale sessions
            return True
        
        # Method 3: Firestore verification
        try:
            active_docs = self.db.collection('active_sessions').where(
                'status', '==', 'active'
            ).where(
                'last_activity', '>', datetime.now() - self.session_timeout
            ).get()
            
            if not active_docs:
                logger.info("🔍 All sessions closed: No active sessions in Firestore")
                self.active_sessions.clear()
                return True
                
        except Exception as e:
            logger.error(f"❌ Firestore session check failed: {e}")
        
        return False

    def track_user_login(self, user_id: str, session_token: str) -> bool:
        """Track user login and trigger service activation"""
        try:
            # Add to active sessions
            self.active_sessions.add(user_id)
            self.last_activity = datetime.now()
            
            # Store session in Firestore
            session_doc = {
                'user_id': user_id,
                'session_token': session_token,
                'login_time': datetime.now(),
                'last_activity': datetime.now(),
                'status': 'active'
            }
            self.db.collection('active_sessions').document(user_id).set(session_doc)
            
            logger.info(f"👤 User {user_id} logged in. Active sessions: {len(self.active_sessions)}")
            
            # CRITICAL: Activate services if this is first user or services are not active
            if not self.min_instances_active:
                logger.info("🔥 First active user - ACTIVATING SERVICES (min-instances=1)")
                
                # Activate services in background to prevent blocking login
                def activate_task():
                    try:
                        activation_result = self.activate_services()
                        logger.info(f"🔥 Service activation result: {activation_result['success_count']}/5 services")
                        
                        # After activation, trigger warmup
                        if activation_result.get('success_count', 0) >= 3:
                            time.sleep(10)  # Wait 10s for services to start
                            self.warmup_all_services_async()
                    except Exception as e:
                        logger.error(f"❌ Service activation task failed: {e}")
                
                import threading
                threading.Thread(target=activate_task, daemon=True).start()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Login tracking failed for {user_id}: {e}")
            return False

    def track_user_logout(self, user_id: str) -> bool:
        """Track user logout and deactivate services if no active users"""
        try:
            # Remove from active sessions
            self.active_sessions.discard(user_id)
            
            # Update Firestore
            self.db.collection('active_sessions').document(user_id).update({
                'status': 'logged_out',
                'logout_time': datetime.now()
            })
            
            logger.info(f"👤 User {user_id} logged out. Active sessions: {len(self.active_sessions)}")
            
            # CRITICAL: Deactivate services if no active users
            if len(self.active_sessions) == 0 and self.min_instances_active:
                logger.info("💤 No active users - SCHEDULING SERVICE DEACTIVATION")
                self.schedule_service_deactivation()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Logout tracking failed for {user_id}: {e}")
            return False

    def schedule_service_deactivation(self):
        """Schedule service deactivation after idle timeout"""
        def deactivation_task():
            # Wait for idle timeout (5 minutes)
            time.sleep(self.idle_timeout.total_seconds())
            
            # Double-check that users are still inactive
            if len(self.active_sessions) == 0:
                logger.info("💤 No activity detected - DEACTIVATING SERVICES (min-instances=0)")
                deactivation_result = self.deactivate_services()
                logger.info(f"💤 Service deactivation result: {deactivation_result.get('success_count', 0)}/5 services")
            else:
                logger.info("👤 Users became active during deactivation delay - keeping services active")
        
        # Run deactivation in background thread
        import threading
        threading.Thread(target=deactivation_task, daemon=True).start()

    def update_user_activity(self, user_id: str) -> bool:
        """Update user activity timestamp"""
        try:
            if user_id in self.active_sessions:
                self.last_activity = datetime.now()
                
                # Update Firestore
                self.db.collection('active_sessions').document(user_id).update({
                    'last_activity': datetime.now()
                })
                
                return True
            return False
            
        except Exception as e:
            logger.error(f"❌ Activity tracking failed for {user_id}: {e}")
            return False

    def warmup_all_services_async(self):
        """Asynchronously warm up all services"""
        if self.warmup_in_progress:
            logger.info("🔥 Warmup already in progress")
            return
        
        self.warmup_in_progress = True
        
        def warmup_task():
            try:
                logger.info("🚀 Starting concurrent service warmup...")
                
                def warmup_single_service(service_name, service_url):
                    try:
                        # Trigger pipeline orchestrator warmup (which warms all services)
                        if service_name == 'pipeline-orchestrator':
                            response = requests.post(f"{service_url}/warmup", json={}, timeout=self.warmup_timeout)
                        else:
                            response = requests.get(f"{service_url}/health", timeout=60)
                        
                        if response.status_code == 200:
                            logger.info(f"✅ {service_name} warmed up successfully")
                            return {'service': service_name, 'status': 'warm'}
                        else:
                            logger.warning(f"⏳ {service_name} warming up (HTTP {response.status_code})")
                            return {'service': service_name, 'status': 'warming'}
                            
                    except Exception as e:
                        logger.error(f"❌ {service_name} warmup failed: {e}")
                        return {'service': service_name, 'status': 'error', 'error': str(e)}
                
                # Use orchestrator's concurrent warmup instead of individual calls
                try:
                    orchestrator_url = self.services['pipeline-orchestrator']
                    response = requests.post(f"{orchestrator_url}/warmup", json={}, timeout=self.warmup_timeout)
                    
                    if response.status_code in [200, 206]:  # 200 = complete, 206 = partial
                        warmup_result = response.json()
                        warm_services = sum(1 for s in warmup_result.get('services', {}).values() 
                                          if s.get('status') == 'warm')
                        
                        if warm_services >= 3:  # At least 3 services warm
                            self.services_warm = True
                            logger.info(f"🔥 Service warmup completed: {warm_services}/5 services ready")
                        else:
                            logger.warning(f"🔥 Partial warmup: {warm_services}/5 services ready")
                    else:
                        logger.error(f"❌ Orchestrator warmup failed: HTTP {response.status_code}")
                        
                except Exception as e:
                    logger.error(f"❌ Orchestrator warmup failed: {e}")
                    # Fallback to individual service warmup
                    with ThreadPoolExecutor(max_workers=5) as executor:
                        futures = [executor.submit(warmup_single_service, name, url) 
                                 for name, url in self.services.items()]
                        
                        warm_count = 0
                        for future in futures:
                            result = future.result()
                            if result.get('status') == 'warm':
                                warm_count += 1
                        
                        if warm_count >= 3:
                            self.services_warm = True
                            logger.info(f"🔥 Fallback warmup completed: {warm_count}/5 services ready")
                
            finally:
                self.warmup_in_progress = False
        
        # Run warmup in background thread
        import threading
        threading.Thread(target=warmup_task, daemon=True).start()

    def schedule_shutdown(self):
        """Schedule service shutdown after idle timeout"""
        def shutdown_task():
            # Wait for idle timeout
            time.sleep(self.idle_timeout.total_seconds())
            
            # Check if users are still inactive
            if len(self.active_sessions) == 0:
                logger.info("💤 No activity detected - shutting down services")
                self.shutdown_services()
            else:
                logger.info("👤 Users became active during shutdown delay - keeping services warm")
        
        # Run shutdown in background thread
        import threading
        threading.Thread(target=shutdown_task, daemon=True).start()

    def shutdown_services(self):
        """Shutdown services by scaling to zero (cost optimization)"""
        try:
            # Note: Cloud Run doesn't support scaling to zero via API
            # Instead, we'll rely on the built-in idle timeout (default: 15 minutes)
            # But we can reduce min-instances to 0 if they were set to 1
            
            self.services_warm = False
            logger.info("💤 Services marked for shutdown - will idle out naturally")
            
            # Clear session tracking
            self.active_sessions.clear()
            
            # Clean up old sessions in Firestore
            cutoff_time = datetime.now() - timedelta(hours=1)
            old_sessions = self.db.collection('active_sessions').where(
                'last_activity', '<', cutoff_time
            ).get()
            
            for doc in old_sessions:
                doc.reference.delete()
            
            logger.info("🧹 Cleaned up old session records")
            
        except Exception as e:
            logger.error(f"❌ Service shutdown failed: {e}")

    def get_session_status(self) -> dict:
        """Get current session and service status"""
        return {
            'active_sessions': len(self.active_sessions),
            'services_warm': self.services_warm,
            'min_instances_active': self.min_instances_active,  # NEW: Track if services are kept active
            'warmup_in_progress': self.warmup_in_progress,
            'last_activity': self.last_activity.isoformat(),
            'session_users': list(self.active_sessions),
            'managed_services': len(self.managed_services),
            'timestamp': datetime.now().isoformat()
        }

# Initialize service manager
service_manager = SessionAwareServiceManager()

@app.route('/health', methods=['GET'])
def health_check():
    """Service manager health check"""
    return jsonify({
        'service': 'session-aware-service-manager',
        'status': 'healthy',
        'version': '1.0.0'
    })

@app.route('/session/login', methods=['POST'])
def track_login():
    """Track user login and trigger service warmup"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        session_token = data.get('session_token')
        
        if not user_id or not session_token:
            return jsonify({'error': 'Missing user_id or session_token'}), 400
        
        success = service_manager.track_user_login(user_id, session_token)
        
        return jsonify({
            'success': success,
            'message': 'Login tracked successfully',
            'session_status': service_manager.get_session_status()
        })
        
    except Exception as e:
        logger.error(f"❌ Login tracking endpoint failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/session/logout', methods=['POST'])
def track_logout():
    """Track user logout and schedule shutdown if needed"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Missing user_id'}), 400
        
        success = service_manager.track_user_logout(user_id)
        
        return jsonify({
            'success': success,
            'message': 'Logout tracked successfully',
            'session_status': service_manager.get_session_status()
        })
        
    except Exception as e:
        logger.error(f"❌ Logout tracking endpoint failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/session/activity', methods=['POST'])
def track_activity():
    """Track user activity to prevent premature shutdown"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Missing user_id'}), 400
        
        success = service_manager.update_user_activity(user_id)
        
        return jsonify({
            'success': success,
            'message': 'Activity tracked successfully' if success else 'User not in active sessions'
        })
        
    except Exception as e:
        logger.error(f"❌ Activity tracking endpoint failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/session/status', methods=['GET'])
def session_status():
    """Get current session and service status"""
    return jsonify(service_manager.get_session_status())

@app.route('/services/activate', methods=['POST'])
def activate_services():
    """Manually activate services (set min-instances=1)"""
    try:
        result = service_manager.activate_services()
        status_code = 200 if result.get('success_count', 0) >= 3 else 206
        return jsonify(result), status_code
    except Exception as e:
        logger.error(f"❌ Service activation failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/services/deactivate', methods=['POST'])
def deactivate_services():
    """Manually deactivate services (set min-instances=0)"""
    try:
        result = service_manager.deactivate_services()
        status_code = 200 if result.get('success_count', 0) >= 3 else 206
        return jsonify(result), status_code
    except Exception as e:
        logger.error(f"❌ Service deactivation failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/services/warmup', methods=['POST'])
def manual_warmup():
    """Manually trigger service warmup"""
    try:
        service_manager.warmup_all_services_async()
        return jsonify({
            'message': 'Service warmup initiated',
            'status': service_manager.get_session_status()
        })
    except Exception as e:
        logger.error(f"❌ Manual warmup failed: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)