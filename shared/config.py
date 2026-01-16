import os
import yaml
from typing import Dict, Any

class ProjectConfig:
    _instance = None
    _config = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ProjectConfig, cls).__new__(cls)
            cls._instance._load_config()
        return cls._instance

    def _load_config(self):
        """Load the configuration from the YAML file."""
        try:
            config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.yaml')
            with open(config_path, 'r') as f:
                self._config = yaml.safe_load(f)
            
            # Override with environment-specific values if ENV is set
            env = os.getenv('ENV', self._config.get('default_environment', 'dev'))
            self.current_env = env
        except (FileNotFoundError, yaml.YAMLError) as e:
            # Fallback configuration if config.yaml is not found or invalid
            self._config = {
                'project': {
                    'id': os.getenv('GOOGLE_CLOUD_PROJECT', 'watch-mail-trial'),
                    'region': os.getenv('REGION', 'asia-south1')
                },
                'services': {
                    'invoice-processor': {
                        'name': 'invoice-processor',
                        'service_account': 'processor@watch-mail-trial.iam.gserviceaccount.com'
                    },
                    'invoice-upload-api': {
                        'name': 'invoice-upload-api',
                        'service_account': 'cloudrun-invoice-uploader@watch-mail-trial.iam.gserviceaccount.com'
                    }
                },
                'storage': {
                    'raw_bucket': os.getenv('BUCKET_NAME', 'watch-mail-trial-invoice-processing'),
                    'processed_bucket': 'ocr-invoice-processed-files-bucket'
                },
                'pubsub': {
                    'topics': {
                        'upload_initiated': os.getenv('PUBSUB_TOPIC_INITIATE', 'step-1-initiate'),
                        'processing_complete': os.getenv('PUBSUB_TOPIC_STEP_1', 'step-1-process-output-dev')
                    }
                },
                'environments': {
                    'dev': {
                        'log_level': os.getenv('LOG_LEVEL', 'INFO')
                    }
                }
            }

    @property
    def project_id(self) -> str:
        """Get the Google Cloud project ID."""
        return self._config['project']['id']

    @property
    def project_region(self) -> str:
        """Get the Google Cloud region."""
        return self._config['project']['region']

    @property
    def environment(self) -> Dict[str, Any]:
        """Get environment-specific configuration."""
        return self._config['environments'][self.current_env]

    def get_service_config(self, service_name: str) -> Dict[str, Any]:
        """Get configuration for a specific service."""
        return self._config['services'][service_name]

    def get_storage_config(self) -> Dict[str, Any]:
        """Get storage configuration."""
        return self._config['storage']

    def get_pubsub_topic(self, topic_name: str) -> str:
        """Get a Pub/Sub topic by name."""
        return self._config['pubsub']['topics'][topic_name]

    def get_env_value(self, key: str, default: str = None) -> str:
        """Get a value from environment variables or config."""
        return os.getenv(key) or self._get_config_value(key) or default

    def _get_config_value(self, key: str) -> str:
        """Helper to get nested config values."""
        try:
            if key.startswith('PUBSUB_TOPIC_'):
                topic_key = key.replace('PUBSUB_TOPIC_', '').lower()
                return self._config['pubsub']['topics'].get(topic_key)
            elif key == 'BUCKET_NAME':
                return self._config['storage'].get('raw_bucket')
            elif key == 'GOOGLE_CLOUD_PROJECT':
                return self._config['project'].get('id')
            elif key == 'REGION':
                return self._config['project'].get('region')
            return None
        except (KeyError, TypeError):
            return None

# Create a singleton instance
config = ProjectConfig()

def get_config(key: str, default: str = None) -> str:
    """Simple helper function to get configuration values."""
    return config.get_env_value(key, default)