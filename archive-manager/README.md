# Archive-Based Real-time Invoice Processing System

## 🎯 Architecture Overview

This system implements an **archive-based approach** for optimal real-time performance by automatically moving completed/processed invoice results from the active collection to an archive collection.

## 🚀 Benefits

- **⚡ Fast Real-time Queries**: Active collection stays small and fast
- **🔥 No Complex Filtering**: Simplified listeners without client-side filtering
- **📦 Automatic Data Management**: Completed results auto-archive
- **💾 Data Preservation**: All data preserved in archive with full metadata
- **🎯 Better UX**: Clean current data, fast responses

## 📊 Data Flow

```
Invoice Upload → Processing → Completed → Archive Trigger → 
Active Collection (small, fast) + Archive Collection (historical)
```

## 🛠 Services

### Archive Manager Cloud Run Service
**URL**: https://archive-manager-812016027146.asia-south1.run.app

#### Endpoints:
- `GET /health` - Service health check
- `POST /archive-completed` - Archive all completed results for user
- `POST /archive-displayed` - Archive all displayed results for user
- `POST /archive-all-old` - Archive results older than N days
- `GET /get-archived` - Retrieve archived results (paginated)

#### Authentication:
All endpoints require Firebase ID token in `Authorization: Bearer <token>` header.

## 🔧 Frontend Integration

### Auto-Archive Triggers

1. **Page Refresh/Load**: 
   ```typescript
   useEffect(() => {
     if (user?.email) {
       archiveCompletedResults() // Clean up on page load
     }
   }, [user?.email])
   ```

2. **CSV Download**:
   ```typescript
   const downloadCSV = async () => {
     await archiveCompletedResults() // Archive before download
     // ... generate and download CSV
   }
   ```

### Manual Archive Controls
- `archiveCompletedResults()` - Archive all completed
- `archiveDisplayedResults()` - Archive all displayed
- Available in useRealtimeUpload hook

## 📱 Real-time Listeners (Simplified)

### Before (Complex Filtering):
```typescript
// Complex client-side filtering needed
const isActiveProcessing = ['queued', 'processing'].includes(status)
const isRecentCompletion = status === 'completed' && frontendStatus !== 'displayed'
if (isActiveProcessing || isRecentCompletion) { ... }
```

### After (Archive-Based):
```typescript
// Archive system keeps collection clean - show everything!
const activeQuery = query(
  collection(db, 'invoice_results'),
  where('user_email', '==', user.email),
  limit(50) // Higher limit since archive keeps it clean
)
```

## 🗄 Collections Structure

### Active Collection: `invoice_results`
- **Purpose**: Current/active processing results
- **Content**: Queued, processing, recently completed (not yet archived)
- **Size**: Small (typically < 50 docs per user)
- **Performance**: Fast real-time queries

### Archive Collection: `invoice_results_archive`
- **Purpose**: Historical/completed results
- **Content**: Archived results with additional metadata
- **Metadata Added**:
  - `archived_at`: Archive timestamp
  - `archive_reason`: Why archived (completed_auto_archive, displayed_auto_archive, etc.)
  - `original_doc_id`: Original document ID from active collection

## 🔄 Archive Strategies

### 1. Completion-Based Archive
Triggers: Page refresh, CSV download
```javascript
POST /archive-completed
// Archives all results with status: 'completed'
```

### 2. Display-Based Archive  
Triggers: User marking results as "displayed"
```javascript
POST /archive-displayed
// Archives all results with frontend_status: 'displayed'
```

### 3. Time-Based Archive
Triggers: Manual or scheduled
```javascript
POST /archive-all-old
Content-Type: application/json
{ "days_old": 7 }
// Archives all results older than 7 days
```

## 🧪 Testing the System

### 1. Test Archive Service
```bash
curl https://archive-manager-812016027146.asia-south1.run.app/health
```

### 2. Test Archive Flow
1. Upload and process some invoices
2. Refresh the page → Should trigger auto-archive
3. Check console: `📦 Archived N completed results`
4. Real-time listener shows only active items

### 3. Test CSV Download
1. Download CSV → Should auto-archive before download
2. Check archive count in response

## 🚨 Migration Notes

- **No Breaking Changes**: Old real-time system continues to work
- **Archive Collection**: New collection created automatically
- **Firestore Security Rules**: May need updating for archive collection access
- **Backward Compatibility**: All existing data remains in active collection until archived

## ⚙️ Configuration

### Environment Variables
- `GOOGLE_CLOUD_PROJECT`: Project ID for Firestore access

### Frontend Service URLs
Update in `src/services/archive.ts`:
```typescript
const ARCHIVE_SERVICE_URL = 'https://archive-manager-812016027146.asia-south1.run.app'
```

## 🔐 Security

- **Firebase Authentication**: All endpoints verify Firebase ID tokens
- **User Isolation**: Archive operations only affect requesting user's data
- **Firestore Security**: Uses existing Firestore security rules + user email filtering

## 📈 Monitoring

### Logs to Watch
- `📦 Archived N completed results` - Successful archives
- `📭 No completed results to archive` - Clean state
- `❌ Archive failed` - Error conditions
- `📊 Simplified processing: N results` - Real-time listener efficiency

### Metrics
- Archive service response times
- Active collection document count per user
- Archive success/failure rates

## 🔮 Future Enhancements

1. **Scheduled Archiving**: Cloud Scheduler for automatic old data archiving
2. **Archive Analytics**: Query patterns and usage statistics  
3. **Data Export**: Export archived data to BigQuery for analysis
4. **Advanced Filtering**: Enhanced archive retrieval with complex filters
5. **Bulk Operations**: Archive/restore multiple users or date ranges

## 🎉 Ready to Use!

The archive-based system is now deployed and ready to provide optimal real-time performance with automatic data lifecycle management. Users will experience faster load times and cleaner data while maintaining full historical access through the archive system.