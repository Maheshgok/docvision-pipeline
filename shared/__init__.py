"""
Shared Utilities Package
Common utilities for multi-tenant invoice processing platform
"""

from .auth_utils import (
    auth_utils,
    require_auth_and_tenant,
    extract_tenant_context,
    AuthUtils
)

from .openai_utils import (
    openai_utils,
    call_openai_text,
    call_openai_with_image,
    parse_json_response,
    load_prompt_template,
    OpenAIUtils
)

from .firestore_utils import (
    firestore_utils,
    create_job_document,
    update_job_status,
    FirestoreUtils
)

from .pubsub_utils import (
    pubsub_utils,
    publish_chunk_for_enrichment,
    start_enrichment_worker,
    PubSubUtils
)

from .error_handling import (
    APIError,
    ErrorHandler,
    handle_api_error,
    success_response,
    progress_response
)

__all__ = [
    # Auth utilities
    'auth_utils',
    'require_auth_and_tenant',
    'extract_tenant_context',
    'AuthUtils',
    
    # OpenAI utilities
    'openai_utils',
    'call_openai_text',
    'call_openai_with_image', 
    'parse_json_response',
    'load_prompt_template',
    'OpenAIUtils',
    
    # Firestore utilities
    'firestore_utils',
    'create_job_document',
    'update_job_status',
    'FirestoreUtils',
    
    # Pub/Sub utilities
    'pubsub_utils',
    'publish_chunk_for_enrichment',
    'start_enrichment_worker',
    'PubSubUtils',
    
    # Error handling
    'APIError',
    'ErrorHandler',
    'handle_api_error',
    'success_response',
    'progress_response'
]