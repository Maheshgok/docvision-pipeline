# AI Agent Development Guide - Invoice Processing System

> **Purpose**: This guide helps AI agents (GitHub Copilot, Claude, etc.) avoid common mistakes and follow established patterns when working on this codebase. Read this BEFORE making changes.

---

## 📋 Table of Contents

1. [Project Architecture](#project-architecture)
2. [Critical Rules - NEVER Break These](#critical-rules---never-break-these)
3. [Common Mistakes to Avoid](#common-mistakes-to-avoid)
4. [Development Preferences](#development-preferences)
5. [Frontend Patterns](#frontend-patterns)
6. [Backend Patterns](#backend-patterns)
7. [Firestore Patterns](#firestore-patterns)
8. [Debugging Guide](#debugging-guide)
9. [User Perspective](#user-perspective)
10. [Deployment Checklist](#deployment-checklist)

---

## Project Architecture

### Active Pipeline (as of v1.1.0)
```
Frontend (Netlify) → initial-api → orchestrator-service → data-extractor-v2 
                                                              ↓
                     Firestore ← data-combiner ← field-standardizer-v2 ← enrichment-worker
```

### Key Folders
| Folder | Purpose | Tech |
|--------|---------|------|
| `invoice-app-v2/` | Frontend SPA | React + Vite + TypeScript |
| `initial-api/` | File upload & auth | Python + Flask |
| `orchestrator-service/` | Pipeline coordination | Python + Flask |
| `data-extractor-v2/` | OCR with OpenAI Vision | Python + OpenAI |
| `enrichment-worker/` | Business logic enrichment | Python + OpenAI |
| `field-standardizer-v2/` | Field normalization | Python + OpenAI |
| `data-combiner/` | Final Firestore write | Python + Flask |

### GCP Project Details
- **Project ID**: `watch-mail-trial`
- **Project Number**: `812016027146`
- **Region**: `asia-south1`
- **Cloud Run URL Pattern**: `https://{service}-812016027146.asia-south1.run.app`

---

## Critical Rules - NEVER Break These

### 1. ❌ NEVER Auto-Archive on Tab Switch/Page Hide
```typescript
// BAD - Caused major data loss bug
window.addEventListener('pagehide', () => {
  archiveCompletedResults() // ❌ NEVER DO THIS
})

// GOOD - Archive only on explicit user action
downloadCSV() → archiveCompletedResults() // ✅ User clicked download
logout() → archiveCompletedResults() // ✅ User explicitly logged out
```
**Why**: Users switch tabs frequently. Auto-archiving moved ALL their data to archive, showing a blank screen when they returned.

### 2. ❌ NEVER Use `orderBy` Without a Composite Index
```typescript
// BAD - Will fail with "The query requires an index" error
query(collection, where('userUID', '==', uid), orderBy('created_at', 'desc'))

// GOOD - Either create index or skip orderBy for simple queries
query(collection, where('userUID', '==', uid), limit(100))
```
**Why**: Firestore requires composite indexes for queries with both `where` and `orderBy` on different fields.

### 3. ❌ NEVER Store Secrets in Code
```python
# BAD
OPENAI_API_KEY = "sk-xxxx"  # ❌ Will block git push

# GOOD - Use Secret Manager
from google.cloud import secretmanager
client = secretmanager.SecretManagerServiceClient()
response = client.access_secret_version(name=f"projects/{PROJECT_ID}/secrets/openai-api-key-secret/versions/latest")
api_key = response.payload.data.decode("UTF-8")
```

### 4. ✅ ALWAYS Use User-Isolated Paths
```typescript
// BAD
collection(db, 'invoice_results')  // ❌ No user isolation

// GOOD
collection(db, `users/${user.uid}/invoice_results`)  // ✅ User-isolated
// OR use the helper
userService.getUserDataPath('invoice_results')  // ✅ Returns 'users/{uid}/invoice_results'
```

### 5. ✅ ALWAYS Double-Verify User in Queries
```typescript
// Security rule says user can only read their own data, but add where clause too
const userQuery = query(
  collection(db, userService.getUserDataPath('invoice_results')),
  where('userUID', '==', user.uid),  // ✅ Double verification
  limit(50)
)
```

---

## Common Mistakes to Avoid

### Frontend Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Creating services in component body | Services recreated on every render | Use `useRef` for service instances |
| Not cleaning up Firestore listeners | Memory leaks, duplicate updates | Call `unsubscribe()` in useEffect cleanup |
| Calling archive on visibility change | Blank screen when returning to tab | Only archive on explicit user action |
| Not checking user authentication | Crashes on Firestore queries | Check `user?.uid` before queries |
| Hardcoding API URLs | Breaks when deployed | Use `getApiUrl.xxx()` helper |

### Backend Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Using wrong Firestore path | Data saved to wrong location | Always use `users/{uid}/collection_name` pattern |
| Not validating auth token | Unauthorized access | Verify Firebase ID token on every request |
| Returning before async completes | Incomplete processing | Use `await` or proper callback handling |
| Not handling OpenAI rate limits | 429 errors | Implement exponential backoff |

### Firestore Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Missing security rule | "permission-denied" error | Add rule in `firestore.rules` and deploy |
| Query without index | Runtime error with index link | Click the link in error or remove `orderBy` |
| Writing to archive without rule | Archive fails silently | Add `invoice_results_archive` rule |

---

## Development Preferences

### Code Style
- **TypeScript**: Strict mode, explicit types (no `any` unless absolutely necessary)
- **React**: Functional components with hooks, no class components
- **Services**: Singleton pattern, export instance as `{name}Service`
- **Logging**: Use emoji prefixes for easy scanning:
  - 🔥 Firestore operations
  - 📦 Archive operations
  - ⚡ Real-time updates
  - ✅ Success
  - ❌ Error
  - 🔄 In progress
  - 📋 Data/entries

### File Naming
- **Services**: `camelCase.ts` (e.g., `sessionRecoveryService.ts`)
- **Components**: `PascalCase.tsx` (e.g., `MultiUploadDashboard.tsx`)
- **Hooks**: `useCamelCase.ts` (e.g., `useMultiUploadSimplified.ts`)
- **Types**: `camelCase.ts` in `types/` folder

### Git Commits
- Use descriptive messages with context
- Prefix with action: `Add`, `Fix`, `Update`, `Remove`, `Refactor`
- Include "why" for non-obvious changes

```bash
# Good examples
"Add session recovery: restore unarchived results on login"
"FIX: Prevent auto-archive on tab switch/refresh (major bug)"
"Remove unused services (preserved in git history at v1.0.0)"
```

---

## Frontend Patterns

### Service Initialization
```typescript
// ✅ CORRECT - Services in refs
const batchManager = useRef<BatchManager | null>(null)
const syncManager = useRef<FirestoreSyncManager | null>(null)

useEffect(() => {
  if (!batchManager.current) {
    batchManager.current = new BatchManager()
  }
  // ...
}, [])
```

### Firestore Listener Pattern
```typescript
// ✅ CORRECT - Proper setup and cleanup
useEffect(() => {
  if (!user?.uid) return

  const unsubscribe = onSnapshot(
    query(collection(db, `users/${user.uid}/invoice_results`), limit(50)),
    (snapshot) => {
      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setResults(results)
    },
    (error) => console.error('Listener error:', error)
  )

  return () => unsubscribe()  // ✅ Cleanup on unmount
}, [user?.uid])
```

### Toast Notifications
```typescript
import toast from 'react-hot-toast'

// Success
toast.success('File uploaded successfully')

// Error
toast.error('Upload failed: ' + error.message)

// Info with icon
toast('Recovered 5 results from previous session', { icon: '🔄', duration: 5000 })

// Loading state
const toastId = toast.loading('Processing...')
// Later:
toast.success('Done!', { id: toastId })
```

### Permission-Based Rendering
```typescript
const { hasPermission } = useAuth()

return (
  <div>
    {hasPermission('canUpload') && <UploadButton />}
    {hasPermission('canDownload') && <DownloadButton />}
    {hasPermission('canManageOrgUsers') && <AdminPanel />}
  </div>
)
```

---

## Backend Patterns

### Cloud Run Service Template
```python
from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore
import firebase_admin
from firebase_admin import auth as firebase_auth

app = Flask(__name__)
CORS(app)

# Lazy initialization
firestore_client = None

def get_firestore():
    global firestore_client
    if not firestore_client:
        firestore_client = firestore.Client()
    return firestore_client

def verify_auth_token(request):
    """Verify Firebase ID token from Authorization header"""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None
    
    token = auth_header.split('Bearer ')[1]
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded['uid']
    except Exception:
        return None

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'})

@app.route('/process', methods=['POST'])
def process():
    user_uid = verify_auth_token(request)
    if not user_uid:
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Process request...
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

### Writing to User's Firestore Collection
```python
def save_result(user_uid: str, job_id: str, result: dict):
    """Save result to user's collection"""
    db = get_firestore()
    
    # ✅ CORRECT - User-isolated path
    doc_ref = db.collection('users').document(user_uid)\
                 .collection('invoice_results').document(job_id)
    
    doc_ref.set({
        **result,
        'userUID': user_uid,  # Double verification
        'job_id': job_id,
        'updated_at': firestore.SERVER_TIMESTAMP
    }, merge=True)
```

---

## Firestore Patterns

### Security Rules Template
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User's own data - full access
    match /users/{userId}/{collection}/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // User profiles - read own, admins read all
    match /user_profiles/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Common Collections
| Collection | Path | Purpose |
|------------|------|---------|
| Active results | `users/{uid}/invoice_results/{jobId}` | Currently processing/completed |
| Archived results | `users/{uid}/invoice_results_archive/{id}` | Downloaded/archived data |
| User profiles | `user_profiles/{uid}` | User settings, permissions, quotas |
| Organizations | `organizations/{orgId}` | Multi-tenant org data |
| Client orgs | `client_organizations/{clientId}` | COA mappings, client settings |

---

## Debugging Guide

### Frontend Issues

**Blank screen after tab switch**
- Check if auto-archive is being called on `pagehide` or `visibilitychange`
- Should NOT be - this was fixed in commit `2aa66a2`

**"The query requires an index" error**
- Click the link in the console to create the index
- OR remove `orderBy` if not critical

**Firestore permission denied**
- Check security rules match the collection path
- Verify user is authenticated (`user?.uid` exists)
- Check if rule was deployed: `firebase deploy --only firestore:rules`

**Results not updating in real-time**
- Check if listener is set up correctly
- Look for `onSnapshot` in the service
- Verify cleanup isn't being called prematurely

### Backend Issues

**Cloud Run returning 401**
- Verify Firebase token is being sent in Authorization header
- Check `firebase_auth.verify_id_token()` is working
- Token might be expired (refresh in frontend)

**OpenAI API 429 errors**
- Rate limit hit - implement exponential backoff
- Consider queueing requests

**Firestore write failing**
- Check collection path is correct
- Verify Cloud Run service account has Firestore permissions

### Checking Logs
```bash
# Cloud Run logs
gcloud run services logs read {service-name} --region=asia-south1 --limit=50

# All services
gcloud run services list --platform=managed --region=asia-south1
```

---

## User Perspective

### What Users Expect
1. **Upload invoices** → See them in a table within seconds
2. **Processing status** → Clear feedback (uploading/processing/completed)
3. **Download CSV** → Get all processed data in one file
4. **Session recovery** → If browser crashes, data should still be there on next login
5. **No data loss** → NEVER lose their processed results

### User Pain Points (Solved)
| Issue | Solution |
|-------|----------|
| Blank screen on tab return | Removed auto-archive on pagehide/visibilitychange |
| Lost data after browser crash | Added session recovery - fetches unarchived results on login |
| Slow initial load | Lazy listener initialization - only starts after first upload |
| Confusing archive behavior | Archive only on explicit CSV download or logout |

### User Actions That Trigger Archive
1. ✅ Click "Download CSV" button
2. ✅ Click "Archive" button
3. ✅ Click "Logout" button
4. ❌ NOT on tab switch
5. ❌ NOT on page refresh
6. ❌ NOT on browser close (data preserved for recovery)

---

## Deployment Checklist

### Before Deploying Frontend
- [ ] `npm run build` succeeds with no errors
- [ ] Test locally with `npm run dev`
- [ ] Check for hardcoded URLs (should use `getApiUrl`)
- [ ] Verify Firestore rules are deployed if changed

### Before Deploying Backend Service
- [ ] Test locally with `python main.py`
- [ ] Check all environment variables are set in Cloud Run
- [ ] Verify Secret Manager access for API keys
- [ ] Update service URL if it changed

### After Deployment
- [ ] Test upload flow end-to-end
- [ ] Check Cloud Run logs for errors
- [ ] Verify Firestore documents are created correctly
- [ ] Test session recovery (close browser, log back in)

---

## Quick Reference

### API URLs
```typescript
// Frontend helper
import { getApiUrl } from '../config/api'

getApiUrl.health()        // /api/health
getApiUrl.uploadInvoice() // /api/upload
getApiUrl.status(jobId)   // /api/status/{jobId}
```

### Environment Variables
```bash
# Frontend (.env)
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_API_BASE_URL=https://initial-api-xxx.run.app

# Backend (Cloud Run)
PROJECT_ID=watch-mail-trial
OPENAI_API_KEY=from-secret-manager
```

### Useful Commands
```bash
# Build frontend
cd invoice-app-v2 && npm run build

# Deploy Firestore rules
firebase deploy --only firestore:rules

# View Cloud Run services
gcloud run services list --region=asia-south1

# View service logs
gcloud run services logs read initial-api --region=asia-south1 --limit=50

# Push to deploy (Netlify auto-deploys main branch)
git push origin main
```

---

## Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| v1.0.0 | 2026-01-15 | Initial stable release |
| v1.1.0 | 2026-01-16 | Fixed auto-archive bug, added session recovery, cleaned unused code |

---

*Last updated: January 16, 2026*
