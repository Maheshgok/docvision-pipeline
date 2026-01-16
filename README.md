# Invoice Processing Pipeline - Current Working Architecture

## Architecture Overview
Multi-stage orchestrated pipeline for AI-powered invoice processing with temporary storage coordination.

## Current Working Services

### Core Components
- **initial-api/Cloudrun_version/** - Entry point and file upload handler
- **pipeline-orchestrator/** - Central coordinator for 6-stage processing
- **field-standardizer/** - Field mapping and standardization
- **data-combiner/** - Final assembly and result formatting
- **data-extractor/** - OCR and basic text extraction  
- **queue-enrichment-processor/** - Data enrichment and validation
- **archive-manager/** - Result archiving and lifecycle management

### Frontend
- **invoice-app-v2/** - React frontend with multi-tenant support

### Shared Infrastructure
- **shared/temp_storage_manager.py** - Inter-stage coordination and temporary storage

## Deployment Status
All services deployed to Google Cloud Run in **watch-mail-trial** project.

## Current Issues
- Pipeline processing with persistent 401 authentication errors
- Service communication issues despite CORS and authentication updates
- End-to-end processing not completing successfully

## Archived Components
Legacy files and outdated services moved to `archive/` directory:
- Old individual functional services (replaced by orchestrator)
- PWA version (replaced by v2 frontend)
- Legacy queue processor 
- Outdated documentation and test files

## Next Steps
1. Debug orchestrator authentication flow
2. Verify service-to-service communication
3. Complete end-to-end pipeline testing
4. Implement proper monitoring and error handling

## Quick Start
```bash
# Deploy all services
./deploy.sh

# Start frontend development
cd invoice-app-v2
npm run dev
```