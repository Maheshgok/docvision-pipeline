"""
Data Extractor Service - Functional Handler Version (v2.1)
Memory and CPU optimized using functional OpenAI handler
"""

import os
import sys
import json
import logging
from flask import Flask, request, jsonify

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))
from functional_openai_handler import create_extraction_function

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

class DataExtractorService:
    def __init__(self):
        """Initialize with functional handler - no persistent state"""
        # Create extraction function (lightweight, no object state)
        self.extract_func = create_extraction_function("data-extractor-v2.1")
        logger.info("🔧 Data Extractor Service initialized with functional handler")
        
        # Define extraction prompt (can be modified at runtime)
        self.extraction_prompt = """
Extract structured data from this invoice image and return as JSON.

Extract these fields:
1. Invoice metadata (number, date, due date)
2. Vendor information (name, address, contact details)
3. Line items with descriptions, quantities, prices
4. Tax information (GST/VAT details)
5. Total amounts

Return JSON format:
{{
  "invoice_data": {{
    "invoice_number": "",
    "invoice_date": "",
    "vendor_name": "",
    "vendor_address": "",
    "line_items": [
      {{"description": "", "quantity": 0, "unit_price": 0, "total": 0}}
    ],
    "tax_details": {{"gst_rate": 0, "gst_amount": 0}},
    "total_amount": 0
  }}
}}
"""

    def extract_invoice_data(self, image_content: str, job_id: str) -> dict:
        """Extract invoice data using functional handler"""
        try:
            logger.info(f"🚀 Starting invoice extraction for job: {job_id}")
            
            # Call functional handler (no object state, pure function)
            result = self.extract_func(
                prompt=self.extraction_prompt,
                image_content=image_content,
                context=f"extraction_{job_id}"
            )
            
            if not result['success']:
                return {
                    'status': 'FAILED',
                    'error': result['error'],
                    'job_id': job_id
                }
            
            # Parse extraction JSON
            try:
                extracted_data = json.loads(result['content'])
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ Extraction JSON parse failed: {e}")
                extracted_data = {"invoice_data": {"parse_error": result['content']}}
            
            logger.info(f"✅ Invoice extraction completed for {job_id}")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'extracted_data': extracted_data,
                'processing_stats': {
                    'extraction_tokens': result['tokens_used'],
                    'handler_version': 'functional_v2.1',
                    'processing_time': logger.info(f"⏰ {job_id}")
                }
            }
            
        except Exception as e:
            logger.error(f"🚨 Critical error in invoice extraction: {str(e)}")
            return {
                'status': 'CRITICAL_FAIL',
                'job_id': job_id,
                'error': str(e)
            }

# Initialize service (no heavy object creation)
extractor_service = DataExtractorService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'data-extractor',
        'status': 'healthy',
        'version': '2.1.0',
        'handler': 'functional_openai_handler',
        'optimization': 'memory_cpu_optimized',
        'capabilities': ['invoice_extraction', 'ocr_processing', 'data_structuring']
    })

@app.route('/extract-invoice-data', methods=['POST'])
def extract_invoice_data():
    """Main extraction endpoint using functional handler"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No JSON data provided'
            }), 400
        
        image_content = data.get('image_content')
        job_id = data.get('job_id', 'unknown')
        
        if not image_content:
            return jsonify({
                'status': 'error',
                'error': 'image_content is required'
            }), 400
        
        logger.info(f"📥 Processing extraction request for job: {job_id}")
        
        # Extract data through functional handler (no object overhead)
        result = extractor_service.extract_invoice_data(image_content, job_id)
        
        if result['status'] == 'SUCCESS':
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"🚨 Critical error in extraction endpoint: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Critical system failure',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)