# Invoice Processing Pipeline

> AI-powered invoice processing system with multi-tenant support, real-time updates, and automated journal entry generation for Indian businesses.

## 🏗️ Architecture

```
Frontend (Netlify)
     ↓
initial-api (Cloud Run) → orchestrator-service → data-extractor-v2
                                                        ↓
Firestore ← data-combiner ← field-standardizer-v2 ← enrichment-worker
```

### Services

| Service | Purpose | Tech |
|---------|---------|------|
| `invoice-app-v2/` | React frontend SPA | React + Vite + TypeScript + Tailwind |
| `initial-api/` | File upload, auth, pipeline trigger | Python + Flask |
| `orchestrator-service/` | Pipeline coordination | Python + Flask |
| `data-extractor-v2/` | OCR using OpenAI Vision API | Python + OpenAI |
| `enrichment-worker/` | Business logic enrichment | Python + OpenAI |
| `field-standardizer-v2/` | Field normalization & journal entries | Python + OpenAI |
| `data-combiner/` | Final Firestore write | Python + Flask |

### Infrastructure
- **Cloud Provider**: Google Cloud Platform
- **Project**: `watch-mail-trial` (asia-south1)
- **Frontend Hosting**: Netlify (auto-deploy from main)
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication (Google OAuth + Email)
- **Storage**: Google Cloud Storage (user-isolated buckets)

## 🚀 Quick Start

### Frontend Development
```bash
cd invoice-app-v2
npm install
npm run dev
```

### Deploy Frontend (auto on push)
```bash
git push origin main  # Netlify auto-deploys
```

### Deploy Backend Service
```bash
cd {service-folder}
gcloud run deploy {service-name} --source . --region asia-south1
```

## 📁 Project Structure

```
├── .github/
│   ├── copilot-instructions.md    # GitHub Copilot context
│   └── AI_AGENT_GUIDE.md          # Comprehensive AI agent guide
├── invoice-app-v2/                # Frontend React app
├── initial-api/                   # Upload & auth service
├── orchestrator-service/          # Pipeline coordinator
├── data-extractor-v2/             # OCR service
├── enrichment-worker/             # Enrichment service
├── field-standardizer-v2/         # Standardization service
├── data-combiner/                 # Final write service
├── shared/                        # Shared utilities
├── config/                        # Configuration files
├── schemas/                       # Data schemas
└── prompts/                       # AI prompts
```

## 🔑 Key Features

- **Multi-tenant isolation**: Each user's data in `users/{uid}/` subcollections
- **Real-time updates**: Firestore listeners stream processing status
- **Session recovery**: Unarchived results restored on login after crashes
- **Lazy loading**: Firestore listeners start only after first upload
- **Local archiving**: Archive operations run directly from browser (no Cloud Run dependency)

## 📋 For AI Agents

Read these files before making changes:
1. [.github/AI_AGENT_GUIDE.md](.github/AI_AGENT_GUIDE.md) - **Comprehensive development guide with common mistakes**
2. [.github/copilot-instructions.md](.github/copilot-instructions.md) - Quick patterns reference

### Critical Rules
- ❌ NEVER auto-archive on tab switch/page hide
- ❌ NEVER use `orderBy` without composite index
- ✅ ALWAYS use user-isolated Firestore paths
- ✅ ALWAYS verify auth token on backend endpoints

## 🔄 Recent Changes (v1.1.0)

- **Fixed**: Auto-archive on tab switch causing data loss
- **Added**: Session recovery for crash resilience
- **Switched**: Archive to local-only (no Cloud Run dependency)
- **Cleaned**: Removed 255 unused files (preserved in git at v1.0.0)

## 📊 Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-01-15 | Initial stable release |
| v1.1.0 | 2026-01-16 | Bug fixes, session recovery, code cleanup |

## 📝 License

Proprietary - All rights reserved
