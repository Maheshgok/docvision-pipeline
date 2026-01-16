#!/bin/bash

# Cloud Tasks Initial API Deployment Script
# Deploys the updated initial-api with Cloud Tasks integration

set -e

echo "🚀 Deploying Initial API with Cloud Tasks integration..."

# Configuration
PROJECT_ID="watch-mail-trial"
SERVICE_NAME="initial-api"
REGION="asia-south1"
IMAGE_NAME="initial-api-cloud-tasks"

# Check if we're in the right directory
if [ ! -f "main.py" ]; then
    echo "❌ Error: main.py not found. Make sure you're in the initial-api/Cloudrun_version directory"
    exit 1
fi

if [ ! -f "cloud_tasks_manager.py" ]; then
    echo "❌ Error: cloud_tasks_manager.py not found. Make sure the Cloud Tasks manager is in place"
    exit 1
fi

echo "📋 Project ID: $PROJECT_ID"
echo "🌍 Region: $REGION"
echo "🔧 Service: $SERVICE_NAME"

# Build and deploy to Cloud Run
echo "🔨 Building and deploying to Cloud Run..."

gcloud run deploy $SERVICE_NAME \
    --source . \
    --project $PROJECT_ID \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "PROJECT_ID=$PROJECT_ID,BUCKET_NAME=watch-mail-trial-invoice-raw-files,CLOUD_TASKS_LOCATION=asia-south1,CLOUD_TASKS_QUEUE=invoice-processing-queue,QUEUE_PROCESSOR_URL=https://queue-processor-812016027146.asia-south1.run.app" \
    --memory 1Gi \
    --cpu 1 \
    --timeout 300 \
    --concurrency 80 \
    --min-instances 0 \
    --max-instances 10

# Get the deployed URL
DEPLOYED_URL=$(gcloud run services describe $SERVICE_NAME --project $PROJECT_ID --region $REGION --format "value(status.url)")

echo "✅ Deployment completed!"
echo "🌐 Service URL: $DEPLOYED_URL"
echo "📋 Service: $SERVICE_NAME"
echo "🔍 View logs: gcloud logs tail services/$SERVICE_NAME --project $PROJECT_ID"

# Create/update the Cloud Tasks queue
echo "🔄 Setting up Cloud Tasks queue..."

# Check if queue exists, create if not
QUEUE_EXISTS=$(gcloud tasks queues describe invoice-processing-queue --location=$REGION --project=$PROJECT_ID --format="value(name)" 2>/dev/null || echo "")

if [ -z "$QUEUE_EXISTS" ]; then
    echo "📋 Creating Cloud Tasks queue..."
    gcloud tasks queues create invoice-processing-queue \
        --location=$REGION \
        --project=$PROJECT_ID \
        --max-dispatches-per-second=10 \
        --max-concurrent-dispatches=5 \
        --max-attempts=3 \
        --max-retry-duration=1800s \
        --min-backoff=60s \
        --max-backoff=3600s
    
    echo "✅ Cloud Tasks queue created: invoice-processing-queue"
else
    echo "✅ Cloud Tasks queue already exists: invoice-processing-queue"
fi

# Set IAM permissions for Cloud Tasks
echo "🔐 Setting up IAM permissions..."

# Allow Cloud Tasks to invoke the queue processor
gcloud run services add-iam-policy-binding queue-processor \
    --member="serviceAccount:cloudrun-invoice-uploader@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/run.invoker" \
    --region=$REGION \
    --project=$PROJECT_ID

# Ensure the service account has Cloud Tasks admin rights
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:cloudrun-invoice-uploader@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudtasks.admin"

echo "🎉 Cloud Tasks Initial API deployment completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Deploy the updated queue processor with: cd ../../queue-processor && ./deploy-cloud-tasks.sh"
echo "2. Test the Cloud Tasks integration with: curl -X POST $DEPLOYED_URL/upload_invoice"
echo "3. Monitor Cloud Tasks queue: gcloud tasks queues describe invoice-processing-queue --location=$REGION"
echo ""
echo "🔍 Debugging commands:"
echo "  - View Cloud Tasks queue: gcloud tasks queues describe invoice-processing-queue --location=$REGION"
echo "  - List tasks: gcloud tasks list --queue=invoice-processing-queue --location=$REGION"
echo "  - View logs: gcloud logs tail services/$SERVICE_NAME"