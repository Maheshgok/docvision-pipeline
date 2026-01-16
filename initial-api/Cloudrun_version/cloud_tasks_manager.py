"""
Cloud Tasks Manager for Invoice Processing Pipeline
Handles task creation, scheduling, and queue management using Google Cloud Tasks
"""
import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from google.cloud import tasks_v2
from google.cloud.tasks_v2 import CloudTasksClient
from google.protobuf import timestamp_pb2

logger = logging.getLogger(__name__)

class CloudTasksManager:
    """
    Manages Cloud Tasks for invoice processing pipeline
    Provides queue delegation to GCP for better reliability and scalability
    """
    
    def __init__(self):
        # GCP Configuration
        self.project_id = os.environ.get('PROJECT_ID', 'watch-mail-trial')
        self.location = os.environ.get('CLOUD_TASKS_LOCATION', 'asia-south1')
        self.base_queue_name = os.environ.get('CLOUD_TASKS_BASE_QUEUE', 'invoice-processing')
        
        # Service URLs
        self.pipeline_orchestrator_url = os.environ.get(
            'PIPELINE_ORCHESTRATOR_URL', 
            'https://pipeline-orchestrator-812016027146.asia-south1.run.app'
        )
        
        # Initialize Cloud Tasks client
        self.client = CloudTasksClient()
        
        logger.info(f"Cloud Tasks Manager initialized for project: {self.project_id}")
        logger.info(f"Base queue name: {self.base_queue_name}")
        logger.info(f"Pipeline Orchestrator URL: {self.pipeline_orchestrator_url}")
        
    def get_user_queue_name(self, user_uid: str) -> str:
        """Generate user-specific queue name"""
        user_id_short = user_uid[:8] if len(user_uid) >= 8 else user_uid
        return f"{self.base_queue_name}-{user_id_short}"
        
    def get_queue_path(self, user_uid: str) -> str:
        """Get queue path for specific user"""
        queue_name = self.get_user_queue_name(user_uid)
        return self.client.queue_path(
            project=self.project_id,
            location=self.location,
            queue=queue_name
        )
        
    def ensure_user_queue_exists(self, user_uid: str) -> str:
        """Create user queue if it doesn't exist"""
        queue_name = self.get_user_queue_name(user_uid)
        queue_path = self.get_queue_path(user_uid)
        
        try:
            # Check if queue exists
            self.client.get_queue(name=queue_path)
            logger.info(f"📋 Using existing user queue: {queue_name}")
        except Exception as e:
            # Queue doesn't exist, create it
            logger.info(f"Creating user queue: {queue_name}")
            parent = self.client.common_location_path(self.project_id, self.location)
            
            queue_config = {
                "name": queue_path,
                "rate_limits": {
                    "max_dispatches_per_second": 5.0,  # Per-user rate limiting
                    "max_burst_size": 3,
                    "max_concurrent_dispatches": 2
                },
                "retry_config": {
                    "max_attempts": 3,
                    "max_retry_duration": {"seconds": 1800},  # 30 minutes
                    "min_backoff": {"seconds": 60},
                    "max_backoff": {"seconds": 3600},
                    "max_doublings": 16
                }
            }
            
            try:
                created_queue = self.client.create_queue(
                    parent=parent,
                    queue=queue_config
                )
                logger.info(f"✅ User queue created: {queue_name}")
            except Exception as create_error:
                logger.error(f"❌ Failed to create user queue {queue_name}: {create_error}")
                logger.error(f"   User UID: {user_uid}")
                logger.error(f"   Queue name format: {queue_name}")
                # NO FALLBACK - user isolation is critical
                raise Exception(f"User queue creation failed for {queue_name}: {create_error}")
                
        return queue_path
    
    def get_user_queue_name(self, user_uid: str) -> str:
        """Generate user-specific queue name"""
        # Convert to lowercase and use hyphens (Cloud Tasks requirement)
        user_id_short = user_uid[:8].lower() if len(user_uid) >= 8 else user_uid.lower()
        return f"{self.base_queue_name}-{user_id_short}"
    
    def create_processing_task(
        self,
        job_id: str,
        bucket_path: str,
        user_context: Dict[str, Any],
        auth_token: str,
        delay_seconds: int = 0,
        use_functional_services: bool = False,
        use_orchestrator: bool = True
    ) -> str:
        """
        Create a Cloud Task for invoice processing
        
        Args:
            job_id: Unique job identifier
            bucket_path: GCS path to the uploaded file
            user_context: Full user context including email, UID, and organization info
            auth_token: Firebase ID token for authentication
            delay_seconds: Optional delay before task execution
            use_functional_services: Whether to use new functional microservices
            use_orchestrator: Whether to use orchestrated pipeline (handles line items properly)
        
        Returns:
            task_name: Full Cloud Tasks task name
        """
        try:
            # Ensure user queue exists
            user_uid = user_context['uid']
            user_queue_path = self.ensure_user_queue_exists(user_uid)
            
            # Prepare task payload with full user context and validation
            task_payload = {
                "job_id": job_id,
                "bucket_path": bucket_path,
                "user_context": user_context,  # Full user context for validation
                "user_email": user_context['email'],  # For backward compatibility
                "user_uid": user_context['uid'],
                "organization_id": user_context.get('organization_id'),
                "organization_role": user_context.get('organization_role'),
                "client_organization_context": user_context.get('client_organization_context'),
                "client_organization_id": user_context.get('client_organization_id'),
                "client_organization_name": user_context.get('client_organization_name'),
                "timestamp": datetime.utcnow().isoformat(),
                "source": "cloud_tasks_manager",
                "expected_user_folder": user_context['uid'][:8],  # For path validation
                "queue_type": "user_isolated",  # Indicate this is a user-isolated queue
                "use_functional_services": use_functional_services,  # Route to functional services
                "use_orchestrator": use_orchestrator  # Route to orchestrated pipeline
            }
            
            # Create HTTP request for the task
            task_request = {
                "http_request": {
                    "http_method": tasks_v2.HttpMethod.POST,
                    "url": f"{self.pipeline_orchestrator_url}/process-invoice-from-gcs",
                    "headers": {
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {auth_token}"
                    },
                    "body": json.dumps(task_payload).encode('utf-8')
                }
            }
            
            # Add delay if specified
            if delay_seconds > 0:
                # Calculate execution time
                execution_time = datetime.utcnow() + timedelta(seconds=delay_seconds)
                timestamp = timestamp_pb2.Timestamp()
                timestamp.FromDatetime(execution_time)
                task_request["schedule_time"] = timestamp
            
            # Create the task
            task = {
                "name": f"{user_queue_path}/tasks/{job_id}-{int(datetime.utcnow().timestamp())}",
                **task_request
            }
            
            # Submit to user-specific Cloud Tasks queue
            response = self.client.create_task(
                parent=user_queue_path,
                task=task
            )
            
            task_name = response.name
            queue_name = self.get_user_queue_name(user_uid)
            
            logger.info(f"✅ Created Cloud Task for job {job_id} in user queue: {queue_name}")
            logger.info(f"Task name: {task_name}")
            logger.info(f"User UID: {user_uid}")
            
            # Store task tracking in Firestore for monitoring
            self._track_task_creation(job_id, task_name, bucket_path, user_context)
            
            return task_name
            
        except Exception as e:
            logger.error(f"Failed to create Cloud Task for job {job_id}: {e}")
            raise
    
    def _track_task_creation(
        self,
        job_id: str,
        task_name: str,
        bucket_path: str,
        user_context: Dict[str, Any]
    ):
        """Track task creation in Firestore for monitoring with user context"""
        try:
            from google.cloud import firestore
            
            firestore_client = firestore.Client(project=self.project_id)
            
            task_doc = {
                "job_id": job_id,
                "task_name": task_name,
                "bucket_path": bucket_path,
                "user_email": user_context['email'],
                "user_uid": user_context['uid'],
                "organization_id": user_context.get('organization_id'),
                "organization_role": user_context.get('organization_role'),
                "status": "created",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            # Store in 'cloud_tasks' collection
            firestore_client.collection('cloud_tasks').document(job_id).set(task_doc)
            
            logger.info(f"📋 Tracked task creation in Firestore: {job_id}")
            
        except Exception as e:
            logger.warning(f"Failed to track task creation in Firestore: {e}")
            # Don't fail the task creation if tracking fails
    
    def get_task_status(self, task_name: str) -> Dict[str, Any]:
        """
        Get the status of a specific Cloud Task
        
        Args:
            task_name: Full Cloud Tasks task name
        
        Returns:
            Task status information
        """
        try:
            task = self.client.get_task(name=task_name)
            
            return {
                "name": task.name,
                "schedule_time": task.schedule_time.ToDatetime().isoformat() if task.schedule_time else None,
                "create_time": task.create_time.ToDatetime().isoformat(),
                "dispatch_count": task.dispatch_count,
                "response_count": task.response_count,
                "first_attempt": {
                    "schedule_time": task.first_attempt.schedule_time.ToDatetime().isoformat() if task.first_attempt and task.first_attempt.schedule_time else None,
                    "dispatch_time": task.first_attempt.dispatch_time.ToDatetime().isoformat() if task.first_attempt and task.first_attempt.dispatch_time else None,
                    "response_time": task.first_attempt.response_time.ToDatetime().isoformat() if task.first_attempt and task.first_attempt.response_time else None,
                } if task.first_attempt else None,
                "last_attempt": {
                    "schedule_time": task.last_attempt.schedule_time.ToDatetime().isoformat() if task.last_attempt and task.last_attempt.schedule_time else None,
                    "dispatch_time": task.last_attempt.dispatch_time.ToDatetime().isoformat() if task.last_attempt and task.last_attempt.dispatch_time else None,
                    "response_time": task.last_attempt.response_time.ToDatetime().isoformat() if task.last_attempt and task.last_attempt.response_time else None,
                    "response_status": {
                        "code": task.last_attempt.response_status.code if task.last_attempt and task.last_attempt.response_status else None
                    }
                } if task.last_attempt else None
            }
            
        except Exception as e:
            logger.error(f"Failed to get task status: {e}")
            return {"error": str(e)}
    
    def delete_task(self, task_name: str) -> bool:
        """
        Delete a specific Cloud Task
        
        Args:
            task_name: Full Cloud Tasks task name
        
        Returns:
            True if successful, False otherwise
        """
        try:
            self.client.delete_task(name=task_name)
            logger.info(f"Deleted Cloud Task: {task_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete task {task_name}: {e}")
            return False
    
    def list_tasks(self, page_size: int = 100) -> Dict[str, Any]:
        """
        List all tasks in the queue
        
        Args:
            page_size: Maximum number of tasks to return
        
        Returns:
            List of task information
        """
        try:
            request = tasks_v2.ListTasksRequest(
                parent=self.queue_path,
                page_size=page_size
            )
            
            page_result = self.client.list_tasks(request=request)
            tasks_info = []
            
            for task in page_result:
                task_info = {
                    "name": task.name,
                    "schedule_time": task.schedule_time.ToDatetime().isoformat() if task.schedule_time else None,
                    "create_time": task.create_time.ToDatetime().isoformat(),
                    "dispatch_count": task.dispatch_count,
                    "response_count": task.response_count
                }
                tasks_info.append(task_info)
            
            return {
                "tasks": tasks_info,
                "count": len(tasks_info)
            }
            
        except Exception as e:
            logger.error(f"Failed to list tasks: {e}")
            return {"error": str(e), "tasks": [], "count": 0}
    
    def purge_queue(self) -> bool:
        """
        Purge all tasks from the queue (use with caution!)
        
        Returns:
            True if successful, False otherwise
        """
        try:
            self.client.purge_queue(name=self.queue_path)
            logger.warning(f"Purged all tasks from queue: {self.queue_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to purge queue: {e}")
            return False
    
    def get_queue_stats(self) -> Dict[str, Any]:
        """
        Get queue statistics and configuration
        
        Returns:
            Queue statistics and configuration info
        """
        try:
            queue = self.client.get_queue(name=self.queue_path)
            
            # Get task count
            tasks_info = self.list_tasks(page_size=1000)  # Get up to 1000 for count
            
            return {
                "queue_name": queue.name,
                "state": queue.state,
                "task_count": tasks_info.get("count", 0),
                "rate_limits": {
                    "max_dispatches_per_second": queue.rate_limits.max_dispatches_per_second if queue.rate_limits else None,
                    "max_burst_size": queue.rate_limits.max_burst_size if queue.rate_limits else None,
                    "max_concurrent_dispatches": queue.rate_limits.max_concurrent_dispatches if queue.rate_limits else None
                } if queue.rate_limits else None,
                "retry_config": {
                    "max_attempts": queue.retry_config.max_attempts if queue.retry_config else None,
                    "max_retry_duration_seconds": queue.retry_config.max_retry_duration.seconds if queue.retry_config and queue.retry_config.max_retry_duration else None,
                    "min_backoff_seconds": queue.retry_config.min_backoff.seconds if queue.retry_config and queue.retry_config.min_backoff else None,
                    "max_backoff_seconds": queue.retry_config.max_backoff.seconds if queue.retry_config and queue.retry_config.max_backoff else None,
                    "max_doublings": queue.retry_config.max_doublings if queue.retry_config else None
                } if queue.retry_config else None,
                "created_timestamp": queue.purge_time.ToDatetime().isoformat() if queue.purge_time else None
            }
            
        except Exception as e:
            logger.error(f"Failed to get queue stats: {e}")
            return {"error": str(e)}