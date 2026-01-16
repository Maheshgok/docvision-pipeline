# Orchestrator Service - Job Coordination Hub

## Overview
The **Orchestrator Service** is the lightweight coordination hub for the invoice processing pipeline. It handles job creation, status tracking, and phase orchestration without heavy dependencies.

## Features

### 🎯 Core Capabilities
- **Job Creation** - Generate unique job IDs and initialize processing
- **Status Tracking** - Real-time job progress with phase breakdown
- **Phase Orchestration** - Coordinate pipeline phases (extraction → enrichment → standardization → combination)
- **Tenant Isolation** - All operations are tenant-scoped using shared utilities

### 🔗 API Endpoints

#### Health Check
```
GET /health
```
Returns service status and capabilities.

#### Process Invoice
```
POST /process-invoice
Authorization: Bearer <firebase_token>
X-Tenant-ID: <tenant_id>

{
  "gcs_input_path": "gs://invoice-processing-bucket/tenant_123/uploads/invoice.pdf",
  "original_filename": "invoice_2024.pdf", 
  "file_size_bytes": 2048576
}
```

Creates new processing job and triggers extraction phase.

#### Get Job Status
```
GET /jobs/{job_id}/status
Authorization: Bearer <firebase_token>
X-Tenant-ID: <tenant_id>
```

Returns complete job status including progress breakdown.

#### Get Job Progress
```
GET /jobs/{job_id}/progress  
Authorization: Bearer <firebase_token>
X-Tenant-ID: <tenant_id>
```

Returns focused progress information for UI updates.

### 🏗️ Architecture

#### Service Integration
- **Data Extractor v2** - Triggers initial document processing
- **Chunk Dispatcher** - Coordinates line item chunking
- **Enrichment Worker** - Manages async enrichment processing  
- **Field Standardizer v2** - Handles field validation and formatting
- **Data Combiner v2** - Merges all processed data

#### Progress Tracking
- **Status-based Progress**: CREATED (5%) → EXTRACTING (20%) → ENRICHING (40%) → STANDARDIZING (70%) → COMBINING (90%) → COMPLETED (100%)
- **Chunk-level Detail**: During enrichment phase, tracks individual chunk completion
- **Real-time Updates**: Progress updates reflect actual processing state

### 🔧 Configuration

#### Environment Variables
```bash
PROJECT_ID=watch-mail-trial
ENVIRONMENT=development

# Service URLs (production)
DATA_EXTRACTOR_URL=https://data-extractor-v2-812016027146.asia-south1.run.app
CHUNK_DISPATCHER_URL=https://chunk-dispatcher-812016027146.asia-south1.run.app  
FIELD_STANDARDIZER_URL=https://field-standardizer-v2-812016027146.asia-south1.run.app
DATA_COMBINER_URL=https://data-combiner-v2-812016027146.asia-south1.run.app
```

#### Shared Dependencies
- `auth_utils.py` - Tenant validation and authentication  
- `firestore_utils.py` - Job document operations
- `error_handling.py` - Standardized error responses

### 🚀 Deployment

#### Local Development
```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export PROJECT_ID=watch-mail-trial
export ENVIRONMENT=development

# Run service
python main.py
```

#### Cloud Run Deployment
```bash
# Build and deploy
gcloud builds submit --tag gcr.io/watch-mail-trial/orchestrator-service
gcloud run deploy orchestrator-service \
  --image gcr.io/watch-mail-trial/orchestrator-service \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated
```

### 📊 Monitoring

#### Health Checks
- Service includes health endpoint for container orchestration
- Returns service capabilities and version information

#### Logging
- Structured logging with tenant context
- Progress tracking with emoji indicators
- Error logging includes tenant and job context

### 🔐 Security

#### Authentication
- All endpoints require Firebase Bearer token
- Tenant ID validation on every request
- Request context includes user authentication details

#### Data Isolation
- All Firestore operations are tenant-scoped
- Job documents stored in tenant-specific collections
- No cross-tenant data access possible

## Next Steps

1. **Deploy Orchestrator** - Create Cloud Run service
2. **Build Data Extractor v2** - PDF processing with latest OpenAI API  
3. **Build Chunk Dispatcher** - Line item batching and Pub/Sub publishing
4. **Build Enrichment Worker** - Async business data enrichment
5. **Integrate Services** - Connect all services via HTTP and Pub/Sub