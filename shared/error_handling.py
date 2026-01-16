"""
Shared Error Handling Utilities
Standardized error responses and exception handling
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime
from flask import jsonify

logger = logging.getLogger(__name__)

class APIError(Exception):
    """Custom exception for API errors with structured response"""
    
    def __init__(
        self, 
        message: str, 
        error_code: str, 
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

class ErrorHandler:
    """Centralized error handling utilities"""
    
    @staticmethod
    def format_error_response(
        error_message: str,
        error_code: str,
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None,
        job_id: Optional[str] = None,
        tenant_id: Optional[str] = None
    ) -> tuple:
        """
        Format standardized error response
        
        Returns:
            Tuple of (json_response, status_code)
        """
        response_data = {
            'error': error_message,
            'error_code': error_code,
            'status': 'ERROR',
            'timestamp': datetime.utcnow().isoformat()
        }
        
        if job_id:
            response_data['job_id'] = job_id
        if tenant_id:
            response_data['tenant_id'] = tenant_id
        if details:
            response_data['details'] = details
            
        return jsonify(response_data), status_code
    
    @staticmethod
    def handle_auth_error(error: Exception, job_id: Optional[str] = None) -> tuple:
        """Handle authentication errors"""
        logger.error(f"🔐 Auth error: {error}")
        return ErrorHandler.format_error_response(
            "Authentication failed",
            "AUTH_ERROR",
            401,
            {"original_error": str(error)},
            job_id
        )
    
    @staticmethod
    def handle_tenant_access_error(
        user_tenant: str,
        required_tenant: str,
        job_id: Optional[str] = None
    ) -> tuple:
        """Handle tenant access violations"""
        logger.error(f"🚫 Tenant access denied: user={user_tenant}, required={required_tenant}")
        return ErrorHandler.format_error_response(
            "Access denied for this tenant",
            "TENANT_ACCESS_DENIED",
            403,
            {
                "user_tenant": user_tenant,
                "required_tenant": required_tenant
            },
            job_id
        )
    
    @staticmethod
    def handle_openai_error(error: Exception, context: Dict[str, Any]) -> tuple:
        """Handle OpenAI API errors"""
        logger.error(f"🤖 OpenAI error: {error}")
        
        error_message = "AI processing failed"
        error_code = "OPENAI_ERROR"
        
        # Categorize different OpenAI errors
        error_str = str(error).lower()
        if "rate limit" in error_str:
            error_message = "AI service rate limit exceeded"
            error_code = "RATE_LIMIT_EXCEEDED"
        elif "timeout" in error_str:
            error_message = "AI service timeout"
            error_code = "OPENAI_TIMEOUT"
        elif "invalid request" in error_str:
            error_message = "Invalid request to AI service"
            error_code = "INVALID_REQUEST"
        
        return ErrorHandler.format_error_response(
            error_message,
            error_code,
            500,
            {
                "original_error": str(error),
                "context": context
            },
            context.get('job_id'),
            context.get('tenant_id')
        )
    
    @staticmethod
    def handle_firestore_error(error: Exception, context: Dict[str, Any]) -> tuple:
        """Handle Firestore errors"""
        logger.error(f"🔥 Firestore error: {error}")
        return ErrorHandler.format_error_response(
            "Database operation failed",
            "FIRESTORE_ERROR",
            500,
            {
                "original_error": str(error),
                "context": context
            },
            context.get('job_id'),
            context.get('tenant_id')
        )
    
    @staticmethod
    def handle_validation_error(
        field_name: str,
        validation_message: str,
        job_id: Optional[str] = None
    ) -> tuple:
        """Handle input validation errors"""
        logger.error(f"📝 Validation error on {field_name}: {validation_message}")
        return ErrorHandler.format_error_response(
            f"Invalid {field_name}: {validation_message}",
            "VALIDATION_ERROR", 
            400,
            {
                "field": field_name,
                "validation_message": validation_message
            },
            job_id
        )
    
    @staticmethod
    def handle_job_not_found(tenant_id: str, job_id: str) -> tuple:
        """Handle job not found errors"""
        logger.error(f"📄 Job not found: {job_id} in tenant {tenant_id}")
        return ErrorHandler.format_error_response(
            "Job not found",
            "JOB_NOT_FOUND",
            404,
            {},
            job_id,
            tenant_id
        )
    
    @staticmethod
    def handle_generic_error(error: Exception, context: Dict[str, Any]) -> tuple:
        """Handle generic unhandled errors"""
        logger.error(f"❌ Unhandled error: {error}")
        return ErrorHandler.format_error_response(
            "Internal server error",
            "INTERNAL_ERROR",
            500,
            {
                "original_error": str(error),
                "context": context
            },
            context.get('job_id'),
            context.get('tenant_id')
        )

def handle_api_error(error: APIError) -> tuple:
    """Handle custom APIError exceptions"""
    logger.error(f"🚨 API Error: {error.error_code} - {error.message}")
    return ErrorHandler.format_error_response(
        error.message,
        error.error_code,
        error.status_code,
        error.details
    )

# Success response helpers
def success_response(
    data: Dict[str, Any],
    message: str = "Operation successful",
    job_id: Optional[str] = None
) -> Dict[str, Any]:
    """Format standardized success response"""
    response = {
        'status': 'SUCCESS',
        'message': message,
        'timestamp': datetime.utcnow().isoformat(),
        **data
    }
    
    if job_id:
        response['job_id'] = job_id
        
    return response

def progress_response(
    job_id: str,
    status: str,
    progress_data: Dict[str, Any],
    message: Optional[str] = None
) -> Dict[str, Any]:
    """Format progress update response"""
    response = {
        'status': 'PROCESSING',
        'job_id': job_id,
        'current_status': status,
        'timestamp': datetime.utcnow().isoformat(),
        'progress': progress_data
    }
    
    if message:
        response['message'] = message
        
    return response