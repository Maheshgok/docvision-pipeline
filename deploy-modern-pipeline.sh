#!/bin/bash
# Deploy all modern pipeline services to Google Cloud Run

set -e  # Exit on any error

PROJECT_ID="watch-mail-trial"
REGION="asia-south1"

echo "🚀 Starting deployment of all modern pipeline services..."

# Function to build and deploy a service
deploy_service() {
    local SERVICE_NAME=$1
    local SERVICE_DIR=$2
    
    echo ""
    echo "📦 Building and deploying $SERVICE_NAME..."
    
    # Check if service directory exists
    if [ ! -d "$SERVICE_DIR" ]; then
        echo "❌ Service directory $SERVICE_DIR not found"
        return 1
    fi
    
    # Navigate to service directory
    cd "$SERVICE_DIR"
    
    # Build container image
    echo "🔨 Building container image..."
    gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME
    
    # Deploy to Cloud Run
    echo "🚀 Deploying to Cloud Run..."
    gcloud run deploy $SERVICE_NAME \
        --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
        --platform managed \
        --region $REGION \
        --allow-unauthenticated \
        --memory 1Gi \
        --cpu 1 \
        --timeout 600 \
        --concurrency 10 \
        --min-instances 0 \
        --max-instances 10 \
        --set-env-vars PROJECT_ID=$PROJECT_ID,ENVIRONMENT=production
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")
    echo "✅ $SERVICE_NAME deployed successfully!"
    echo "🔗 URL: $SERVICE_URL"
    
    # Return to project root
    cd ..
}

# Deploy all services
deploy_service "orchestrator-service" "orchestrator-service"
deploy_service "data-extractor-v2" "data-extractor-v2"
deploy_service "chunk-dispatcher" "chunk-dispatcher"
deploy_service "enrichment-worker" "enrichment-worker"
deploy_service "field-standardizer-v2" "field-standardizer-v2"

echo ""
echo "🎉 All services deployed successfully!"
echo ""
echo "📋 Service URLs:"
gcloud run services list --region=$REGION --filter="metadata.name:(orchestrator-service OR data-extractor-v2 OR chunk-dispatcher OR enrichment-worker OR field-standardizer-v2)" --format="table(metadata.name,status.url)"

echo ""
echo "🔧 Next steps:"
echo "1. Update frontend environment variables with the new service URLs"
echo "2. Test the complete pipeline end-to-end"
echo "3. Monitor service logs for any issues"