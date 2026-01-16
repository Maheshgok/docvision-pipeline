"""
Functional Processing Manager for Initial API
Integrates functional microservices with existing user-isolated infrastructure
"""

import os
import json
import logging
import requests
import base64
from datetime import datetime
from typing import Dict, Any, Optional
from google.cloud import storage, firestore

logger = logging.getLogger(__name__)

class FunctionalProcessingManager:
    """
    Manages integration between functional services and existing infrastructure.
    Maintains user isolation, bucket patterns, and Firestore storage compatibility.
    """
    
    def __init__(self):
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.storage_client = storage.Client(project=self.project_id)
        self.firestore_client = firestore.Client(project=self.project_id)
        
        # Functional service URLs
        self.extraction_url = 'https://extraction-service-812016027146.asia-south1.run.app'
        self.enrichment_url = 'https://enrichment-service-812016027146.asia-south1.run.app'
        self.analysis_url = 'https://analysis-service-812016027146.asia-south1.run.app'
        
        logger.info("🔧 FunctionalProcessingManager initialized")
    
    def get_user_collection_path(self, user_uid: str) -> str:
        """Get user-specific Firestore collection path matching frontend expectations"""
        return f"users/{user_uid}/invoice_results"
    
    async def process_invoice_functional(self, job_id: str, bucket_path: str, user_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process invoice using functional services while maintaining existing infrastructure patterns.
        
        Args:
            job_id: Unique job identifier 
            bucket_path: Path in user-isolated bucket (bucket_name/filename)
            user_context: User context with UID, email, organization info
            
        Returns:
            Result dictionary compatible with existing frontend expectations
        """
        
        user_uid = user_context.get('uid')
        user_email = user_context.get('email', 'unknown')
        
        logger.info(f"🚀 Starting functional processing for job {job_id} (user: {user_email})")
        
        try:
            # Step 1: Download image from user-isolated bucket
            image_data = await self._download_image_from_bucket(bucket_path)
            
            # Step 2: Update Firestore with processing status 
            await self._update_firestore_status(user_uid, job_id, 'processing', 'Phase 1: Extracting data...')
            
            # Step 3: Phase 1 - Data Extraction
            logger.info(f"📋 Phase 1: Extracting data for job {job_id}")
            extraction_result = await self._call_extraction_service(image_data, job_id)
            
            if not extraction_result.get('success'):
                raise Exception(f"Extraction failed: {extraction_result}")
            
            # Step 4: Update progress and Phase 2 - Enrichment
            await self._update_firestore_status(user_uid, job_id, 'processing', 'Phase 2: Adding business intelligence...')
            
            logger.info(f"💡 Phase 2: Enriching data for job {job_id}")
            enrichment_result = await self._call_enrichment_service(extraction_result['content'], job_id)
            
            if not enrichment_result.get('success'):
                raise Exception(f"Enrichment failed: {enrichment_result}")
            
            # Step 5: Update progress and Phase 3 - Analysis
            await self._update_firestore_status(user_uid, job_id, 'processing', 'Phase 3: Final validation...')
            
            logger.info(f"🔍 Phase 3: Analyzing data for job {job_id}")
            combined_data = {
                'extracted_data': extraction_result['content'],
                'enriched_data': enrichment_result['content']
            }
            
            analysis_result = await self._call_analysis_service(combined_data, job_id)
            
            if not analysis_result.get('success'):
                raise Exception(f"Analysis failed: {analysis_result}")
            
            # Step 6: Create final result in format expected by frontend
            final_result = self._create_compatible_result(
                job_id, bucket_path, user_context,
                extraction_result, enrichment_result, analysis_result
            )
            
            # Step 7: Store final result in user-isolated Firestore collection
            await self._store_final_result(user_uid, job_id, final_result)
            
            logger.info(f"✅ Functional processing completed for job {job_id}")
            return final_result
            
        except Exception as e:
            logger.error(f"❌ Functional processing failed for job {job_id}: {e}")
            
            # Store error in Firestore
            error_result = {
                'jobId': job_id,
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat(),
                'processing_mode': 'functional_services',
                'bucket_path': bucket_path,
                'user_email': user_email
            }
            
            await self._store_final_result(user_uid, job_id, error_result)
            return error_result
    
    async def _download_image_from_bucket(self, bucket_path: str) -> str:
        """Download image from user bucket and convert to base64"""
        try:
            bucket_name, filename = bucket_path.split('/', 1)
            bucket = self.storage_client.bucket(bucket_name)
            blob = bucket.blob(filename)
            
            # Download as bytes
            image_bytes = blob.download_as_bytes()
            
            # Convert to base64
            image_base64 = base64.b64encode(image_bytes).decode('utf-8')
            
            logger.info(f"📁 Downloaded {filename} from bucket {bucket_name} ({len(image_base64)} chars)")
            return image_base64
            
        except Exception as e:
            logger.error(f"❌ Failed to download image from {bucket_path}: {e}")
            raise Exception(f"Image download failed: {e}")
    
    async def _call_extraction_service(self, image_data: str, job_id: str) -> Dict[str, Any]:
        """Call extraction functional service"""
        try:
            response = requests.post(
                f"{self.extraction_url}/extract",
                json={
                    'image_data': image_data,
                    'job_id': job_id
                },
                timeout=300
            )
            
            if response.ok:
                return response.json()
            else:
                raise Exception(f"Extraction service error: {response.status_code} - {response.text}")
                
        except requests.exceptions.RequestException as e:
            raise Exception(f"Extraction service call failed: {e}")
    
    async def _call_enrichment_service(self, extracted_data: str, job_id: str) -> Dict[str, Any]:
        """Call enrichment functional service"""
        try:
            response = requests.post(
                f"{self.enrichment_url}/enrich",
                json={
                    'extracted_data': extracted_data,
                    'job_id': job_id
                },
                timeout=300
            )
            
            if response.ok:
                return response.json()
            else:
                raise Exception(f"Enrichment service error: {response.status_code} - {response.text}")
                
        except requests.exceptions.RequestException as e:
            raise Exception(f"Enrichment service call failed: {e}")
    
    async def _call_analysis_service(self, combined_data: Dict[str, Any], job_id: str) -> Dict[str, Any]:
        """Call analysis functional service"""
        try:
            response = requests.post(
                f"{self.analysis_url}/analyze",
                json={
                    'combined_data': combined_data,
                    'job_id': job_id
                },
                timeout=300
            )
            
            if response.ok:
                return response.json()
            else:
                raise Exception(f"Analysis service error: {response.status_code} - {response.text}")
                
        except requests.exceptions.RequestException as e:
            raise Exception(f"Analysis service call failed: {e}")
    
    async def _update_firestore_status(self, user_uid: str, job_id: str, status: str, message: str):
        """Update processing status in user-isolated Firestore collection"""
        try:
            collection_path = self.get_user_collection_path(user_uid)
            doc_ref = self.firestore_client.collection(collection_path).document(job_id)
            
            doc_ref.set({
                'jobId': job_id,
                'status': status,
                'message': message,
                'timestamp': datetime.now().isoformat(),
                'processing_mode': 'functional_services'
            }, merge=True)
            
            logger.info(f"📋 Updated Firestore status for {job_id}: {status} - {message}")
            
        except Exception as e:
            logger.error(f"❌ Failed to update Firestore status: {e}")
    
    def _create_compatible_result(self, job_id: str, bucket_path: str, user_context: Dict[str, Any], 
                                extraction_result: Dict[str, Any], enrichment_result: Dict[str, Any], 
                                analysis_result: Dict[str, Any]) -> Dict[str, Any]:
        """Create result format compatible with existing frontend expectations"""
        
        # Extract filename from bucket path
        filename = bucket_path.split('/')[-1] if '/' in bucket_path else bucket_path
        
        # Calculate totals
        total_tokens = (
            extraction_result.get('tokens_used', 0) + 
            enrichment_result.get('tokens_used', 0) + 
            analysis_result.get('tokens_used', 0)
        )
        
        total_time = (
            extraction_result.get('processing_time', 0) + 
            enrichment_result.get('processing_time', 0) + 
            analysis_result.get('processing_time', 0)
        )
        
        # Create frontend-compatible result
        result = {
            'jobId': job_id,
            'fileName': filename,
            'status': 'completed',
            'timestamp': datetime.now().isoformat(),
            'processing_mode': 'functional_services',
            'user_email': user_context.get('email', 'unknown'),
            'bucket_path': bucket_path,
            
            # Processing results
            'extracted_data': {
                'success': extraction_result['success'],
                'content': extraction_result['content'],
                'tokens_used': extraction_result['tokens_used'],
                'processing_time': extraction_result['processing_time']
            },
            'enriched_data': {
                'success': enrichment_result['success'], 
                'content': enrichment_result['content'],
                'tokens_used': enrichment_result['tokens_used'],
                'processing_time': enrichment_result['processing_time']
            },
            'analysis_data': {
                'success': analysis_result['success'],
                'content': analysis_result['content'], 
                'tokens_used': analysis_result['tokens_used'],
                'processing_time': analysis_result['processing_time']
            },
            
            # Summary stats
            'processing_stats': {
                'total_processing_time': total_time,
                'total_tokens_used': total_tokens,
                'tokens_per_second': total_tokens / total_time if total_time > 0 else 0,
                'phase_breakdown': {
                    'extraction': {
                        'time': extraction_result['processing_time'],
                        'tokens': extraction_result['tokens_used']
                    },
                    'enrichment': {
                        'time': enrichment_result['processing_time'], 
                        'tokens': enrichment_result['tokens_used']
                    },
                    'analysis': {
                        'time': analysis_result['processing_time'],
                        'tokens': analysis_result['tokens_used']
                    }
                }
            }
        }
        
        return result
    
    async def _store_final_result(self, user_uid: str, job_id: str, result: Dict[str, Any]):
        """Store final result in user-isolated Firestore collection"""
        try:
            collection_path = self.get_user_collection_path(user_uid)
            doc_ref = self.firestore_client.collection(collection_path).document(job_id)
            
            doc_ref.set(result)
            
            logger.info(f"💾 Stored final result for job {job_id} in {collection_path}")
            
        except Exception as e:
            logger.error(f"❌ Failed to store result in Firestore: {e}")
            raise Exception(f"Result storage failed: {e}")

# Export singleton instance 
functional_processing_manager = FunctionalProcessingManager()