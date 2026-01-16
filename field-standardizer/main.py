"""
Field Standardizer Service
Standardizes extracted and enriched data field names to match frontend expectations
Handles the field mapping between internal processing and frontend display
"""
import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from typing import Dict, Any, List
from google.cloud import storage, firestore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configure CORS
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

# Initialize clients
project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
storage_client = storage.Client(project=project_id)
firestore_client = firestore.Client(project=project_id)

class FieldStandardizerService:
    def __init__(self):
        """Initialize with field mapping configurations"""
        self.logger = logging.getLogger(self.__class__.__name__)
        
        # Header field mappings (internal -> frontend)
        self.header_field_map = {
            'vendor_name': 'vendor_name',
            'invoice_number': 'invoice_number', 
            'invoice_date': 'invoice_date',
            'due_date': 'due_date',
            'total_amount': 'total_amount',
            'subtotal': 'subtotal',
            'tax_amount': 'tax_amount',
            'gstin': 'vendor_gstin',
            'vendor_gstin': 'vendor_gstin',
            'buyer_gstin': 'buyer_gstin',
            'place_of_supply': 'place_of_supply',
            'invoice_type': 'invoice_type',
            'currency': 'currency'
        }
        
        # Line item field mappings (internal -> frontend)
        self.line_item_field_map = {
            'sr_no': 'sr_no',
            'description': 'description',
            'item_name': 'description',
            'hsn_code': 'hsn_code',
            'hsn': 'hsn_code',
            'quantity': 'quantity',
            'qty': 'quantity',
            'rate': 'rate',
            'unit_price': 'rate',
            'amount': 'amount',
            'taxable_amount': 'taxable_amount',
            'taxable': 'taxable_amount',
            'gst_rate': 'gst_rate',
            'tax_rate': 'gst_rate',
            'gst_amount': 'gst_amount',
            'tax_amount': 'gst_amount',
            'total_amount': 'total_amount',
            'total': 'total_amount',
            'line_total': 'total_amount',
            # Enriched fields
            'business_category': 'business_category',
            'category': 'business_category',
            'business_use': 'business_use',
            'account_code': 'account_code',
            'expense_type': 'expense_type'
        }
        
        self.logger.info("🔧 Field Standardizer Service initialized")
    
    def standardize_header_fields(self, header_data: Dict[str, Any]) -> Dict[str, Any]:
        """Standardize header field names to match frontend expectations"""
        try:
            standardized = {}
            
            for internal_field, value in header_data.items():
                # Map to frontend field name
                frontend_field = self.header_field_map.get(internal_field, internal_field)
                standardized[frontend_field] = value
            
            # Ensure required fields exist with defaults
            required_fields = {
                'vendor_name': 'Unknown Vendor',
                'invoice_number': 'N/A', 
                'invoice_date': '',
                'total_amount': 0,
                'subtotal': 0,
                'tax_amount': 0
            }
            
            for field, default_value in required_fields.items():
                if field not in standardized or standardized[field] is None:
                    standardized[field] = default_value
            
            self.logger.info(f"📋 Standardized header fields: {len(standardized)} fields")
            return standardized
            
        except Exception as e:
            self.logger.error(f"❌ Header standardization failed: {e}")
            raise
    
    def standardize_line_item_fields(self, line_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Standardize line item field names to match frontend expectations"""
        try:
            standardized_items = []
            
            for item in line_items:
                standardized_item = {}
                
                for internal_field, value in item.items():
                    # Map to frontend field name
                    frontend_field = self.line_item_field_map.get(internal_field, internal_field)
                    standardized_item[frontend_field] = value
                
                # Ensure required fields exist with defaults
                required_fields = {
                    'sr_no': len(standardized_items) + 1,
                    'description': 'Unknown Item',
                    'quantity': 1,
                    'rate': 0,
                    'taxable_amount': 0,
                    'gst_rate': '0%',
                    'gst_amount': 0,
                    'total_amount': 0,
                    'business_category': 'Uncategorized',
                    'business_use': 'General',
                    'account_code': '5000',
                    'expense_type': 'Operational'
                }
                
                for field, default_value in required_fields.items():
                    if field not in standardized_item or standardized_item[field] is None:
                        standardized_item[field] = default_value
                
                standardized_items.append(standardized_item)
            
            self.logger.info(f"📦 Standardized {len(standardized_items)} line items")
            return standardized_items
            
        except Exception as e:
            self.logger.error(f"❌ Line item standardization failed: {e}")
            raise
    
    def standardize_complete_data(self, header_data: Dict[str, Any], line_items: List[Dict[str, Any]], job_id: str) -> Dict[str, Any]:
        """Standardize complete invoice data (header + line items)"""
        try:
            self.logger.info(f"🔄 Standardizing complete data for job: {job_id}")
            
            # Standardize header
            standardized_header = self.standardize_header_fields(header_data)
            
            # Standardize line items  
            standardized_line_items = self.standardize_line_item_fields(line_items)
            
            # Calculate summary totals from standardized line items
            total_taxable = sum(item.get('taxable_amount', 0) for item in standardized_line_items)
            total_gst = sum(item.get('gst_amount', 0) for item in standardized_line_items)
            total_amount = sum(item.get('total_amount', 0) for item in standardized_line_items)
            
            # Create standardized result
            standardized_result = {
                'invoice_header': standardized_header,
                'enriched_line_items': standardized_line_items,
                'tabulated_totals': {
                    'line_items_count': len(standardized_line_items),
                    'total_taxable_amount': round(total_taxable, 2),
                    'total_gst_amount': round(total_gst, 2),
                    'total_amount': round(total_amount, 2)
                },
                'standardization_metadata': {
                    'standardized_at': datetime.now().isoformat(),
                    'job_id': job_id,
                    'header_fields_mapped': len(standardized_header),
                    'line_items_processed': len(standardized_line_items)
                }
            }
            
            self.logger.info(f"✅ Standardization completed for job: {job_id}")
            return standardized_result
            
        except Exception as e:
            self.logger.error(f"❌ Complete standardization failed for job {job_id}: {e}")
            raise

# Initialize service
standardizer_service = FieldStandardizerService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'field-standardizer',
        'version': '1.0.0',
        'capabilities': ['header_standardization', 'line_item_standardization', 'field_mapping'],
        'timestamp': datetime.now().isoformat()
    })

@app.route('/standardize-invoice-data', methods=['POST'])
def standardize_data():
    """Main standardization endpoint"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No JSON data provided'
            }), 400
        
        extracted_data = data.get('extracted_data', {})
        enriched_data = data.get('enriched_data', {})
        job_id = data.get('job_id', 'unknown')
        
        # Extract header and line items from the input structure
        header_data = extracted_data.get('header_data', {})
        line_items = extracted_data.get('line_items', [])
        
        logger.info(f"📥 Standardization request for job: {job_id}")
        logger.info(f"📋 Header fields: {len(header_data)}, Line items: {len(line_items)}")
        
        # Standardize complete data
        result = standardizer_service.standardize_complete_data(header_data, line_items, job_id)
        
        return jsonify({
            'status': 'SUCCESS',
            'job_id': job_id,
            'standardized_data': {
                'extracted_data': {
                    'header_data': result['standardized_header'],
                    'line_items': result['standardized_line_items']
                },
                'enriched_data': enriched_data  # Pass through enriched data
            }
        }), 200
        
    except Exception as e:
        logger.error(f"🚨 Standardization error: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Standardization failed',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)