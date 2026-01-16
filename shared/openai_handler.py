"""
Generic OpenAI API Handler
Standardized OpenAI client for all invoice processing agents
Handles text, image, and multimodal requests with consistent error handling
"""

import os
import json
import logging
import base64
from typing import Dict, Any, Optional, List, Union
from dataclasses import dataclass
from openai import OpenAI
import tiktoken

logger = logging.getLogger(__name__)

@dataclass
class OpenAIRequest:
    """Standardized OpenAI request parameters"""
    prompt: str
    model: str = "gpt-4o"
    temperature: float = 0.1
    max_tokens: Optional[int] = None
    image_content: Optional[str] = None  # base64 encoded
    image_format: Optional[str] = None   # png, jpeg, gif, webp
    context_name: str = "unknown"       # For logging/debugging
    
@dataclass 
class OpenAIResponse:
    """Standardized OpenAI response with error handling"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    raw_response: Optional[str] = None
    error: Optional[str] = None
    tokens_used: Optional[int] = None
    context_name: str = "unknown"

class OpenAIHandler:
    """
    Generic OpenAI API handler for all invoice processing services
    Provides consistent error handling, logging, and parameter management
    """
    
    def __init__(self, api_key: Optional[str] = None, service_name: str = "unknown"):
        """
        Initialize OpenAI handler
        
        Args:
            api_key: OpenAI API key (defaults to environment variable)
            service_name: Name of the calling service for logging
        """
        self.service_name = service_name
        self.api_key = api_key or self._get_api_key()
        self.client = self._initialize_client()
        self.encoding = self._initialize_tokenizer()
        
        logger.info(f"🤖 OpenAI Handler initialized for service: {service_name}")
    
    def _get_api_key(self) -> str:
        """Get OpenAI API key from environment or hardcoded fallback"""
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            # Fallback to hardcoded key (DataAnalyst1)
            api_key = "YOUR_OPENAI_API_KEY"
            logger.info("🔑 Using fallback DataAnalyst1 API key")
        return api_key
    
    def _initialize_client(self) -> OpenAI:
        """Initialize OpenAI client with proper configuration - improved from working code"""
        try:
            client = OpenAI(
                api_key=self.api_key,
                timeout=120.0,  # Optimized for Cloud Run
                max_retries=3   # Increased retries for reliability
            )
            logger.info(f"✅ OpenAI client initialized for {self.service_name}")
            return client
        except Exception as e:
            logger.error(f"❌ Failed to initialize OpenAI client: {str(e)}")
            raise
    
    def _initialize_tokenizer(self):
        """Initialize tokenizer for token counting"""
        try:
            return tiktoken.encoding_for_model("gpt-4o")
        except Exception as e:
            logger.warning(f"⚠️ Failed to initialize tokenizer: {str(e)}")
            return None
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        if self.encoding:
            try:
                return len(self.encoding.encode(text))
            except Exception:
                pass
        # Fallback estimation
        return len(text) // 4
    
    def _detect_image_format(self, base64_content: str) -> Optional[str]:
        """Detect image format from base64 content - enhanced from working code"""
        try:
            # Remove data URL prefix if present
            if base64_content.startswith('data:'):
                base64_content = base64_content.split(',', 1)[1]
            
            # Decode first few bytes to check magic numbers
            decoded = base64.b64decode(base64_content[:50] + "==")  # Add padding
            
            # Check magic numbers (from working code patterns)
            if decoded.startswith(b'\x89PNG'):
                return 'png'
            elif decoded.startswith(b'\xFF\xD8\xFF'):
                return 'jpeg'
            elif decoded.startswith(b'GIF87a') or decoded.startswith(b'GIF89a'):
                return 'gif'
            elif decoded.startswith(b'RIFF') and b'WEBP' in decoded[:20]:
                return 'webp'
            elif decoded.startswith(b'%PDF'):
                logger.info("PDF detected - would need pdf2image conversion")
                return 'png'  # PDFs converted to PNG in full implementation
            else:
                logger.warning(f"⚠️ Unknown image format for {self.service_name}")
                return 'jpeg'  # Default to JPEG as in working code
                
        except Exception as e:
            logger.warning(f"⚠️ Failed to detect image format: {str(e)}, defaulting to JPEG")
            return 'jpeg'  # Match working code default
    
    def _validate_base64_image(self, base64_content: str) -> bool:
        """Validate that base64 content is actually valid image data"""
        try:
            # Remove data URL prefix if present
            if base64_content.startswith('data:'):
                base64_content = base64_content.split(',', 1)[1]
            
            decoded = base64.b64decode(base64_content, validate=True)
            return len(decoded) > 10  # Must be at least 10 bytes for real image
        except Exception as e:
            logger.error(f"❌ Invalid base64 image data: {str(e)}")
            return False
    
    def _build_messages(self, request: OpenAIRequest) -> List[Dict[str, Any]]:
        """Build OpenAI messages from request parameters"""
        if request.image_content:
            # Validate image content
            if not self._validate_base64_image(request.image_content):
                raise ValueError("Invalid base64 image content")
            
            # Detect or use provided image format
            image_format = request.image_format or self._detect_image_format(request.image_content)
            
            # Build multimodal message
            return [{
                "role": "user",
                "content": [
                    {"type": "text", "text": request.prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/{image_format};base64,{request.image_content}"
                        }
                    }
                ]
            }]
        else:
            # Text-only message
            return [{"role": "user", "content": request.prompt}]
    
    def process_request(self, request: OpenAIRequest) -> OpenAIResponse:
        """
        Process OpenAI request with comprehensive error handling
        
        Args:
            request: OpenAIRequest with all parameters
            
        Returns:
            OpenAIResponse with success/failure and data
        """
        try:
            # Log request details
            input_tokens = self.count_tokens(request.prompt)
            logger.info(f"🤖 Processing {request.context_name} request")
            logger.info(f"📊 Input tokens: {input_tokens}, Model: {request.model}")
            logger.info(f"🖼️ Has image: {request.image_content is not None}")
            
            # Build messages
            messages = self._build_messages(request)
            
            # Prepare API call parameters
            api_params = {
                "model": request.model,
                "messages": messages,
                "temperature": request.temperature
            }
            
            # Add max_tokens if specified
            if request.max_tokens:
                api_params["max_tokens"] = request.max_tokens
                
            # Make API call
            logger.info(f"🚀 Calling OpenAI API for {request.context_name}")
            response = self.client.chat.completions.create(**api_params)
            
            # Extract response content
            result_text = response.choices[0].message.content.strip()
            tokens_used = response.usage.total_tokens if response.usage else None
            
            logger.info(f"✅ {request.context_name} API call successful")
            logger.info(f"📊 Tokens used: {tokens_used}")
            
            # Parse JSON response with cleanup (from proven working code)
            try:
                result_data = self._parse_openai_response(result_text)
                return OpenAIResponse(
                    success=True,
                    data=result_data,
                    raw_response=result_text,
                    tokens_used=tokens_used,
                    context_name=request.context_name
                )
            except Exception as e:
                logger.warning(f"⚠️ {request.context_name} response parsing failed: {str(e)}")
                return OpenAIResponse(
                    success=False,
                    error=f"Response parsing failed: {str(e)}",
                    raw_response=result_text,
                    tokens_used=tokens_used,
                    context_name=request.context_name
                )
                
        except Exception as e:
            logger.error(f"❌ {request.context_name} API call failed: {str(e)}")
            return OpenAIResponse(
                success=False,
                error=str(e),
                context_name=request.context_name
            )
    
    def extract_invoice_header(self, image_content: str, job_id: str) -> OpenAIResponse:
        """Convenience method for invoice header extraction"""
        prompt = """
You are a precise data extraction specialist. Extract ONLY header/document information from this invoice image.

EXTRACT THESE FIELDS ONLY:
- Vendor/Supplier details (name, address, GST number)
- Customer/Bill-to details (name, address, GST number)  
- Invoice metadata (number, date, due date)
- Financial totals (subtotal, tax amounts, total amount)
- Payment terms and conditions

DO NOT EXTRACT LINE ITEMS - Focus only on document header information.

Return JSON format:
{
  "vendor": {"name": "", "address": "", "gst_number": ""},
  "customer": {"name": "", "address": "", "gst_number": ""},
  "invoice_details": {"number": "", "date": "", "due_date": ""},
  "totals": {"subtotal": 0, "tax_amount": 0, "total_amount": 0},
  "payment_terms": ""
}
"""
        request = OpenAIRequest(
            prompt=prompt,
            image_content=image_content,
            context_name=f"Header_Extraction_{job_id}",
            model="gpt-4o",
            temperature=0.1
        )
        return self.process_request(request)
    
    def extract_invoice_line_items(self, image_content: str, job_id: str) -> OpenAIResponse:
        """Convenience method for invoice line items extraction"""
        prompt = """
You are a precise data extraction specialist. Extract ONLY the line items table from this invoice image.

EXTRACT THESE FIELDS FOR EACH LINE ITEM:
- Item description/name
- Quantity
- Unit price
- Line total/amount
- Tax rate (if applicable)
- HSN/SAC code (if applicable)

DO NOT EXTRACT HEADER INFORMATION - Focus only on tabular line item data.

Return JSON format:
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
        request = OpenAIRequest(
            prompt=prompt,
            image_content=image_content,
            context_name=f"LineItems_Extraction_{job_id}",
            model="gpt-4o", 
            temperature=0.1
        )
        return self.process_request(request)
    
    def extract_full_invoice_data(self, image_content: str, job_id: str) -> OpenAIResponse:
        """Comprehensive Indian purchase invoice processing - matches proven working code"""
        invoice_prompt = """You are an accountant for an INDIAN business recording PURCHASE / VENDOR invoices
in the BUYER'S books.

ASSUMPTIONS
- Every invoice image is a PURCHASE (vendor bill), never a sales invoice.
- The business is always the CUSTOMER on the invoice.
- Any GST/tax on the invoice is INPUT TAX (asset/debit), NOT output tax payable.

TASK
Read the invoice image and return a SINGLE JSON object with EXACTLY this shape
(keys must match; use empty string/null/0 if something is not present):

{
  "vendor_name": "",
  "invoice_number": "",
  "invoice_date": "",
  "due_date": "",
  "total_amount": 0,
  "currency": "",
  "gstin": "",
  "pan": "",
  "items": [
    {
      "description": "",
      "quantity": 0,
      "unit_price": 0,
      "total": 0,
      "hsn_code": "",
      "gst_rate": 0
    }
  ],
  "tax_details": {
    "cgst": 0,
    "sgst": 0,
    "igst": 0,
    "total_gst": 0,
    "taxable_amount": 0
  },
  "suggested_journal_entries": [
    {
      "account_name": "",
      "account_type": "",
      "debit_amount": 0,
      "credit_amount": 0,
      "narration": ""
    }
  ],
  "double_entry_bookkeeping": {
    "journal_entry_set": [
      {
        "entry_number": 1,
        "date": "",
        "entries": [
          {
            "account_name": "",
            "account_code": "",
            "account_type": "",
            "debit_amount": 0,
            "credit_amount": 0,
            "narration": ""
          }
        ],
        "total_debit": 0,
        "total_credit": 0,
        "is_balanced": true,
        "entry_description": ""
      }
    ]
  },
  "compliance_notes": {
    "gst_applicable": "",
    "tds_applicable": "",
    "accounting_standard": "",
    "expense_category": ""
  },
  "extracted_table": [
    []
  ]
}

OUTPUT FORMAT
- Return ONLY the JSON object.
- No explanations, no comments, no trailing commas."""
        
        request = OpenAIRequest(
            prompt=invoice_prompt,
            image_content=image_content,
            context_name=f"Full_Invoice_Extraction_{job_id}",
            model="gpt-4o",
            temperature=0.1
        )
        return self.process_request(request)
