# GitHub Copilot Instructions - Invoice Processing System

## Project Overview
This is a **multi-tenant invoice processing system** with AI-powered OCR, real-time data sync, and organization-based access control. The system processes invoices through Google Cloud Run services and generates accounting journal entries for Indian businesses.

## Architecture Patterns

### Multi-Tenant Data Isolation
- **User collections**: `users/{uid}/invoice_results/` - Each user's data is completely isolated
- **Organization collections**: `organizations/{orgId}/shared_data/` - Org-level sharing with role-based access
- **Service pattern**: All services extend base classes with user/org context injection
- **Permission checking**: Every data operation validates user permissions through `userService.hasPermission()`

### Service-Oriented Architecture
```typescript
// Core service pattern - always inject user context
class BaseService {
  protected getUserDataPath(collection: string): string {
    return userService.getUserDataPath(collection) // users/{uid}/{collection}
  }
}

// Usage in firestore-realtime.ts, archive.ts, etc.
const userCollectionPath = userService.getUserDataPath('invoice_results')
```

### Real-Time State Management
- **Archive-based performance**: Active collections stay small, completed items auto-archive
- **Lazy loading**: Firestore listeners start only after first upload to avoid unnecessary connections  
- **Batch processing**: Files processed in batches with progress tracking via `BatchManager`
- **State synchronization**: `FirestoreSyncManager` bridges Firestore real-time updates to local state

## Key Workflows

### Development
```bash
# Start dev server (auto-detects port conflicts)
cd invoice-app-v2 && npm run dev

# Build with proper chunking for Firebase/UI libraries
npm run build

# Deploy to Netlify (auto-triggered on main branch push)
git push origin main
```

### File Upload & Processing Flow
1. **Permission check**: `checkUsageLimits()` validates user quotas
2. **File validation**: `validateFileSize()` against user limits
3. **Upload to GCS**: Direct upload with signed URLs from `initial-api` service
4. **Queue processing**: Cloud Run `initial-analysis` processes with OpenAI Vision API
5. **Real-time updates**: Results stream back via Firestore listeners
6. **Auto-archive**: Completed results archived on CSV download or page refresh

### User Management (Admin Features)
```typescript
// Organization-based user creation (admin-only)
await organizationService.inviteUser(email, role, organizationId)

// Permission validation pattern used throughout
const canEdit = await userService.hasPermission('canEdit')
if (!canEdit) throw new Error('Insufficient permissions')
```

## Critical Code Patterns

### Error Handling with User Context
```typescript
// Always include user context in error logs
console.error('❌ Error for user:', userService.getCurrentUserUID(), error)

// User-friendly error messages with fallbacks
error.userMessage = errorMessages[error.code] || error.message
```

### Firestore Query Patterns
```typescript
// ALWAYS use user-isolated paths
const userQuery = query(
  collection(db, userService.getUserDataPath('invoice_results')),
  where('userUID', '==', user.uid), // Double verification
  orderBy('createdAt', 'desc')
)

// Organization queries require additional permission checks
if (await userService.hasPermission('canViewOthersData')) {
  const orgQuery = query(/* organization-level collection */)
}
```

### React State Management
```typescript
// Service instances in refs to prevent recreation
const batchManager = useRef<BatchManager | null>(null)
const syncManager = useRef<FirestoreSyncManager | null>(null)

// Permission-based UI rendering
const { hasPermission } = useAuth()
{hasPermission('canUpload') && <UploadComponent />}
```

## External Integrations

### Google Cloud Services
- **initial-api**: File upload signed URLs (`https://initial-api-*.run.app`)
- **initial-analysis**: OpenAI Vision processing (`https://initial-analysis-*.run.app`)  
- **archive-manager**: Data lifecycle management (`https://archive-manager-*.run.app`)
- **Cloud Storage**: `invoice-processing-bucket` with user-prefixed paths

### Firebase Configuration
- **Auth**: Google OAuth + email/password with custom claims for organizations
- **Firestore**: Per-user subcollections with security rules enforcing isolation
- **Environment**: All config in `.env` files, production values in Netlify environment

## Component Conventions

### File Organization
- **Pages**: `src/pages/` - Route-level components with full business logic
- **Services**: `src/services/` - Singleton classes, always export instance as `{serviceName}Service`
- **Hooks**: Custom hooks prefix with `use`, encapsulate service interactions
- **Types**: Shared interfaces in `src/types/`, organized by domain

### Styling Patterns
- **Tailwind utility classes**: Primary styling approach
- **Component variants**: Use `clsx` for conditional classes
- **Responsive design**: Mobile-first with `lg:` breakpoints
- **Status colors**: Green=success, Red=error, Blue=processing, Amber=warning

### Error Boundaries
- **Toast notifications**: `react-hot-toast` for user feedback
- **Console logging**: Structured logs with emoji prefixes (🔥=Firestore, 📦=Archive, ⚡=Real-time)
- **Graceful degradation**: Always provide fallback UI states

## Testing Patterns
- **Local testing**: Use Firebase emulator for Firestore operations
- **Permission testing**: Mock different user roles in `userService`
- **File upload testing**: Test with various file sizes/types against user limits
- **Real-time testing**: Verify proper cleanup of Firestore listeners

## Deployment Notes
- **Netlify**: Automatic deploys from main branch, environment variables configured
- **Cloud Run**: Services auto-scale, require Firebase Auth tokens in headers  
- **Firestore security**: Rules enforce user/org isolation, always test rule changes
- **Monitoring**: Check Cloud Run logs for processing errors, Firestore usage for quota limits