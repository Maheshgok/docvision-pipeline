#!/bin/bash

# Archive Manager Deployment Script
# Deploys the archive management Cloud Run service

set -e

echo "🚀 Deploying Archive Manager to Cloud Run..."

# Configuration
PROJECT_ID="watch-mail-trial"
REGION="asia-south1"
SERVICE_NAME="archive-manager"

# Build and deploy
gcloud run deploy $SERVICE_NAME \
    --source . \
    --platform managed \
    --region $REGION \
    --project $PROJECT_ID \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --concurrency 100 \
    --max-instances 10 \
    --timeout 300 \
    --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID

echo "✅ Archive Manager deployed successfully!"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format='value(status.url)')

echo "🔗 Service URL: $SERVICE_URL"
echo "🔗 Health Check: $SERVICE_URL/health"
echo "🔗 Archive Completed: POST $SERVICE_URL/archive-completed"
echo "🔗 Archive Displayed: POST $SERVICE_URL/archive-displayed"

echo ""
echo "📝 Next Steps:"
echo "1. Test health endpoint: curl $SERVICE_URL/health"
echo "2. Update frontend to call archive endpoints"
echo "3. Simplify real-time listeners to show all active results"