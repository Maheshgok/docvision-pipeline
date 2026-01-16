"""
Data Combiner Service - Final Pipeline Stage
Combines standardized data and stores to Firestore
NO OpenAI needed - standardizer handles all LLM work
"""
import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from typing import List, Dict, Any
from google.cloud import firestore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configure CORS
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

# Lazy initialization of Firestore
project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
firestore_client = None

def get_firestore_client():
    """Lazy initialization of Firestore client"""
    global firestore_client
    if firestore_client is None:
        firestore_client = firestore.Client(project=project_id)
        logger.info("🔥 Firestore client initialized")
    return firestore_client


def parse_amount(value) -> float:
    """Parse amount string handling commas, currency symbols, etc."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    # Remove commas, currency symbols, spaces
    cleaned = str(value).replace(',', '').replace('₹', '').replace('$', '').replace(' ', '').strip()
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0

def validate_accounting_balance(journal_entries: List[Dict]) -> Dict[str, Any]:
    """Validate that all journal entries are balanced (debits = credits)"""
    try:
        total_debit = 0.0
        total_credit = 0.0
        
        for entry in journal_entries:
            # Check for enrichment_data with pre-calculated totals (from enrichment-worker)
            enrichment_data = entry.get('enrichment_data', {})
            if enrichment_data:
                # Use pre-calculated totals from enrichment-worker
                if 'total_debit' in enrichment_data and 'total_credit' in enrichment_data:
                    total_debit += parse_amount(enrichment_data.get('total_debit', 0))
                    total_credit += parse_amount(enrichment_data.get('total_credit', 0))
                    continue
                
                # Or drill into journal_entry.entries
                journal_entry = enrichment_data.get('journal_entry', {})
                if 'entries' in journal_entry:
                    for line in journal_entry.get('entries', []):
                        total_debit += parse_amount(line.get('debit', 0))
                        total_credit += parse_amount(line.get('credit', 0))
                    continue
            
            # Fallback: Handle flat entries directly on the entry
            if 'entries' in entry:
                for line in entry.get('entries', []):
                    total_debit += parse_amount(line.get('debit', 0))
                    total_credit += parse_amount(line.get('credit', 0))
            else:
                # Simple flat format
                total_debit += parse_amount(entry.get('debit', 0))
                total_credit += parse_amount(entry.get('credit', 0))
        
        is_balanced = abs(total_debit - total_credit) < 0.01  # Allow for rounding
        
        return {
            'is_balanced': is_balanced,
            'total_debit': round(total_debit, 2),
            'total_credit': round(total_credit, 2),
            'difference': round(abs(total_debit - total_credit), 2)
        }
        
    except Exception as e:
        logger.error(f"❌ Balance validation failed: {str(e)}")
        return {
            'is_balanced': False,
            'total_debit': 0,
            'total_credit': 0,
            'error': str(e)
        }


def flatten_journal_entries_for_frontend(raw_entries: List[Dict], header_data: Dict) -> List[Dict]:
    """
    Transform backend journal entries into the flat format expected by frontend.
    
    Frontend expects each entry to have:
    - account_name, account_code
    - debit_amount, credit_amount (not debit, credit)
    - hsn_code, narration, item_description
    - gst_amount, cgst_amount, sgst_amount, igst_amount
    - taxable_amount, line_total, quantity, unit_price
    """
    flattened = []
    
    logger.info(f"🔍 FLATTEN DEBUG: Processing {len(raw_entries)} raw entries")
    logger.info(f"🔍 FLATTEN DEBUG: Header data: {json.dumps(header_data, default=str)}")
    
    for idx, entry in enumerate(raw_entries):
        logger.info(f"🔍 FLATTEN DEBUG: Entry {idx} keys: {list(entry.keys())}")
        logger.info(f"🔍 FLATTEN DEBUG: Entry {idx} full data: {json.dumps(entry, default=str)[:1000]}")
        
        enrichment_data = entry.get('enrichment_data', {})
        logger.info(f"🔍 FLATTEN DEBUG: Entry {idx} enrichment_data keys: {list(enrichment_data.keys()) if enrichment_data else 'NONE'}")
        
        journal_entry = enrichment_data.get('journal_entry', {})
        logger.info(f"🔍 FLATTEN DEBUG: Entry {idx} journal_entry keys: {list(journal_entry.keys()) if journal_entry else 'NONE'}")
        
        entries_list = journal_entry.get('entries', [])
        logger.info(f"🔍 FLATTEN DEBUG: Entry {idx} has {len(entries_list)} journal lines")
        
        # If no enrichment_data.journal_entry.entries, try alternate structures
        if not entries_list:
            # Try: entry might have direct debit/credit from standardizer
            if 'debit' in entry or 'credit' in entry:
                logger.info(f"🔍 FLATTEN DEBUG: Entry {idx} has direct debit/credit fields")
                flat_entry = {
                    'line_number': str(idx),
                    'reference_number': header_data.get('invoice_number', ''),
                    'invoice_date': header_data.get('invoice_date', ''),
                    'vendor_name': header_data.get('vendor_name', ''),
                    'account_name': entry.get('account_name', ''),
                    'account_code': entry.get('account_code', ''),
                    'account_type': 'Expense' if parse_amount(entry.get('debit', 0)) > 0 else 'Liability',
                    'debit_amount': parse_amount(entry.get('debit', 0)),
                    'credit_amount': parse_amount(entry.get('credit', 0)),
                    'narration': entry.get('description', entry.get('narration', '')),
                    'item_description': entry.get('description', entry.get('item_description', '')),
                    'hsn_code': entry.get('hsn_code', ''),
                    'tax_rate': entry.get('tax_rate', 0),
                    'gst_amount': 0,
                    'cgst_amount': 0,
                    'sgst_amount': 0,
                    'igst_amount': 0,
                    'is_gst_applicable': False,
                    'quantity': parse_amount(entry.get('quantity', 0)),
                    'unit_price': parse_amount(entry.get('unit_price', 0)),
                    'taxable_amount': parse_amount(entry.get('amount', 0)),
                    'line_total': parse_amount(entry.get('amount', 0)),
                    'entry_balanced': True,
                    'place_of_supply': ''
                }
                flattened.append(flat_entry)
                continue
            
            # Try: enrichment_data has total_debit/total_credit (use as summary entry)
            if enrichment_data and 'total_debit' in enrichment_data:
                logger.info(f"🔍 FLATTEN DEBUG: Entry {idx} has enrichment totals, creating summary entry")
                flat_entry = {
                    'line_number': str(idx),
                    'reference_number': header_data.get('invoice_number', ''),
                    'invoice_date': header_data.get('invoice_date', ''),
                    'vendor_name': header_data.get('vendor_name', ''),
                    'account_name': enrichment_data.get('account_name', entry.get('description', '')),
                    'account_code': enrichment_data.get('account_code', ''),
                    'account_type': 'Expense',
                    'debit_amount': parse_amount(enrichment_data.get('total_debit', 0)),
                    'credit_amount': parse_amount(enrichment_data.get('total_credit', 0)),
                    'narration': entry.get('description', ''),
                    'item_description': entry.get('description', ''),
                    'hsn_code': entry.get('hsn_code') or enrichment_data.get('hsn_code', ''),
                    'tax_rate': entry.get('tax_rate', 0),
                    'gst_amount': 0,
                    'cgst_amount': 0,
                    'sgst_amount': 0,
                    'igst_amount': 0,
                    'is_gst_applicable': enrichment_data.get('tax_category', '').startswith('GST') if enrichment_data.get('tax_category') else False,
                    'quantity': parse_amount(entry.get('quantity', 0)),
                    'unit_price': parse_amount(entry.get('unit_price', 0)),
                    'taxable_amount': parse_amount(entry.get('amount', 0)),
                    'line_total': parse_amount(entry.get('amount', 0)),
                    'entry_balanced': enrichment_data.get('is_balanced', True),
                    'place_of_supply': ''
                }
                flattened.append(flat_entry)
                continue
            
            logger.warning(f"⚠️ FLATTEN DEBUG: Entry {idx} has no processable journal entries")
            continue
        
        # Create one flattened entry per journal line from enrichment
        for line_idx, line in enumerate(entries_list):
            logger.info(f"🔍 FLATTEN DEBUG: Entry {idx} line {line_idx}: {json.dumps(line, default=str)}")
            flat_entry = {
                # Core identifiers
                'line_number': f"{idx}_{line_idx}",
                'reference_number': header_data.get('invoice_number', ''),
                'invoice_date': header_data.get('invoice_date', ''),
                'vendor_name': header_data.get('vendor_name', ''),
                
                # Account info - frontend expects these exact names
                'account_name': line.get('account', enrichment_data.get('account_name', '')),
                'account_code': enrichment_data.get('account_code', ''),
                'account_type': 'Expense' if parse_amount(line.get('debit', 0)) > 0 else 'Liability',
                
                # Amounts - frontend expects debit_amount/credit_amount (not debit/credit)
                'debit_amount': parse_amount(line.get('debit', 0)),
                'credit_amount': parse_amount(line.get('credit', 0)),
                
                # Description fields - use line description or original entry description
                'narration': line.get('description', entry.get('description', '')),
                'item_description': line.get('description', entry.get('description', '')),
                
                # Tax fields - GST data available for exports
                'hsn_code': entry.get('hsn_code') or enrichment_data.get('hsn_code', ''),
                'tax_rate': entry.get('tax_rate', 0),
                'gst_amount': 0,
                'cgst_amount': 0,
                'sgst_amount': 0,
                'igst_amount': 0,
                'is_gst_applicable': enrichment_data.get('tax_category', '').startswith('GST') if enrichment_data.get('tax_category') else False,
                
                # Quantity/pricing (only for main expense line, not GST lines)
                'quantity': parse_amount(entry.get('quantity', 0)) if line_idx == 0 else 0,
                'unit_price': parse_amount(entry.get('unit_price', 0)) if line_idx == 0 else 0,
                'taxable_amount': parse_amount(entry.get('amount', 0)) if line_idx == 0 else 0,
                'line_total': parse_amount(entry.get('amount', 0)) if line_idx == 0 else 0,
                
                # Balance indicator
                'entry_balanced': enrichment_data.get('is_balanced', True),
                'place_of_supply': ''
            }
            
            # Calculate GST components based on account name for data export
            if 'CGST' in line.get('account', ''):
                flat_entry['cgst_amount'] = flat_entry['debit_amount']
                flat_entry['gst_amount'] = flat_entry['cgst_amount']
            elif 'SGST' in line.get('account', ''):
                flat_entry['sgst_amount'] = flat_entry['debit_amount']
                flat_entry['gst_amount'] = flat_entry['sgst_amount']
            elif 'IGST' in line.get('account', ''):
                flat_entry['igst_amount'] = flat_entry['debit_amount']
                flat_entry['gst_amount'] = flat_entry['igst_amount']
            
            flattened.append(flat_entry)
    
    logger.info(f"📋 Flattened {len(raw_entries)} raw entries into {len(flattened)} frontend entries")
    return flattened


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'data-combiner'})


@app.route('/combine-and-store', methods=['POST'])
def combine_and_store_data():
    """
    Final Pipeline Stage: Combine standardized data and store to Firestore
    
    Input: {
        "job_id": "unique_job_id",
        "processed_data": {
            "standardized_header": {...},
            "standardized_journal_entries": [...]
        },
        "user_context": {
            "uid": "user_uid",
            "email": "user@email.com",
            "filename": "invoice.pdf"
        },
        "job_metadata": {
            "gcs_input_path": "gs://...",
            "created_at": "..."
        }
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'error': 'No JSON data provided'}), 400
        
        job_id = data.get('job_id', 'unknown')
        processed_data = data.get('processed_data', {})
        user_context = data.get('user_context', {})
        job_metadata = data.get('job_metadata', {})
        
        logger.info(f"🔗 Combining and storing data for job: {job_id}")
        
        # Extract processed components
        header_data = processed_data.get('standardized_header', {})
        journal_entries = processed_data.get('standardized_journal_entries', [])
        
        if not header_data:
            return jsonify({'status': 'error', 'error': 'Missing header data'}), 400
        
        if not journal_entries:
            return jsonify({'status': 'error', 'error': 'Missing journal entries'}), 400
        
        # Get user context
        user_uid = user_context.get('uid')
        if not user_uid:
            return jsonify({'status': 'error', 'error': 'Missing user_context.uid'}), 400
        
        # Validate accounting balance (uses raw entries with enrichment_data)
        balance_check = validate_accounting_balance(journal_entries)
        
        if not balance_check['is_balanced']:
            logger.warning(f"⚠️ Job {job_id} - Accounting entries not balanced! Diff: {balance_check['difference']}")
        
        # Flatten entries for frontend (converts nested structure to flat format)
        frontend_journal_entries = flatten_journal_entries_for_frontend(journal_entries, header_data)
        
        # Get Firestore client
        db = get_firestore_client()
        
        # Create final document for frontend
        # Frontend expects 'result' field containing journal_entries and invoice_details
        invoice_result = {
            'id': job_id,
            'job_id': job_id,
            'status': 'completed',
            'original_filename': user_context.get('filename', 'unknown'),
            'created_at': job_metadata.get('created_at', datetime.now().isoformat()),
            'updated_at': datetime.now().isoformat(),
            'completed_at': datetime.now().isoformat(),
            'gcs_input_path': job_metadata.get('gcs_input_path', ''),
            'user_email': user_context.get('email', ''),
            'userUID': user_uid,
            # Frontend expects 'result' field with nested structure
            'result': {
                'journal_entries': frontend_journal_entries,  # Flattened for frontend
                'invoice_details': {
                    'invoice_number': header_data.get('invoice_number', ''),
                    'invoice_date': header_data.get('invoice_date', ''),
                    'total_amount': header_data.get('total_amount', 0),
                    'tax_amount': header_data.get('tax_amount', 0)
                },
                'vendor_details': {
                    'name': header_data.get('vendor_name', ''),
                    'gstin': header_data.get('vendor_gstin', '')
                },
                'buyer_details': {
                    'name': header_data.get('buyer_name', ''),
                    'gstin': header_data.get('buyer_gstin', '')
                },
                'balance_validation': balance_check
            },
            'processing_metadata': {
                'total_entries': len(frontend_journal_entries),  # Flattened count
                'raw_line_items': len(journal_entries),  # Original line item count
                'is_balanced': balance_check['is_balanced'],
                'total_debit': balance_check['total_debit'],
                'total_credit': balance_check['total_credit'],
                'processing_pipeline': 'orchestrated_pipeline_v2',
                'stored_by': 'data_combiner'
            }
        }
        
        # Store to users/{uid}/invoice_results/{job_id}
        db.collection('users').document(user_uid).collection('invoice_results').document(job_id).set(invoice_result)
        logger.info(f"💾 Stored result to users/{user_uid}/invoice_results/{job_id}")
        
        storage_result = {
            'stored': True,
            'document_id': job_id,
            'storage_timestamp': datetime.now().isoformat(),
            'storage_location': f"users/{user_uid}/invoice_results/{job_id}",
            'document_size_bytes': len(json.dumps(invoice_result))
        }
        
        logger.info(f"✅ Job {job_id} completed - {len(frontend_journal_entries)} frontend entries from {len(journal_entries)} line items, balanced: {balance_check['is_balanced']}, debit: {balance_check['total_debit']}, credit: {balance_check['total_credit']}")
        
        return jsonify({
            'status': 'SUCCESS',
            'job_id': job_id,
            'storage_result': storage_result,
            'summary': {
                'total_journal_entries': len(frontend_journal_entries),
                'raw_line_items': len(journal_entries),
                'is_balanced': balance_check['is_balanced'],
                'total_debit': balance_check['total_debit'],
                'total_credit': balance_check['total_credit']
            }
        }), 200
        
    except Exception as e:
        logger.error(f"🚨 Critical error in combine-and-store: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Critical system failure',
            'message': str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
