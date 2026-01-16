"""
Shared OpenAI Utilities
Centralized OpenAI API calls with latest client format, error handling, and token tracking
"""

import os
import json
import time
import logging
from typing import Dict, Any, Optional, List
from google.cloud import secretmanager
from openai import OpenAI

logger = logging.getLogger(__name__)

class OpenAIUtils:
    """Centralized OpenAI API utilities with latest client format"""
    
    def __init__(self):
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.secret_client = secretmanager.SecretManagerServiceClient()
        self._openai_client = None
        self.default_model = "gpt-4o"
        self.max_retries = 3
        self.retry_delay = 2.0
        
    def _get_openai_client(self) -> OpenAI:
        """Lazy initialization of OpenAI client with API key from Secret Manager"""
        if self._openai_client is None:
            try:
                # Get API key from Secret Manager
                api_key = self._get_secret('openai-api-key')
                self._openai_client = OpenAI(api_key=api_key)
                logger.info("🤖 OpenAI client initialized")
            except Exception as e:
                logger.error(f"❌ Failed to initialize OpenAI client: {e}")
                raise
        
        return self._openai_client
    
    def _get_secret(self, secret_name: str) -> str:
        """Retrieve secret from Google Secret Manager"""
        try:
            secret_path = f"projects/{self.project_id}/secrets/{secret_name}/versions/latest"
            response = self.secret_client.access_secret_version(request={"name": secret_path})
            secret_value = response.payload.data.decode("UTF-8")
            logger.info(f"🔐 Retrieved secret: {secret_name}")
            return secret_value
        except Exception as e:
            logger.error(f"❌ Failed to retrieve secret {secret_name}: {e}")
            raise
    
    def call_openai_text(
        self,
        prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
        context_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Make text-only OpenAI API call with latest client format
        
        Args:
            prompt: The prompt to send
            model: Model to use (defaults to gpt-4o)  
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response
            context_info: Additional context for logging (tenant_id, job_id, etc.)
            
        Returns:
            {
                'success': bool,
                'content': str,
                'tokens_used': int,
                'model': str,
                'error': str (if failed)
            }
        """
        model = model or self.default_model
        context_str = self._format_context(context_info)
        
        for attempt in range(self.max_retries):
            try:
                start_time = time.time()
                client = self._get_openai_client()
                
                # Use latest OpenAI client format
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "user", "content": prompt}
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                
                duration = time.time() - start_time
                tokens_used = response.usage.total_tokens
                content = response.choices[0].message.content
                
                logger.info(f"✅ OpenAI call successful {context_str} - {tokens_used} tokens in {duration:.2f}s")
                
                return {
                    'success': True,
                    'content': content,
                    'tokens_used': tokens_used,
                    'model': model,
                    'duration': duration,
                    'attempt': attempt + 1
                }
                
            except Exception as e:
                logger.error(f"❌ OpenAI call failed {context_str} (attempt {attempt + 1}): {e}")
                
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (attempt + 1))
                    continue
                else:
                    return {
                        'success': False,
                        'error': str(e),
                        'model': model,
                        'attempts': self.max_retries
                    }
    
    def call_openai_with_image(
        self,
        prompt: str,
        image_base64: str,
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
        context_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Make OpenAI API call with image using latest vision model format
        
        Args:
            prompt: The prompt to send
            image_base64: Base64 encoded image data
            model: Model to use (defaults to gpt-4o)
            temperature: Sampling temperature  
            max_tokens: Maximum tokens in response
            context_info: Additional context for logging
            
        Returns: Same format as call_openai_text
        """
        model = model or self.default_model
        context_str = self._format_context(context_info)
        
        for attempt in range(self.max_retries):
            try:
                start_time = time.time()
                client = self._get_openai_client()
                
                # Use latest OpenAI vision format
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{image_base64}"
                                    }
                                }
                            ]
                        }
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                
                duration = time.time() - start_time
                tokens_used = response.usage.total_tokens
                content = response.choices[0].message.content
                
                logger.info(f"✅ OpenAI vision call successful {context_str} - {tokens_used} tokens in {duration:.2f}s")
                
                return {
                    'success': True,
                    'content': content,
                    'tokens_used': tokens_used,
                    'model': model,
                    'duration': duration,
                    'attempt': attempt + 1
                }
                
            except Exception as e:
                logger.error(f"❌ OpenAI vision call failed {context_str} (attempt {attempt + 1}): {e}")
                
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (attempt + 1))
                    continue
                else:
                    return {
                        'success': False,
                        'error': str(e),
                        'model': model,
                        'attempts': self.max_retries
                    }
    
    def parse_json_response(self, content: str) -> Dict[str, Any]:
        """
        Parse JSON from OpenAI response, handling markdown formatting
        
        Args:
            content: Raw content from OpenAI
            
        Returns:
            Parsed JSON dict
            
        Raises:
            ValueError: If JSON parsing fails
        """
        try:
            # Clean markdown formatting
            cleaned_content = content.strip()
            
            if cleaned_content.startswith('```json'):
                cleaned_content = cleaned_content[7:-3].strip()
            elif cleaned_content.startswith('```'):
                cleaned_content = cleaned_content[3:-3].strip()
            
            return json.loads(cleaned_content)
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON parse error: {e}")
            logger.error(f"📄 Raw content: {content[:500]}...")
            raise ValueError(f"Invalid JSON response: {e}")
    
    def load_prompt_template(self, template_name: str, **kwargs) -> str:
        """
        Load prompt template from file and substitute variables
        
        Args:
            template_name: Name of template file (without .txt extension)
            **kwargs: Variables to substitute in template
            
        Returns:
            Formatted prompt string
        """
        try:
            template_path = f"prompts/{template_name}.txt"
            
            # Try to read from current directory or parent directory
            import os
            if not os.path.exists(template_path):
                template_path = f"../prompts/{template_name}.txt"
            
            with open(template_path, 'r', encoding='utf-8') as f:
                template = f.read()
            
            # Simple variable substitution
            formatted_prompt = template.format(**kwargs)
            logger.info(f"📄 Loaded prompt template: {template_name}")
            return formatted_prompt
            
        except Exception as e:
            logger.error(f"❌ Failed to load prompt template {template_name}: {e}")
            raise
    
    def _format_context(self, context_info: Optional[Dict[str, Any]]) -> str:
        """Format context information for logging"""
        if not context_info:
            return ""
        
        parts = []
        for key in ['tenant_id', 'job_id', 'chunk_id', 'user_id']:
            if key in context_info:
                parts.append(f"{key}={context_info[key]}")
        
        return f"({', '.join(parts)})" if parts else ""

# Global instance for use across services
openai_utils = OpenAIUtils()

def call_openai_text(prompt: str, **kwargs) -> Dict[str, Any]:
    """Convenience function using global instance"""
    return openai_utils.call_openai_text(prompt, **kwargs)

def call_openai_with_image(prompt: str, image_base64: str, **kwargs) -> Dict[str, Any]:
    """Convenience function using global instance"""
    return openai_utils.call_openai_with_image(prompt, image_base64, **kwargs)

def parse_json_response(content: str) -> Dict[str, Any]:
    """Convenience function using global instance"""
    return openai_utils.parse_json_response(content)

def load_prompt_template(template_name: str, **kwargs) -> str:
    """Convenience function using global instance"""
    return openai_utils.load_prompt_template(template_name, **kwargs)