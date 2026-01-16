"""
Shared Firestore Utilities
Tenant-scoped Firestore operations with proper isolation
"""

import os
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from google.cloud import firestore
from .auth_utils import AuthUtils

logger = logging.getLogger(__name__)

class FirestoreUtils:
    """Centralized Firestore utilities with tenant isolation"""
    
    def __init__(self):
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self._client = None
        self.auth_utils = AuthUtils()
        
    def _get_client(self) -> firestore.Client:
        """Lazy initialization of Firestore client"""
        if self._client is None:
            self._client = firestore.Client(project=self.project_id)
            logger.info("🔥 Firestore client initialized")
        return self._client
    
    def create_job_document(
        self,
        tenant_id: str,
        job_id: str,
        initial_data: Dict[str, Any],
        auth_context: Dict[str, Any]
    ) -> str:
        """
        Create new job document with tenant isolation
        
        Args:
            tenant_id: Tenant identifier
            job_id: Unique job identifier
            initial_data: Initial job data
            auth_context: Authentication context from auth_utils
            
        Returns:
            Document path
        """
        try:
            client = self._get_client()
            doc_path = f"tenants/{tenant_id}/jobs/{job_id}"
            
            job_data = {
                'job_id': job_id,
                'tenant_id': tenant_id,
                'user_id': auth_context['user_id'],
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow(),
                'status': 'CREATED',
                **initial_data
            }
            
            client.document(doc_path).set(job_data)
            logger.info(f"📄 Created job document: {doc_path}")
            return doc_path
            
        except Exception as e:
            logger.error(f"❌ Failed to create job document: {e}")
            raise
    
    def update_job_status(
        self,
        tenant_id: str,
        job_id: str,
        status: str,
        additional_data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Update job status with optional additional data"""
        try:
            client = self._get_client()
            doc_path = f"tenants/{tenant_id}/jobs/{job_id}"
            
            update_data = {
                'status': status,
                'updated_at': datetime.utcnow()
            }
            
            if additional_data:
                update_data.update(additional_data)
            
            client.document(doc_path).update(update_data)
            logger.info(f"🔄 Updated job {job_id} status to {status}")
            
        except Exception as e:
            logger.error(f"❌ Failed to update job status: {e}")
            raise
    
    def store_extraction_data(
        self,
        tenant_id: str,
        job_id: str,
        extraction_data: Dict[str, Any]
    ) -> str:
        """Store extraction results in tenant-scoped path"""
        try:
            client = self._get_client()
            doc_path = f"tenants/{tenant_id}/jobs/{job_id}/extraction/main"
            
            data = {
                'job_id': job_id,
                'tenant_id': tenant_id,
                'extracted_at': datetime.utcnow(),
                **extraction_data
            }
            
            client.document(doc_path).set(data)
            logger.info(f"📊 Stored extraction data: {doc_path}")
            return doc_path
            
        except Exception as e:
            logger.error(f"❌ Failed to store extraction data: {e}")
            raise
    
    def create_chunk_document(
        self,
        tenant_id: str,
        job_id: str,
        chunk_id: str,
        chunk_data: Dict[str, Any]
    ) -> str:
        """Create chunk document for parallel processing"""
        try:
            client = self._get_client()
            doc_path = f"tenants/{tenant_id}/jobs/{job_id}/chunks/{chunk_id}"
            
            data = {
                'job_id': job_id,
                'tenant_id': tenant_id,
                'chunk_id': chunk_id,
                'created_at': datetime.utcnow(),
                'status': 'PENDING',
                **chunk_data
            }
            
            client.document(doc_path).set(data)
            logger.info(f"📦 Created chunk document: {doc_path}")
            return doc_path
            
        except Exception as e:
            logger.error(f"❌ Failed to create chunk document: {e}")
            raise
    
    def update_chunk_status(
        self,
        tenant_id: str,
        job_id: str,
        chunk_id: str,
        status: str,
        result_data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Update chunk processing status and results"""
        try:
            client = self._get_client()
            doc_path = f"tenants/{tenant_id}/jobs/{job_id}/chunks/{chunk_id}"
            
            update_data = {
                'status': status,
                'updated_at': datetime.utcnow()
            }
            
            if result_data:
                update_data['result'] = result_data
            
            client.document(doc_path).update(update_data)
            logger.info(f"📦 Updated chunk {chunk_id} status to {status}")
            
        except Exception as e:
            logger.error(f"❌ Failed to update chunk status: {e}")
            raise
    
    def get_job_chunks(
        self,
        tenant_id: str,
        job_id: str,
        status_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all chunks for a job, optionally filtered by status"""
        try:
            client = self._get_client()
            collection_path = f"tenants/{tenant_id}/jobs/{job_id}/chunks"
            
            query = client.collection(collection_path)
            
            if status_filter:
                query = query.where('status', '==', status_filter)
            
            chunks = []
            for doc in query.get():
                chunk_data = doc.to_dict()
                chunk_data['chunk_id'] = doc.id
                chunks.append(chunk_data)
            
            logger.info(f"📦 Retrieved {len(chunks)} chunks for job {job_id}")
            return chunks
            
        except Exception as e:
            logger.error(f"❌ Failed to get job chunks: {e}")
            raise
    
    def store_canonical_data(
        self,
        tenant_id: str,
        job_id: str,
        canonical_data: Dict[str, Any]
    ) -> str:
        """Store canonicalized/standardized data"""
        try:
            client = self._get_client()
            doc_path = f"tenants/{tenant_id}/jobs/{job_id}/canonical/main"
            
            data = {
                'job_id': job_id,
                'tenant_id': tenant_id,
                'canonicalized_at': datetime.utcnow(),
                **canonical_data
            }
            
            client.document(doc_path).set(data)
            logger.info(f"🏷️ Stored canonical data: {doc_path}")
            return doc_path
            
        except Exception as e:
            logger.error(f"❌ Failed to store canonical data: {e}")
            raise
    
    def get_job_data(
        self,
        tenant_id: str,
        job_id: str,
        include_chunks: bool = False
    ) -> Dict[str, Any]:
        """Get complete job data including extraction and chunks if requested"""
        try:
            client = self._get_client()
            
            # Get main job document
            job_doc = client.document(f"tenants/{tenant_id}/jobs/{job_id}").get()
            if not job_doc.exists:
                raise ValueError(f"Job {job_id} not found for tenant {tenant_id}")
            
            job_data = job_doc.to_dict()
            
            # Get extraction data
            try:
                extraction_doc = client.document(f"tenants/{tenant_id}/jobs/{job_id}/extraction/main").get()
                if extraction_doc.exists:
                    job_data['extraction'] = extraction_doc.to_dict()
            except Exception as e:
                logger.warning(f"⚠️ No extraction data for job {job_id}: {e}")
            
            # Get chunks if requested
            if include_chunks:
                job_data['chunks'] = self.get_job_chunks(tenant_id, job_id)
            
            # Get canonical data
            try:
                canonical_doc = client.document(f"tenants/{tenant_id}/jobs/{job_id}/canonical/main").get()
                if canonical_doc.exists:
                    job_data['canonical'] = canonical_doc.to_dict()
            except Exception as e:
                logger.warning(f"⚠️ No canonical data for job {job_id}: {e}")
            
            logger.info(f"📄 Retrieved complete job data for {job_id}")
            return job_data
            
        except Exception as e:
            logger.error(f"❌ Failed to get job data: {e}")
            raise

# Global instance for use across services
firestore_utils = FirestoreUtils()

def create_job_document(tenant_id: str, job_id: str, initial_data: Dict[str, Any], auth_context: Dict[str, Any]) -> str:
    """Convenience function using global instance"""
    return firestore_utils.create_job_document(tenant_id, job_id, initial_data, auth_context)

def update_job_status(tenant_id: str, job_id: str, status: str, additional_data: Optional[Dict[str, Any]] = None) -> None:
    """Convenience function using global instance"""
    return firestore_utils.update_job_status(tenant_id, job_id, status, additional_data)