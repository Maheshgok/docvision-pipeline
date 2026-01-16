"""
Functional OpenAI Handler - Memory & CPU Optimized
Pure functional approach for efficient OpenAI API interactions
No classes, no state persistence, minimal memory footprint
Uses Google Cloud Secret Manager for secure API key management
"""

import base64
import json
import logging
import os
from dataclasses import dataclass
from typing import Dict, Any, Optional, Union
from openai import OpenAI
from google.cloud import secretmanager

# Configure logging
logger = logging.getLogger(__name__)

def get_secret(secret_name: str, project_id: str = None) -> str:
    """
    Retrieve secret from Google Cloud Secret Manager
    
    Args:
        secret_name: Name of the secret (e.g., 'extraction-openai-key')
        project_id: Google Cloud Project ID (defaults to environment variable)
    
    Returns:
        Secret value as string
    """
    if not project_id:
        project_id = os.environ.get('GOOGLE_CLOUD_PROJECT', 'watch-mail-trial')
    
    try:
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        secret_value = response.payload.data.decode("UTF-8")
        logger.info(f"✅ Retrieved secret: {secret_name}")
        return secret_value
    except Exception as e:
        logger.error(f"❌ Failed to retrieve secret {secret_name}: {e}")
        # Fallback to environment variable
        env_key = os.environ.get('OPENAI_API_KEY')
        if env_key:
            logger.warning(f"⚠️ Using fallback environment variable for {secret_name}")
            return env_key
        raise Exception(f"Could not retrieve secret {secret_name} and no fallback available")

@dataclass
class OpenAIConfig:
    """Lightweight configuration for OpenAI API calls"""
    model: str = "gpt-4o"
    temperature: float = 0.1
    max_tokens: int = 4000
    timeout: float = 300.0
    secret_name: str = "openai-api-key"  # Default secret name
    
    def get_api_key(self) -> str:
        """Get API key from Secret Manager"""
        return get_secret(self.secret_name)

def _detect_image_format(image_content: str) -> str:
    """Detect image format from base64 content"""
    try:
        # Decode first few bytes to check signature
        image_bytes = base64.b64decode(image_content[:100])
        
        if image_bytes.startswith(b'\xff\xd8\xff'):
            return "jpeg"
        elif image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
            return "png"
        elif image_bytes.startswith(b'GIF8'):
            return "gif"
        elif image_bytes.startswith(b'\x42\x4d'):
            return "bmp"
        else:
            logger.warning("Unknown image format, defaulting to png")
            return "png"
            
    except Exception as e:
        logger.warning(f"Error detecting image format: {e}, defaulting to png")
        return "png"

def call_openai_api(
    prompt: str,
    config: OpenAIConfig,
    context: str = "default",
    image_content: Optional[str] = None
) -> Dict[str, Any]:
    """
    Pure function to call OpenAI API
    
    Args:
        prompt: The text prompt to send
        config: OpenAI configuration
        context: Context string for logging
        image_content: Optional base64 image content
        
    Returns:
        Dict with success, content, tokens_used, and error fields
    """
    try:
        logger.info(f"🤖 Calling OpenAI API - Context: {context}")
        
        # Create client (no state persistence)
        client = OpenAI(
            api_key=config.get_api_key(),
            timeout=config.timeout,
            max_retries=3
        )
        
        # Prepare messages
        messages = []
        
        if image_content:
            # Vision API call with image
            image_format = _detect_image_format(image_content)
            logger.info(f"🖼️ Processing image: {image_format} format")
            
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/{image_format};base64,{image_content}",
                            "detail": "high"
                        }
                    }
                ]
            })
        else:
            # Text-only API call
            messages.append({"role": "user", "content": prompt})
        
        # Make API call
        response = client.chat.completions.create(
            model=config.model,
            messages=messages,
            max_tokens=config.max_tokens,
            temperature=config.temperature
        )
        
        # Extract response
        content = response.choices[0].message.content.strip()
        tokens_used = response.usage.total_tokens
        
        logger.info(f"✅ API call successful - Tokens: {tokens_used}")
        
        return {
            'success': True,
            'content': content,
            'tokens_used': tokens_used,
            'error': None
        }
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ API call failed - Context: {context}, Error: {error_msg}")
        
        return {
            'success': False,
            'content': None,
            'tokens_used': 0,
            'error': error_msg
        }

# Factory functions that return pre-configured function calls
def create_extraction_function(service_name: str = "extractor", secret_name: str = "extraction-openai-key"):
    """Create a function optimized for data extraction"""
    config = OpenAIConfig(
        model="gpt-4o",
        temperature=0.1,
        max_tokens=4000,
        timeout=300.0,
        secret_name=secret_name
    )
    
    def extract_data(prompt: str, image_content: str = None, context: str = None) -> Dict[str, Any]:
        actual_context = context or f"extraction_{service_name}"
        return call_openai_api(prompt, config, actual_context, image_content)
    
    logger.info(f"🔧 Created extraction function for {service_name}")
    return extract_data

def create_enrichment_function(service_name: str = "enricher", secret_name: str = "enrichment-openai-key"):
    """Create a function optimized for data enrichment"""
    config = OpenAIConfig(
        model="gpt-4o",
        temperature=0.2,
        max_tokens=3000,
        timeout=240.0,
        secret_name=secret_name
    )
    
    def enrich_data(prompt: str, context: str = None) -> Dict[str, Any]:
        actual_context = context or f"enrichment_{service_name}"
        return call_openai_api(prompt, config, actual_context)
    
    logger.info(f"🔧 Created enrichment function for {service_name}")
    return enrich_data

def create_analysis_function(service_name: str = "analyzer", secret_name: str = "analysis-openai-key"):
    """Create a function optimized for data analysis"""
    config = OpenAIConfig(
        model="gpt-4o",
        temperature=0.1,
        max_tokens=2000,
        timeout=180.0,
        secret_name=secret_name
    )
    
    def analyze_data(prompt: str, context: str = None) -> Dict[str, Any]:
        actual_context = context or f"analysis_{service_name}"
        return call_openai_api(prompt, config, actual_context)
    
    logger.info(f"🔧 Created analysis function for {service_name}")
    return analyze_data

# Direct API function for custom configurations
def call_openai_with_config(
    prompt: str,
    model: str = "gpt-4o",
    temperature: float = 0.1,
    max_tokens: int = 3000,
    timeout: float = 300.0,
    image_content: Optional[str] = None,
    context: str = "custom"
) -> Dict[str, Any]:
    """
    Direct API call with custom parameters - most flexible option
    All parameters are explicit, no hidden state
    """
    config = OpenAIConfig(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout
    )
    
    return call_openai_api(prompt, config, context, image_content)

# Utility function for batch processing
def batch_process_prompts(
    prompts: list,
    config: OpenAIConfig,
    context_prefix: str = "batch"
) -> list:
    """
    Process multiple prompts efficiently
    Returns list of results in same order as input
    """
    results = []
    
    for i, prompt in enumerate(prompts):
        context = f"{context_prefix}_{i+1}"
        result = call_openai_api(prompt, config, context)
        results.append(result)
    
    return results

# Memory usage helper (lightweight version)
def get_memory_stats() -> Dict[str, Any]:
    """Get current memory usage stats for monitoring (simplified version)"""
    try:
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        
        return {
            'rss_mb': memory_info.rss / 1024 / 1024,
            'vms_mb': memory_info.vms / 1024 / 1024,
            'cpu_percent': process.cpu_percent(),
            'memory_percent': process.memory_percent()
        }
    except ImportError:
        # Fallback without psutil
        import sys
        return {
            'rss_mb': sys.getsizeof(globals()) / 1024 / 1024,
            'vms_mb': 0,
            'cpu_percent': 0,
            'memory_percent': 0
        }

if __name__ == "__main__":
    # Example usage - demonstrate functional approach
    print("🧪 Testing Functional OpenAI Handler")
    
    # Memory stats before
    print(f"📊 Memory before: {get_memory_stats()}")
    
    # Create extraction function
    extract_func = create_extraction_function("test")
    
    # Test simple prompt
    test_prompt = "Analyze this text and return a JSON summary: Hello world"
    result = extract_func(test_prompt, context="test_call")
    
    print(f"✅ Result: {result['success']}")
    print(f"🎯 Content: {result['content'][:100]}...")
    print(f"🔢 Tokens: {result['tokens_used']}")
    
    # Memory stats after
    print(f"📊 Memory after: {get_memory_stats()}")
    
    print("🎉 Functional handler test complete!")