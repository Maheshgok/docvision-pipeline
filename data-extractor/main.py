"""
Data Extractor Service - Phase 1 (Stages 1A + 1B)
Specialized Cloud Run service for invoice data extraction only
Using simple OpenAI handler with runtime prompts
"""

import os
import sys
import json
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS

from simple_openai_handler import create_extraction_handler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configure CORS
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

class DataExtractorService:
    def __init__(self):
        """Initialize with simple OpenAI handler"""
        self.openai_handler = create_extraction_handler("data-extractor")
        logger.info("🔧 Data Extractor Service initialized with simple handler")
        
        # Define prompts as class variables (can be modified at runtime)
        self.header_prompt = """
Extract header/document information from this invoice image and return ONLY valid JSON.

IMPORTANT: Your response must be ONLY valid JSON, no additional text or explanations.

Extract:
- Vendor details (name, address, GST number)
- Customer details (name, address, GST number)  
- Invoice metadata (number, date, due date)
- Financial totals (subtotal, tax amount, total amount)

Return this exact JSON structure:
{
  "vendor": {
    "name": "vendor company name",
    "address": "complete vendor address",
    "gst_number": "vendor GST number"
  },
  "customer": {
    "name": "customer company name",
    "address": "complete customer address", 
    "gst_number": "customer GST number"
  },
  "invoice_details": {
    "number": "invoice number",
    "date": "invoice date",
    "due_date": "due date"
  },
  "totals": {
    "subtotal": 0.00,
    "tax_amount": 0.00,
    "total_amount": 0.00
  }
}

Respond with ONLY the JSON object above, no other text.
"""
        
        self.line_items_prompt = """
Extract line items from this invoice image and return ONLY valid JSON.

IMPORTANT: Your response must be ONLY valid JSON, no additional text or explanations.

Extract each line item with:
- Description/name of product/service
- HSN/SAC code
- Quantity
- Rate/unit price
- Taxable amount
- GST percentage
- GST amount
- Total amount

Return this exact JSON structure:
{
  "line_items": [
    {
      "description": "product/service description",
      "hsn_code": "HSN/SAC code",
      "quantity": 0,
      "rate": 0.00,
      "taxable_amount": 0.00,
      "gst_percentage": 0.00,
      "gst_amount": 0.00,
      "total_amount": 0.00
    }
  ],
  "summary": {
    "total_items": 0,
    "total_quantity": 0,
    "total_taxable_amount": 0.00,
    "total_gst_amount": 0.00,
    "grand_total": 0.00
  }
}

Respond with ONLY the JSON object above, no other text.

EXTRACT each line item:
- Description, quantity, unit_price, total, tax_rate, hsn_code

Return JSON:
{
  "line_items": [
    {
      "description": "",
      "quantity": 0,
      "unit_price": 0,
      "line_total": 0,
      "tax_rate": 0,
      "hsn_code": ""
    }
  ]
}
"""

    def extract_invoice_data(self, image_content: str, job_id: str) -> dict:
        """Extract both header and line items using simple handler"""
        try:
            logger.info(f"🚀 Starting data extraction for job: {job_id}")
            
            # Stage 1A: Extract header data
            logger.info("📋 Stage 1A: Extracting header data")
            header_result = self.openai_handler.call_api(
                prompt=self.header_prompt,
                image_base64=image_content,
                context=f"Header_{job_id}"
            )
            
            if not header_result['success']:
                return {
                    'status': 'FAILED',
                    'stage': '1A',
                    'error': header_result['error'],
                    'job_id': job_id
                }
            
            # Parse header JSON - strip markdown if present
            try:
                content = header_result['content'].strip()
                # Remove markdown code blocks if present
                if content.startswith('```json'):
                    content = content.replace('```json', '').replace('```', '').strip()
                elif content.startswith('```'):
                    content = content.replace('```', '').strip()
                
                header_data = json.loads(content)
                logger.info(f"✅ Stage_1A_Header extraction successful")
            except json.JSONDecodeError as e:
                logger.error(f"❌ Stage_1A_Header JSON parse error: {e}")
                logger.error(f"📄 Raw OpenAI response: {header_result['content'][:500]}...")
                # Create fallback structure with raw content
                header_data = {
                    "vendor": {"name": "", "address": "", "gst_number": ""},
                    "customer": {"name": "", "address": "", "gst_number": ""},
                    "invoice_details": {"number": "", "date": "", "due_date": ""},
                    "totals": {"subtotal": 0, "tax_amount": 0, "total_amount": 0},
                    "_raw_content": header_result['content'],
                    "_parse_error": str(e)
                }
            
            # Stage 1B: Extract line items
            logger.info("📦 Stage 1B: Extracting line items")
            line_items_result = self.openai_handler.call_api(
                prompt=self.line_items_prompt,
                image_base64=image_content,
                context=f"LineItems_{job_id}"
            )
            
            if not line_items_result['success']:
                return {
                    'status': 'FAILED',
                    'stage': '1B',
                    'error': line_items_result['error'],
                    'job_id': job_id
                }
            
            # Parse line items JSON - strip markdown if present
            try:
                content = line_items_result['content'].strip()
                # Remove markdown code blocks if present
                if content.startswith('```json'):
                    content = content.replace('```json', '').replace('```', '').strip()
                elif content.startswith('```'):
                    content = content.replace('```', '').strip()
                    
                line_items_data = json.loads(content)
                line_items = line_items_data.get('line_items', [])
                logger.info(f"✅ Stage_1B_LineItems extraction successful")
            except json.JSONDecodeError as e:
                logger.error(f"❌ Stage_1B_LineItems JSON parse error: {e}")
                logger.error(f"📄 Raw OpenAI response: {line_items_result['content'][:500]}...")
                line_items = []
            
            # Success response
            extracted_data = {
                'header_data': header_data,
                'line_items': line_items
            }
            
            logger.info(f"✅ Data extraction completed for {job_id}")
            logger.info(f"📊 Extracted {len(line_items)} line items")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'extracted_data': extracted_data,
                'extraction_stats': {
                    'header_tokens': header_result['tokens_used'],
                    'line_items_tokens': line_items_result['tokens_used'],
                    'total_line_items': len(line_items)
                }
            }
            
        except Exception as e:
            logger.error(f"🚨 Critical error in data extraction: {str(e)}")
            return {
                'status': 'CRITICAL_FAIL',
                'job_id': job_id,
                'error': str(e)
            }

# Initialize service with simple handler
extractor_service = DataExtractorService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'data-extractor',
        'status': 'healthy',
        'version': '2.0.0',
        'handler': 'simple_openai_handler',
        'capabilities': ['header_extraction', 'line_items_extraction']
    })

@app.route('/extract-invoice-data', methods=['POST'])
def extract_invoice_data():
    """Main extraction endpoint using simple handler"""
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
        
        # Extract data through simple handler service
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