"""
Queue Enrichment Processor - Phase 2 of Invoice Processing Pipeline

This service receives extracted invoice data from Phase 1 (data-extractor)
and enriches line items in batches of 4 using OpenAI for:
1. Business category classification 
2. Expense type identification
3. Tax implications analysis
4. Financial categorization

Optimized for fast startup with lazy initialization.
"""

import os
import json
import logging
import time
from datetime import datetime
from typing import Dict, List, Any, Optional
from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import concurrent.futures

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins="*")

# Lazy-loaded global instances
_openai_handler = None
_startup_time = None

def get_openai_handler():
    """Lazy initialization of OpenAI handler"""
    global _openai_handler, _startup_time
    
    if _openai_handler is None:
        start_time = time.time()
        
        # Import and initialize OpenAI handler only when needed
        from simple_openai_handler import SimpleOpenAIHandler
        _openai_handler = SimpleOpenAIHandler()
        
        init_time = time.time() - start_time
        logger.info(f"🚀 OpenAI handler initialized in {init_time:.2f}s")
        
        if _startup_time is None:
            _startup_time = time.time()
    
    return _openai_handler

class QueueEnrichmentService:
    """
    Phase 2 enrichment service that processes line items in batches
    """
    
    def __init__(self):
        self.batch_size = 4  # Process 4 line items at a time
        logger.info("📦 QueueEnrichmentService initialized")
        
    def extract_line_items(self, extraction_data: Dict) -> List[Dict]:
        """Extract line items from data extractor output"""
        try:
            # Handle different possible structures from data extractor
            line_items = []
            
            # Try to find line items in various possible locations
            if isinstance(extraction_data, dict):
                # Look for line_items, items, products, or similar keys
                for key in ['line_items', 'items', 'products', 'invoice_items', 'details']:
                    if key in extraction_data and isinstance(extraction_data[key], list):
                        line_items = extraction_data[key]
                        break
                
                # If no line items found, check if the whole data is a list of items
                if not line_items and isinstance(extraction_data.get('extraction_result'), list):
                    line_items = extraction_data['extraction_result']
                    
                # Last resort: look for any list in the data
                if not line_items:
                    for value in extraction_data.values():
                        if isinstance(value, list) and len(value) > 0:
                            # Check if this looks like line items (has description/amount/etc)
                            first_item = value[0]
                            if isinstance(first_item, dict) and any(
                                key in first_item for key in ['description', 'item', 'product', 'amount', 'price', 'quantity']
                            ):
                                line_items = value
                                break
                                
            logger.info(f"📊 Extracted {len(line_items)} line items for enrichment")
            return line_items
            
        except Exception as e:
            logger.error(f"❌ Error extracting line items: {e}")
            return []
    
    def create_batches(self, line_items: List[Dict]) -> List[List[Dict]]:
        """Split line items into batches of specified size"""
        batches = []
        for i in range(0, len(line_items), self.batch_size):
            batch = line_items[i:i + self.batch_size]
            batches.append(batch)
        
        logger.info(f"🔢 Created {len(batches)} batches of {self.batch_size} items each")
        return batches
    
    def create_enrichment_prompt(self, line_items_batch: List[Dict]) -> str:
        """Create OpenAI prompt for batch enrichment"""
        prompt = """You are an expert financial analyst. Analyze these invoice line items and provide enrichment data for each item.

For each line item, provide:
1. business_category: Primary business category (e.g., "Office Supplies", "Software", "Travel", "Marketing")
2. expense_type: Accounting expense type (e.g., "Operating Expense", "Capital Expense", "Cost of Goods Sold")
3. tax_implications: Tax treatment (e.g., "Deductible", "Non-deductible", "Depreciation Required")
4. financial_category: Financial reporting category (e.g., "Administrative", "Sales", "R&D", "General")

Line items to analyze:
"""
        
        for i, item in enumerate(line_items_batch, 1):
            prompt += f"\nItem {i}:\n"
            prompt += f"Description: {item.get('description', item.get('item', item.get('product', 'N/A')))}\n"
            prompt += f"Amount: {item.get('amount', item.get('price', item.get('total', 'N/A')))}\n"
            prompt += f"Quantity: {item.get('quantity', item.get('qty', 'N/A'))}\n"
            if item.get('category'):
                prompt += f"Existing Category: {item.get('category')}\n"
        
        prompt += """

Respond with a JSON array where each object corresponds to a line item (in the same order) with this structure:
{
  "item_index": 1,
  "business_category": "Office Supplies",
  "expense_type": "Operating Expense", 
  "tax_implications": "Deductible",
  "financial_category": "Administrative",
  "confidence_score": 0.95
}

Only return the JSON array, no other text."""
        
        return prompt
    
    async def enrich_batch(self, batch: List[Dict], batch_index: int) -> List[Dict]:
        """Enrich a single batch of line items using OpenAI"""
        try:
            logger.info(f"🔄 Processing batch {batch_index + 1} with {len(batch)} items")
            
            # Get OpenAI handler (lazy loaded)
            handler = get_openai_handler()
            
            # Create enrichment prompt
            prompt = self.create_enrichment_prompt(batch)
            
            # Get enrichment from OpenAI
            response = await handler.get_completion_async(
                prompt=prompt,
                model="gpt-4o",
                temperature=0.2,
                max_tokens=2000
            )
            
            # Parse the response
            try:
                enrichment_data = json.loads(response.strip())
                
                # Validate response format
                if not isinstance(enrichment_data, list) or len(enrichment_data) != len(batch):
                    logger.warning(f"⚠️ Enrichment response format mismatch for batch {batch_index + 1}")
                    # Create fallback enrichment
                    enrichment_data = self.create_fallback_enrichment(batch)
                    
            except json.JSONDecodeError as e:
                logger.error(f"❌ JSON parse error for batch {batch_index + 1}: {e}")
                enrichment_data = self.create_fallback_enrichment(batch)
            
            # Merge enrichment data with original line items
            enriched_items = []
            for i, item in enumerate(batch):
                enriched_item = item.copy()
                
                if i < len(enrichment_data):
                    enrichment = enrichment_data[i]
                    enriched_item.update({
                        'business_category': enrichment.get('business_category', 'Unclassified'),
                        'expense_type': enrichment.get('expense_type', 'Operating Expense'),
                        'tax_implications': enrichment.get('tax_implications', 'Review Required'),
                        'financial_category': enrichment.get('financial_category', 'General'),
                        'confidence_score': enrichment.get('confidence_score', 0.5),
                        'enrichment_timestamp': datetime.now().isoformat(),
                        'enrichment_batch': batch_index + 1
                    })
                else:
                    # Fallback for missing enrichment
                    enriched_item.update(self.create_fallback_enrichment([item])[0])
                
                enriched_items.append(enriched_item)
            
            logger.info(f"✅ Batch {batch_index + 1} enriched successfully")
            return enriched_items
            
        except Exception as e:
            logger.error(f"❌ Error enriching batch {batch_index + 1}: {e}")
            # Return original items with minimal enrichment
            return [self.add_error_enrichment(item, str(e)) for item in batch]
    
    def create_fallback_enrichment(self, batch: List[Dict]) -> List[Dict]:
        """Create basic enrichment when OpenAI processing fails"""
        fallback_data = []
        for i, item in enumerate(batch):
            fallback_data.append({
                'item_index': i + 1,
                'business_category': 'Unclassified',
                'expense_type': 'Operating Expense',
                'tax_implications': 'Review Required',
                'financial_category': 'General',
                'confidence_score': 0.1
            })
        return fallback_data
    
    def add_error_enrichment(self, item: Dict, error_msg: str) -> Dict:
        """Add error enrichment to item"""
        enriched_item = item.copy()
        enriched_item.update({
            'business_category': 'Processing Error',
            'expense_type': 'Review Required',
            'tax_implications': 'Manual Review',
            'financial_category': 'Error',
            'confidence_score': 0.0,
            'enrichment_error': error_msg,
            'enrichment_timestamp': datetime.now().isoformat()
        })
        return enriched_item
    
    async def process_extracted_data(self, extraction_data: Dict, job_id: str) -> Dict:
        """Main processing method that enriches line items in batches"""
        try:
            start_time = time.time()
            logger.info(f"🎯 Starting enrichment processing for job {job_id}")
            
            # Extract line items from data extractor output
            line_items = self.extract_line_items(extraction_data)
            
            if not line_items:
                logger.warning(f"⚠️ No line items found in extraction data for job {job_id}")
                return {
                    'status': 'SUCCESS',
                    'job_id': job_id,
                    'enriched_items': [],
                    'total_items': 0,
                    'processing_time': time.time() - start_time,
                    'message': 'No line items found to enrich'
                }
            
            # Create batches
            batches = self.create_batches(line_items)
            
            # Process batches concurrently (but limit concurrency to avoid rate limits)
            max_concurrent = min(3, len(batches))  # Max 3 concurrent batches
            
            enriched_batches = []
            semaphore = asyncio.Semaphore(max_concurrent)
            
            async def process_batch_with_semaphore(batch, batch_index):
                async with semaphore:
                    return await self.enrich_batch(batch, batch_index)
            
            # Process all batches
            tasks = [
                process_batch_with_semaphore(batch, i) 
                for i, batch in enumerate(batches)
            ]
            
            enriched_batches = await asyncio.gather(*tasks)
            
            # Flatten results
            all_enriched_items = []
            for batch_result in enriched_batches:
                all_enriched_items.extend(batch_result)
            
            processing_time = time.time() - start_time
            
            result = {
                'status': 'SUCCESS',
                'job_id': job_id,
                'enriched_items': all_enriched_items,
                'original_data': extraction_data,  # Preserve original extraction data
                'total_items': len(all_enriched_items),
                'batches_processed': len(batches),
                'processing_time': processing_time,
                'enrichment_timestamp': datetime.now().isoformat()
            }
            
            logger.info(f"✅ Enrichment completed for job {job_id}: {len(all_enriched_items)} items in {processing_time:.2f}s")
            return result
            
        except Exception as e:
            logger.error(f"❌ Critical error in enrichment processing for job {job_id}: {e}")
            return {
                'status': 'CRITICAL_FAIL',
                'job_id': job_id,
                'error': str(e),
                'enriched_items': [],
                'processing_time': time.time() - start_time if 'start_time' in locals() else 0
            }

# Lazy service initialization
_service_instance = None

def get_service():
    """Get service instance with lazy initialization"""
    global _service_instance
    if _service_instance is None:
        _service_instance = QueueEnrichmentService()
        logger.info("🚀 QueueEnrichmentService initialized on first use")
    return _service_instance

# Flask Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'queue-enrichment-processor',
        'timestamp': datetime.now().isoformat(),
        'startup_time': _startup_time
    })

@app.route('/enrich', methods=['POST'])
def enrich_data():
    """Main enrichment endpoint"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        job_id = data.get('job_id', 'unknown')
        extraction_data = data.get('extracted_data', data.get('data', {}))
        
        if not extraction_data:
            return jsonify({'error': 'No extraction data provided'}), 400
        
        # Get service instance
        service = get_service()
        
        # Process using asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                service.process_extracted_data(extraction_data, job_id)
            )
        finally:
            loop.close()
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"❌ Enrichment endpoint error: {e}")
        return jsonify({
            'status': 'CRITICAL_FAIL',
            'error': str(e),
            'job_id': data.get('job_id', 'unknown') if 'data' in locals() else 'unknown'
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"🚀 Queue Enrichment Service starting on port {port}")
    
    # Record startup time
    _startup_time = time.time()
    
    app.run(host='0.0.0.0', port=port, debug=False)