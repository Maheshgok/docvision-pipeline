"""Configuration module for the invoice processing system."""
import os
import logging
from typing import Dict

class Config:
    """Configuration class for the invoice processing system."""
    def __init__(self):
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.environment = {
            'log_level': logging.INFO,
            'debug': os.getenv('DEBUG', 'False').lower() == 'true'
        }
        self._storage_config = None

    def get_storage_config(self) -> Dict[str, str]:
        """Get storage configuration."""
        if self._storage_config is None:
            self._storage_config = {
                'raw_bucket': os.getenv('RAW_BUCKET', 'invoices-raw-ocr'),
                'processed_bucket': os.getenv('PROCESSED_BUCKET', 'invoices-processed')
            }
        return self._storage_config

# Create a singleton config instance
config = Config()