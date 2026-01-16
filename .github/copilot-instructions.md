# GitHub Copilot Instructions - Invoice Processing System

> **⚠️ Read the full AI Agent Guide**: [.github/AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md) for comprehensive patterns, common mistakes, and debugging tips.

## Project Overview
Multi-tenant invoice processing system with AI-powered OCR, real-time Firestore sync, and automated journal entry generation for Indian businesses.

## Critical Rules (NEVER Break)

1. **❌ NEVER auto-archive on tab switch/page hide** - Caused major data loss
2. **❌ NEVER use `orderBy` without composite index** - Will fail at runtime
3. **✅ ALWAYS use user-isolated paths**: `users/{uid}/collection_name`
4. **✅ ALWAYS verify auth** on backend endpoints

## Active Pipeline
```
initial-api → orchestrator-service → data-extractor-v2 → enrichment-worker → field-standardizer-v2 → data-combiner → Firestore
```

## Key Patterns

### User-Isolated Firestore Paths
```typescript
// ✅ CORRECT
collection(db, `users/${user.uid}/invoice_results`)
// OR
userService.getUserDataPath('invoice_results')

// ❌ WRONG
collection(db, 'invoice_results')
```

### Service Instances in Refs
```typescript
// ✅ CORRECT - Prevents recreation on re-render
const batchManager = useRef<BatchManager | null>(null)
const syncManager = useRef<FirestoreSyncManager | null>(null)
```

### Firestore Listener Cleanup
```typescript
useEffect(() => {
  const unsubscribe = onSnapshot(query, callback)
  return () => unsubscribe()  // ✅ Always cleanup
}, [user?.uid])
```

### Archive Triggers (ONLY these)
- ✅ Click "Download CSV"
- ✅ Click "Archive" button
- ✅ Click "Logout"
- ❌ NOT on tab switch
- ❌ NOT on page refresh

## Console Logging Prefixes
- 🔥 Firestore operations
- 📦 Archive operations
- ⚡ Real-time updates
- 📋 Data/entries
- ✅ Success
- ❌ Error
- 🔄 In progress

## Quick Reference

### Frontend Commands
```bash
cd invoice-app-v2
npm run dev      # Development
npm run build    # Production build
```

### Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### View Cloud Run Logs
```bash
gcloud run services logs read {service} --region=asia-south1 --limit=50
```

## File Structure
- **Services**: `src/services/{name}Service.ts` - Singleton pattern
- **Hooks**: `src/hooks/use{Name}.ts` - React hooks
- **Pages**: `src/pages/{Name}.tsx` - Route components
- **Types**: `src/types/` - TypeScript interfaces

## GCP Details
- **Project**: `watch-mail-trial`
- **Region**: `asia-south1`
- **URL Pattern**: `https://{service}-812016027146.asia-south1.run.app`

---
*See [AI_AGENT_GUIDE.md](AI_AGENT_GUIDE.md) for full documentation*
