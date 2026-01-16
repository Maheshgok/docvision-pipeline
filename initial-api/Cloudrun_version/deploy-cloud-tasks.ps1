# Cloud Tasks Initial API Deployment Script (PowerShell)
# Deploys the updated initial-api with Cloud Tasks integration

$ErrorActionPreference = "Stop"

Write-Host "🚀 Deploying Initial API with Cloud Tasks integration..." -ForegroundColor Green

# Configuration
$PROJECT_ID = "watch-mail-trial"
$SERVICE_NAME = "initial-api"
$REGION = "asia-south1"
$IMAGE_NAME = "initial-api-cloud-tasks"

# Check if we're in the right directory
if (-not (Test-Path "main.py")) {
    Write-Host "❌ Error: main.py not found. Make sure you're in the initial-api/Cloudrun_version directory" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "cloud_tasks_manager.py")) {
    Write-Host "❌ Error: cloud_tasks_manager.py not found. Make sure the Cloud Tasks manager is in place" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Project ID: $PROJECT_ID" -ForegroundColor Cyan
Write-Host "🌍 Region: $REGION" -ForegroundColor Cyan
Write-Host "🔧 Service: $SERVICE_NAME" -ForegroundColor Cyan

# Build and deploy to Cloud Run
Write-Host "🔨 Building and deploying to Cloud Run..." -ForegroundColor Yellow

$env_vars = "PROJECT_ID=$PROJECT_ID,BUCKET_NAME=watch-mail-trial-invoice-raw-files,CLOUD_TASKS_LOCATION=asia-south1,CLOUD_TASKS_QUEUE=invoice-processing-queue,QUEUE_PROCESSOR_URL=https://queue-processor-812016027146.asia-south1.run.app"

gcloud run deploy $SERVICE_NAME `
    --source . `
    --project $PROJECT_ID `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --set-env-vars $env_vars `
    --memory 1Gi `
    --cpu 1 `
    --timeout 300 `
    --concurrency 80 `
    --min-instances 0 `
    --max-instances 10

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}

# Get the deployed URL
$DEPLOYED_URL = gcloud run services describe $SERVICE_NAME --project $PROJECT_ID --region $REGION --format "value(status.url)"

Write-Host "✅ Deployment completed!" -ForegroundColor Green
Write-Host "🌐 Service URL: $DEPLOYED_URL" -ForegroundColor Cyan
Write-Host "📋 Service: $SERVICE_NAME" -ForegroundColor Cyan
Write-Host "🔍 View logs: gcloud logs tail services/$SERVICE_NAME --project $PROJECT_ID" -ForegroundColor Cyan

# Create/update the Cloud Tasks queue
Write-Host "🔄 Setting up Cloud Tasks queue..." -ForegroundColor Yellow

# Check if queue exists
$QUEUE_EXISTS = $null
try {
    $QUEUE_EXISTS = gcloud tasks queues describe invoice-processing-queue --location=$REGION --project=$PROJECT_ID --format="value(name)" 2>$null
} catch {
    # Queue doesn't exist
}

if (-not $QUEUE_EXISTS) {
    Write-Host "📋 Creating Cloud Tasks queue..." -ForegroundColor Yellow
    gcloud tasks queues create invoice-processing-queue `
        --location=$REGION `
        --project=$PROJECT_ID `
        --max-dispatches-per-second=10 `
        --max-concurrent-dispatches=5 `
        --max-attempts=3 `
        --max-retry-duration=1800s `
        --min-backoff=60s `
        --max-backoff=3600s
    
    Write-Host "✅ Cloud Tasks queue created: invoice-processing-queue" -ForegroundColor Green
} else {
    Write-Host "✅ Cloud Tasks queue already exists: invoice-processing-queue" -ForegroundColor Green
}

# Set IAM permissions for Cloud Tasks
Write-Host "🔐 Setting up IAM permissions..." -ForegroundColor Yellow

# Allow Cloud Tasks to invoke the queue processor
gcloud run services add-iam-policy-binding queue-processor `
    --member="serviceAccount:cloudrun-invoice-uploader@$PROJECT_ID.iam.gserviceaccount.com" `
    --role="roles/run.invoker" `
    --region=$REGION `
    --project=$PROJECT_ID

# Ensure the service account has Cloud Tasks admin rights
gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:cloudrun-invoice-uploader@$PROJECT_ID.iam.gserviceaccount.com" `
    --role="roles/cloudtasks.admin"

Write-Host "🎉 Cloud Tasks Initial API deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Deploy the updated queue processor with: cd ../../queue-processor && .\deploy-cloud-tasks.ps1" -ForegroundColor White
Write-Host "2. Test the Cloud Tasks integration" -ForegroundColor White
Write-Host "3. Monitor Cloud Tasks queue: gcloud tasks queues describe invoice-processing-queue --location=$REGION" -ForegroundColor White
Write-Host ""
Write-Host "🔍 Debugging commands:" -ForegroundColor Cyan
Write-Host "  - View Cloud Tasks queue: gcloud tasks queues describe invoice-processing-queue --location=$REGION" -ForegroundColor White
Write-Host "  - List tasks: gcloud tasks list --queue=invoice-processing-queue --location=$REGION" -ForegroundColor White
Write-Host "  - View logs: gcloud logs tail services/$SERVICE_NAME" -ForegroundColor White