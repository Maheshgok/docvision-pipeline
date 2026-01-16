"""
Shared Pub/Sub Utilities
Centralized Pub/Sub publishing and consuming with tenant context
"""

import os
import json
import logging
from typing import Dict, Any, Optional, Callable
from google.cloud import pubsub_v1
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

class PubSubUtils:
    """Centralized Pub/Sub utilities with tenant context handling"""
    
    def __init__(self):
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self._publisher_client = None
        self._subscriber_client = None
        
    def _get_publisher_client(self) -> pubsub_v1.PublisherClient:
        """Lazy initialization of publisher client"""
        if self._publisher_client is None:
            self._publisher_client = pubsub_v1.PublisherClient()
            logger.info("📡 Pub/Sub publisher client initialized")
        return self._publisher_client
    
    def _get_subscriber_client(self) -> pubsub_v1.SubscriberClient:
        """Lazy initialization of subscriber client"""
        if self._subscriber_client is None:
            self._subscriber_client = pubsub_v1.SubscriberClient()
            logger.info("📡 Pub/Sub subscriber client initialized")
        return self._subscriber_client
    
    def publish_chunk_for_enrichment(
        self,
        tenant_id: str,
        job_id: str,
        chunk_id: str,
        chunk_data: Dict[str, Any],
        auth_context: Dict[str, Any]
    ) -> str:
        """
        Publish chunk to enrichment topic with full tenant context
        
        Args:
            tenant_id: Tenant identifier
            job_id: Job identifier  
            chunk_id: Chunk identifier
            chunk_data: Chunk content and metadata
            auth_context: Authentication context
            
        Returns:
            Message ID
        """
        try:
            publisher = self._get_publisher_client()
            topic_path = publisher.topic_path(self.project_id, 'enrichment-chunks')
            
            # Create message with tenant context
            message_data = {
                'tenant_id': tenant_id,
                'job_id': job_id,
                'chunk_id': chunk_id,
                'user_id': auth_context['user_id'],
                'chunk_data': chunk_data,
                'published_at': str(datetime.utcnow())
            }
            
            # Publish message
            message_json = json.dumps(message_data)
            message_bytes = message_json.encode('utf-8')
            
            # Add attributes for easier filtering
            attributes = {
                'tenant_id': tenant_id,
                'job_id': job_id,
                'chunk_id': chunk_id,
                'message_type': 'enrichment_chunk'
            }
            
            future = publisher.publish(topic_path, message_bytes, **attributes)
            message_id = future.result()
            
            logger.info(f"📤 Published chunk {chunk_id} for enrichment - message_id: {message_id}")
            return message_id
            
        except Exception as e:
            logger.error(f"❌ Failed to publish chunk for enrichment: {e}")
            raise
    
    def start_enrichment_worker(
        self,
        message_handler: Callable[[Dict[str, Any]], None],
        max_messages: int = 10,
        ack_deadline_seconds: int = 600
    ) -> None:
        """
        Start enrichment worker that consumes chunks from Pub/Sub
        
        Args:
            message_handler: Function to handle each message
            max_messages: Max messages to pull at once
            ack_deadline_seconds: Time to process each message
        """
        try:
            subscriber = self._get_subscriber_client()
            subscription_path = subscriber.subscription_path(self.project_id, 'enrichment-worker-sub')
            
            # Configure flow control
            flow_control = pubsub_v1.types.FlowControl(max_messages=max_messages)
            
            def callback(message):
                try:
                    # Decode message
                    message_data = json.loads(message.data.decode('utf-8'))
                    
                    # Extract tenant context for validation
                    tenant_id = message_data.get('tenant_id')
                    if not tenant_id:
                        logger.error("❌ Message missing tenant_id")
                        message.nack()
                        return
                    
                    # Log processing start
                    chunk_id = message_data.get('chunk_id', 'unknown')
                    job_id = message_data.get('job_id', 'unknown')
                    logger.info(f"📥 Processing chunk {chunk_id} from job {job_id} (tenant: {tenant_id})")
                    
                    # Call message handler
                    message_handler(message_data)
                    
                    # Acknowledge successful processing
                    message.ack()
                    logger.info(f"✅ Completed processing chunk {chunk_id}")
                    
                except json.JSONDecodeError as e:
                    logger.error(f"❌ Invalid JSON in message: {e}")
                    message.nack()
                except Exception as e:
                    logger.error(f"❌ Error processing message: {e}")
                    message.nack()
            
            logger.info(f"👂 Starting enrichment worker on subscription: {subscription_path}")
            
            # Start pulling messages
            streaming_pull_future = subscriber.subscribe(
                subscription_path,
                callback=callback,
                flow_control=flow_control,
                ack_deadline_seconds=ack_deadline_seconds
            )
            
            logger.info("🔄 Enrichment worker started - listening for messages...")
            
            # Keep the worker running
            try:
                streaming_pull_future.result()
            except KeyboardInterrupt:
                logger.info("🛑 Shutting down enrichment worker...")
                streaming_pull_future.cancel()
                
        except Exception as e:
            logger.error(f"❌ Failed to start enrichment worker: {e}")
            raise
    
    def create_topics_and_subscriptions(self):
        """Create required Pub/Sub topics and subscriptions"""
        try:
            publisher = self._get_publisher_client()
            subscriber = self._get_subscriber_client()
            
            # Create enrichment topic
            topic_path = publisher.topic_path(self.project_id, 'enrichment-chunks')
            try:
                publisher.create_topic(request={"name": topic_path})
                logger.info(f"✅ Created topic: enrichment-chunks")
            except Exception as e:
                if "already exists" in str(e).lower():
                    logger.info("ℹ️ Topic enrichment-chunks already exists")
                else:
                    raise
            
            # Create enrichment worker subscription
            subscription_path = subscriber.subscription_path(self.project_id, 'enrichment-worker-sub')
            try:
                subscriber.create_subscription(
                    request={
                        "name": subscription_path,
                        "topic": topic_path,
                        "ack_deadline_seconds": 600  # 10 minutes for processing
                    }
                )
                logger.info(f"✅ Created subscription: enrichment-worker-sub")
            except Exception as e:
                if "already exists" in str(e).lower():
                    logger.info("ℹ️ Subscription enrichment-worker-sub already exists")
                else:
                    raise
                    
        except Exception as e:
            logger.error(f"❌ Failed to create topics/subscriptions: {e}")
            raise

# Global instance for use across services
pubsub_utils = PubSubUtils()

def publish_chunk_for_enrichment(
    tenant_id: str,
    job_id: str, 
    chunk_id: str,
    chunk_data: Dict[str, Any],
    auth_context: Dict[str, Any]
) -> str:
    """Convenience function using global instance"""
    return pubsub_utils.publish_chunk_for_enrichment(tenant_id, job_id, chunk_id, chunk_data, auth_context)

def start_enrichment_worker(message_handler: Callable[[Dict[str, Any]], None]) -> None:
    """Convenience function using global instance"""
    return pubsub_utils.start_enrichment_worker(message_handler)