"""
Example: How to use shared OpenAI handler in queue-enrichment-processor
This demonstrates the standardized pattern for all services
"""

import sys
import os
import logging
from flask import Flask, request, jsonify

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))
from openai_handler import OpenAIHandler, OpenAIRequest, OpenAIResponse

logger = logging.getLogger(__name__)

class EnrichmentProcessor:
    def __init__(self):
        """Initialize with shared OpenAI handler"""
        self.openai_handler = OpenAIHandler(service_name="queue-enrichment-processor")
        
    def enrich_data(self, extracted_data: dict, job_id: str) -> dict:
        """Example enrichment using shared handler"""
        try:
            # Build enrichment prompt
            enrichment_prompt = f"""
You are a data enrichment specialist. Enhance this invoice data with additional insights:
{extracted_data}

Add these enrichments:
1. Categorize each line item by type (product/service)
2. Add tax compliance notes
3. Identify potential data quality issues
4. Add accounting journal suggestions

Return enhanced JSON with original data plus enrichments.
"""
            
            # Use shared handler for enrichment
            request = OpenAIRequest(
                prompt=enrichment_prompt,
                model="gpt-4o",
                context_name=f"Enrichment_{job_id}",
                temperature=0.2
            )
            
            response = self.openai_handler.process_request(request)
            
            if response.success:
                return {
                    'status': 'SUCCESS',
                    'enriched_data': response.data,
                    'tokens_used': response.tokens_used
                }
            else:
                return {
                    'status': 'FAILED',
                    'error': response.error
                }
                
        except Exception as e:
            logger.error(f"❌ Enrichment failed: {str(e)}")
            return {
                'status': 'FAILED', 
                'error': str(e)
            }

# This pattern can be used in ALL services:
# - data-extractor (✅ implemented)
# - queue-enrichment-processor 
# - data-combiner
# - Any future services