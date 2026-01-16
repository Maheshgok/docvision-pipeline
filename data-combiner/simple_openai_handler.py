"""
Simple OpenAI API Handler
Generic wrapper for OpenAI API calls with configurable parameters
Input → OpenAI API → Response content
"""

import os
import base64
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from openai import OpenAI

logger = logging.getLogger(__name__)

@dataclass
class OpenAIConfig:
    """Configuration for OpenAI API calls"""
    model: str = "gpt-4o"
    temperature: float = 0.1
    max_tokens: Optional[int] = None
    timeout: float = 120.0
    max_retries: int = 3

class SimpleOpenAIHandler:
    """
    Simple OpenAI API handler
    Configure once, use with any prompt/image combination
    """
    
    def __init__(self, config: OpenAIConfig, api_key: Optional[str] = None, service_name: str = "unknown"):
        """
        Initialize handler with configuration
        
        Args:
            config: OpenAIConfig with model, temperature, etc.
            api_key: OpenAI API key (defaults to environment or hardcoded)
            service_name: Service name for logging
        """
        self.config = config
        self.service_name = service_name
        self.api_key = api_key or self._get_api_key()
        self.client = self._initialize_client()
        
        logger.info(f"🤖 OpenAI Handler initialized: {service_name}, model: {config.model}")
    
    def _get_api_key(self) -> str:
        """Get OpenAI API key"""
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            # Fallback to DataAnalyst1 key
            api_key = "YOUR_OPENAI_API_KEY_HERE"
        return api_key
    
    def _initialize_client(self) -> OpenAI:
        """Initialize OpenAI client"""
        return OpenAI(
            api_key=self.api_key,
            timeout=self.config.timeout,
            max_retries=self.config.max_retries
        )
    
    def call_api(self, prompt: str, image_base64: Optional[str] = None, context: str = "api_call") -> Dict[str, Any]:
        """
        Simple API call: input → OpenAI → response
        
        Args:
            prompt: Text prompt to send
            image_base64: Optional base64 image data
            context: Context for logging
            
        Returns:
            {
                "success": bool,
                "content": str,          # Raw response content
                "tokens_used": int,
                "error": str            # If failed
            }
        """
        try:
            logger.info(f"🚀 {context} - Calling OpenAI API")
            
            # Build messages
            if image_base64:
                # Detect image format from base64 data
                image_format = self._detect_image_format(image_base64)
                
                # Multimodal request with proper MIME type
                messages = [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/{image_format};base64,{image_base64}"
                            }
                        }
                    ]
                }]
            else:
                # Text-only request
                messages = [{"role": "user", "content": prompt}]
            
            # API call parameters
            api_params = {
                "model": self.config.model,
                "messages": messages,
                "temperature": self.config.temperature
            }
            
            # Add max_tokens if specified
            if self.config.max_tokens:
                api_params["max_tokens"] = self.config.max_tokens
            
            # Call OpenAI API
            response = self.client.chat.completions.create(**api_params)
            
            # Extract response
            content = response.choices[0].message.content.strip()
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            logger.info(f"✅ {context} - Success, tokens: {tokens_used}")
            
            return {
                "success": True,
                "content": content,
                "tokens_used": tokens_used,
                "error": None
            }
            
        except Exception as e:
            logger.error(f"❌ {context} - API call failed: {str(e)}")
            return {
                "success": False,
                "content": "",
                "tokens_used": 0,
                "error": str(e)
            }
    
    def _detect_image_format(self, base64_content: str) -> str:
        """Detect image format from base64 content"""
        try:
            # Remove data URL prefix if present
            if base64_content.startswith('data:'):
                base64_content = base64_content.split(',', 1)[1]
            
            # Decode first few bytes to check magic numbers
            decoded = base64.b64decode(base64_content[:50] + "==")
            
            # Check magic numbers
            if decoded.startswith(b'\x89PNG'):
                return 'png'
            elif decoded.startswith(b'\xFF\xD8\xFF'):
                return 'jpeg'
            elif decoded.startswith(b'GIF87a') or decoded.startswith(b'GIF89a'):
                return 'gif'
            elif decoded.startswith(b'RIFF') and b'WEBP' in decoded[:20]:
                return 'webp'
            else:
                logger.warning(f"⚠️ Unknown image format, defaulting to JPEG")
                return 'jpeg'  # Safe default
                
        except Exception as e:
            logger.warning(f"⚠️ Failed to detect image format: {str(e)}, defaulting to JPEG")
            return 'jpeg'

# Factory functions for common configurations
def create_extraction_handler(service_name: str) -> SimpleOpenAIHandler:
    """Create handler optimized for data extraction"""
    config = OpenAIConfig(
        model="gpt-4o",
        temperature=0.1,
        max_tokens=2000,
        timeout=120.0,
        max_retries=3
    )
    return SimpleOpenAIHandler(config, service_name=service_name)

def create_enrichment_handler(service_name: str) -> SimpleOpenAIHandler:
    """Create handler optimized for data enrichment"""
    config = OpenAIConfig(
        model="gpt-4o",
        temperature=0.2,
        max_tokens=1500,
        timeout=120.0,
        max_retries=3
    )
    return SimpleOpenAIHandler(config, service_name=service_name)

def create_analysis_handler(service_name: str) -> SimpleOpenAIHandler:
    """Create handler optimized for analysis"""
    config = OpenAIConfig(
        model="gpt-4o",
        temperature=0.3,
        max_tokens=1000,
        timeout=120.0,
        max_retries=3
    )
    return SimpleOpenAIHandler(config, service_name=service_name)
