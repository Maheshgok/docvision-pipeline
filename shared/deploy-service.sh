#!/bin/bash

# Helper script for deploying services using the central configuration

function load_yaml() {
    python3 -c "
import yaml
import sys
with open('$1', 'r') as f:
    config = yaml.safe_load(f)
$2
"
}

# Get configuration values
PROJECT_ID=$(load_yaml "../config.yaml" "print(config['project']['id'])")
REGION=$(load_yaml "../config.yaml" "print(config['project']['region'])")

# Function to deploy a service
deploy_service() {
    local SERVICE_NAME=$1
    local ENV=${2:-dev}

    echo "=== Deploying $SERVICE_NAME in $ENV environment ==="

    # Load service configuration
    SERVICE_ACCOUNT=$(load_yaml "../config.yaml" "print(config['services']['${SERVICE_NAME}']['service_account'])")
    MIN_INSTANCES=$(load_yaml "../config.yaml" "print(config['environments']['${ENV}']['min_instances'])")
    MAX_INSTANCES=$(load_yaml "../config.yaml" "print(config['environments']['${ENV}']['max_instances'])")
    MEMORY=$(load_yaml "../config.yaml" "print(config['environments']['${ENV}']['memory'])")
    TIMEOUT=$(load_yaml "../config.yaml" "print(config['environments']['${ENV}']['timeout'])")

    # Deploy the service
    gcloud run deploy "$SERVICE_NAME" \
        --source . \
        --region="$REGION" \
        --platform=managed \
        --service-account="$SERVICE_ACCOUNT" \
        --env-vars-file .env.yaml \
        --memory="$MEMORY" \
        --timeout="$TIMEOUT" \
        --min-instances="$MIN_INSTANCES" \
        --max-instances="$MAX_INSTANCES" \
        --no-allow-unauthenticated

    echo "=== Deployment Complete ==="
}

# Usage
if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <service-name> [environment]"
    echo "Example: $0 invoice-processor dev"
    exit 1
fi

deploy_service "$1" "${2:-dev}"