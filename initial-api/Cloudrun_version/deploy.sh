#!/bin/bash
set -e

# Configuration
PROJECT_ID="watch-mail-trial"
REGION="asia-south1"
SERVICE_NAME="initial-api"
SERVICE_ACCOUNT="cloudrun-invoice-uploader@watch-mail-trial.iam.gserviceaccount.com"

echo "=== Deploying Initial API Service ==="

# Setup Google Cloud SDK repository and key
echo "Setting up Google Cloud SDK repository..."

# Create the directory for keyrings if it doesn't exist
sudo mkdir -p /etc/apt/keyrings

# Download and install the Google Cloud public key
echo "Installing Google Cloud public key..."
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /etc/apt/keyrings/google-cloud.gpg

# Add the Google Cloud SDK distribution URI as a package source
echo "Adding Google Cloud SDK repository..."
echo "deb [signed-by=/etc/apt/keyrings/google-cloud.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list

# Ensure required packages are installed
echo "Checking Python environment..."

# Update package list
sudo apt-get update

# Install Python and pip
echo "Installing Python3 and pip..."
sudo apt-get install -y python3 python3-pip

# Verify Python installation
python3 --version
python3 -m pip --version

# Install dependencies using python3 -m pip
echo "Installing Python dependencies..."
python3 -m pip install --user -r requirements.txt

# Ensure we're in the right project
echo "Setting project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com

# Create a .gcloudignore file if it doesn't exist
if [ ! -f .gcloudignore ]; then
    echo "Creating .gcloudignore file..."
    cat > .gcloudignore << EOL
.gcloudignore
.git
.gitignore
__pycache__/
*.pyc
.pytest_cache/
*.pyo
*.pyd
.Python
env/
pip-log.txt
pip-delete-this-directory.txt
.tox/
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
*.log
.pytest_cache/
EOL
fi

# Deploy Cloud Run service
echo "Deploying Cloud Run service..."
gcloud run deploy $SERVICE_NAME \
    --source . \
    --region=$REGION \
    --platform=managed \
    --service-account=$SERVICE_ACCOUNT \
    --memory=1Gi \
    --timeout=600s \
    --allow-unauthenticated \
    --set-env-vars="CORS_ORIGINS=https://invoiceparse.netlify.app,BUCKET_NAME=watch-mail-trial-invoice-raw-files,PROJECT_ID=watch-mail-trial"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')

echo "=== Deployment Complete ==="
echo "Service URL: $SERVICE_URL"

# Print verification command
echo -e "\nTo verify deployment, run:"
echo "curl $SERVICE_URL/health-check"