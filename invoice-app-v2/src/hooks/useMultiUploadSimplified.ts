/**
 * Simplified Multi-Upload Hook with User Access Control and Client Organization Support
 * Uses modular services for better separation of concerns
 * Includes permission checks, usage limits, and client organization context
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { authService } from '../services/auth'
import { userService } from '../services/userService'
import { archiveService } from '../services/archive'
import { clientOrganizationService, ClientOrganization } from '../services/clientOrganizations'
import { getApiUrl } from '../config/api'
import { BatchManager, type BatchFile, type BatchState } from '../services/batch-manager'
import { FirestoreSyncManager, type JournalEntry } from '../services/firestore-sync-manager'
import { changeTrackingService } from '../services/changeTracking'
import { sessionSecurityService } from '../services/sessionSecurityService'
import { sessionRecoveryService } from '../services/sessionRecoveryService'

export interface UseMultiUploadOptions {
  selectedClientOrganization?: ClientOrganization | null
}

export const useMultiUploadSimplified = (options: UseMultiUploadOptions = {}) => {
  // Core state
  const [batchState, setBatchState] = useState<BatchState>({
    files: [],
    totalFiles: 0,
    completedFiles: 0,
    processingFiles: 0,
    errorFiles: 0,
    isComplete: false,
    readyForDownload: false
  })
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Service instances (using refs to maintain consistency)
  const batchManager = useRef<BatchManager | null>(null)
  const syncManager = useRef<FirestoreSyncManager | null>(null)
  const recoveryChecked = useRef<boolean>(false)

  // Initialize services
  useEffect(() => {
    if (!batchManager.current) {
      batchManager.current = new BatchManager()
      console.log('📦 Batch manager initialized')
    }

    if (!syncManager.current && batchManager.current) {
      syncManager.current = new FirestoreSyncManager(batchManager.current)
      console.log('🔥 Firestore sync manager initialized')
    }

    setIsInitialized(true)
  }, [])

  // Check for recoverable results from previous sessions (one-time fetch on login)
  useEffect(() => {
    if (!isInitialized || recoveryChecked.current) return

    const checkRecovery = async () => {
      try {
        console.log('🔄 Checking for recoverable results from previous session...')
        recoveryChecked.current = true
        
        const recovery = await sessionRecoveryService.checkForRecoverableResults()
        
        if (recovery.hasRecoveredData && recovery.journalEntries.length > 0) {
          console.log(`✅ Recovered ${recovery.journalEntries.length} journal entries from previous session`)
          
          // Set recovered entries immediately (before listener starts)
          setJournalEntries(recovery.journalEntries)
          
          // Notify user about recovered data
          toast.success(
            `📋 Recovered ${recovery.resultCount} result(s) from your previous session`,
            { duration: 5000, icon: '🔄' }
          )
          
          // Start listener to pick up any real-time updates
          if (syncManager.current) {
            console.log('🚀 Starting Firestore listener for recovered session')
            syncManager.current.startListening()
          }
        } else {
          console.log('✅ No recoverable data found (clean session)')
        }
      } catch (error) {
        console.error('❌ Session recovery check failed:', error)
        // Don't block the app - just log the error
      }
    }

    checkRecovery()
  }, [isInitialized])

  // Subscribe to batch state changes
  useEffect(() => {
    if (!batchManager.current || !isInitialized) return

    const unsubscribe = batchManager.current.subscribe((state) => {
      setBatchState(state)
      console.log('📊 Batch state updated:', {
        total: state.totalFiles,
        completed: state.completedFiles,
        processing: state.processingFiles,
        readyForDownload: state.readyForDownload
      })
    })

    return unsubscribe
  }, [isInitialized])

  // Subscribe to journal entry changes
  useEffect(() => {
    if (!syncManager.current || !isInitialized) return

    const unsubscribe = syncManager.current.subscribeToJournalEntries((entries) => {
      setJournalEntries(entries)
      console.log('📋 Journal entries updated:', entries.length)
    })

    return unsubscribe
  }, [isInitialized])

  // Start Firestore listeners on first upload
  const startFirestoreListening = useCallback(() => {
    if (syncManager.current && !syncManager.current.getStats().isListening) {
      console.log('🚀 Starting Firestore listening (triggered by first upload)')
      syncManager.current.startListening()
    }
  }, [])

  // Process a single file
  const processFile = useCallback(async (file: File): Promise<void> => {
    if (!batchManager.current) {
      throw new Error('Batch manager not initialized')
    }

    const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Create local preview URL for immediate display
    const localPreviewUrl = URL.createObjectURL(file)
    
    // Add file to batch with local preview
    const batchFile: BatchFile = {
      id: fileId,
      fileName: file.name,
      status: 'uploading',
      progress: 0,
      localPreviewUrl,
      file
    }
    batchManager.current.addFile(batchFile)

    try {
      // Get authentication token
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      // Update progress
      batchManager.current.updateFile(fileId, { status: 'uploading', progress: 20 })

      // Health check
      const healthCheck = await fetch(getApiUrl.health(), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${idToken}` }
      })

      if (!healthCheck.ok) {
        throw new Error(`Service unavailable: ${healthCheck.status}`)
      }

      // Upload file with client organization context
      const formData = new FormData()
      formData.append('file', file)
      
      // Add client organization context if available
      if (options.selectedClientOrganization) {
        const organizationContext = await clientOrganizationService.getProcessingContext(options.selectedClientOrganization.id!)
        formData.append('organization_context', organizationContext)
        formData.append('client_organization_id', options.selectedClientOrganization.id!)
        formData.append('client_organization_name', options.selectedClientOrganization.client_name)
        console.log('🏢 Including client organization context for:', options.selectedClientOrganization.client_name)
      }

      const uploadResponse = await fetch(getApiUrl.uploadInvoice(), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` },
        body: formData
      })

      if (!uploadResponse.ok) {
        let errorMessage = `Upload failed: ${uploadResponse.status}`
        let shouldRedirectToOnboarding = false
        
        try {
          const errorData = await uploadResponse.json()
          errorMessage = errorData.error || errorMessage
          
          // Check for workspace validation errors
          if (errorData.action === 'redirect_to_onboarding') {
            shouldRedirectToOnboarding = true
            errorMessage = errorData.message || 'Please complete workspace setup'
          }
        } catch {
          if (uploadResponse.status === 502) {
            errorMessage = 'Service unavailable (502)'
          } else if (uploadResponse.status === 503) {
            errorMessage = 'Service temporarily unavailable (503)'
          } else if (uploadResponse.status === 403) {
            errorMessage = 'Access denied - please check your workspace setup'
            shouldRedirectToOnboarding = true
          }
        }
        
        // Handle workspace setup redirection
        if (shouldRedirectToOnboarding) {
          toast.error(errorMessage + ' - Redirecting to setup...')
          setTimeout(() => {
            window.location.href = '/onboarding'
          }, 2000)
          return
        }
        
        throw new Error(errorMessage)
      }

      const uploadResult = await uploadResponse.json()
      const jobId = uploadResult.job_id

      console.log('🎯 Upload successful:', { jobId, fileName: file.name })

      // Update session activity for successful upload
      sessionSecurityService.updateActivity()

      // Update file with job ID and set to processing
      batchManager.current.updateFile(fileId, {
        jobId,
        status: 'processing',
        progress: 50
      })

      // Start Firestore listening on first upload
      startFirestoreListening()

      toast.success(`Uploaded: ${file.name}`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      
      batchManager.current.updateFile(fileId, {
        status: 'error',
        progress: 0,
        error: errorMessage
      })

      toast.error(`Upload failed: ${errorMessage}`)
      throw error
    }
  }, [startFirestoreListening])

  // Upload multiple files
  const uploadFiles = useCallback(async (files: FileList): Promise<void> => {
    const fileArray = Array.from(files)
    
    // Validate files
    const validFiles = fileArray.filter(file => {
      if (file.type.includes('image') || file.type === 'application/pdf') {
        return true
      } else {
        toast.error(`Unsupported file type: ${file.name}`)
        return false
      }
    })

    if (validFiles.length === 0) {
      toast.error('No valid files to upload')
      return
    }

    // Process files sequentially to avoid overwhelming the service
    for (const file of validFiles) {
      try {
        await processFile(file)
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error)
        // Continue with other files even if one fails
      }
    }

    toast.success(`Started processing ${validFiles.length} files`)
  }, [processFile])

  // Remove file from batch
  const removeFile = useCallback((fileId: string) => {
    if (batchManager.current) {
      batchManager.current.removeFile(fileId)
      toast.success('File removed from batch')
    }
  }, [])

  // Update journal entry with change tracking
  const updateJournalEntry = useCallback(async (entryId: string, field: string, value: any) => {
    if (!syncManager.current) return

    try {
      // Update session activity for table edit
      sessionSecurityService.updateActivity()
      
      // Find the current entry to get original value
      const currentEntry = journalEntries.find(entry => entry.id === entryId)
      if (!currentEntry) {
        console.error('Entry not found for change tracking:', entryId)
        return
      }

      const originalValue = (currentEntry as any)[field]
      
      // Only track if value actually changed
      if (originalValue !== value) {
        console.log('📝 Tracking journal entry change:', {
          entryId,
          field,
          originalValue,
          newValue: value
        })

        // Track the change
        await changeTrackingService.trackChange(
          currentEntry.invoiceId,
          `journal_entries.${entryId}.${field}`,
          field,
          originalValue,
          value,
          'edit',
          {
            rowId: entryId,
            columnName: field,
            tableType: 'journal_entries'
          }
        )

        toast.success(`${field} updated and change tracked`)
      }
      
      // Update the entry in sync manager
      syncManager.current.updateJournalEntry(entryId, field, value)
      
    } catch (error) {
      console.error('Error updating journal entry with change tracking:', error)
      toast.error('Failed to update entry')
    }
  }, [journalEntries])

  // Download CSV
  const downloadCSV = useCallback(async () => {
    if (journalEntries.length === 0) {
      toast.error('No journal entries to download')
      return
    }

    try {
      console.log('📥 Starting CSV download...')
      
      // Archive completed results BEFORE download (critical for cleanup)
      try {
        console.log('📦 Archiving completed results before download...')
        const result = await archiveService.archiveCompletedResultsHybrid()
        if (result.archived_count > 0) {
          console.log(`✅ Archived ${result.archived_count} completed results before download`)
          toast.success(`📦 Archived ${result.archived_count} results before download`)
        }
      } catch (archiveError) {
        console.error('❌ Archive before download failed:', archiveError)
        // Continue with download even if archive fails, but warn user
        toast.error('Archive before download failed, but proceeding with download')
      }

      // Update session activity for CSV download
      sessionSecurityService.updateActivity()

      // Create CSV content
      const headers = [
        'Date', 'Account Name', 'Account Code', 'Description',
        'Debit Amount', 'Credit Amount', 'Reference', 'Vendor',
        'HSN Code', 'Item Description', 'Quantity', 'Unit Price', 'Balanced'
      ]

      const csvContent = [
        headers.join(','),
        ...journalEntries.map(entry => [
          entry.date,
          `"${entry.accountName}"`,
          entry.accountCode,
          `"${entry.description}"`,
          entry.debitAmount,
          entry.creditAmount,
          `"${entry.reference}"`,
          `"${entry.vendor || ''}"`,
          `"${entry.hsnCode || ''}"`,
          `"${entry.itemDescription || ''}"`,
          entry.quantity || '',
          entry.unitPrice || '',
          entry.isBalanced ? 'Balanced' : 'Unbalanced'
        ].join(','))
      ].join('\n')

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      
      link.setAttribute('href', url)
      link.setAttribute('download', `journal_entries_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success(`📥 Downloaded ${journalEntries.length} journal entries`)
      
      // Clear all data after successful download
      console.log('🧹 Clearing all data after CSV download')
      clearAll()
      
    } catch (error) {
      console.error('❌ Download failed:', error)
      toast.error('Failed to download CSV')
    }
  }, [journalEntries])

  // Mark all as displayed
  // Archive completed results
  const archiveCompletedResults = useCallback(async () => {
    try {      // Update session activity for archive operation
      sessionSecurityService.updateActivity()
            const result = await archiveService.archiveCompletedResultsHybrid()
      
      if (result.archived_count > 0) {
        toast.success(`📦 Archived ${result.archived_count} completed results`)
        // Clear recovery state since we just archived
        sessionRecoveryService.clearRecoveryState()
      } else {
        toast('No completed results to archive', { icon: '📭' })
      }
      
      return result
    } catch (error) {
      console.error('❌ Archive failed:', error)
      toast.error('Failed to archive completed results')
      throw error
    }
  }, [])

  // Clear all
  const clearAll = useCallback(() => {
    // Clean up local preview URLs to prevent memory leaks
    batchState.files.forEach(file => {
      if (file.localPreviewUrl) {
        URL.revokeObjectURL(file.localPreviewUrl)
      }
    })
    
    if (batchManager.current) {
      batchManager.current.clear()
    }
    if (syncManager.current) {
      syncManager.current.reset()
    }
    toast.success('Cleared all files and entries')
  }, [batchState.files])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up local preview URLs
      if (batchManager.current) {
        const files = batchManager.current.getFiles()
        files.forEach(file => {
          if (file.localPreviewUrl) {
            URL.revokeObjectURL(file.localPreviewUrl)
          }
        })
      }
      
      if (syncManager.current) {
        syncManager.current.stopListening()
      }
    }
  }, []) // Empty dependency array - only runs on unmount

  return {
    // State
    uploadedFiles: batchState.files,
    journalEntries,
    batchState,
    isInitialized,

    // Actions
    uploadFiles,
    removeFile,
    updateJournalEntry,
    downloadCSV,
    archiveCompletedResults,
    clearAll,

    // Computed state
    isBatchReadyForDownload: () => batchState.readyForDownload,
    getBatchStats: () => batchManager.current?.getStats() || { total: 0, completed: 0, processing: 0, errors: 0, completionRate: 0 },
    
    // Access to services for advanced functionality
    syncManager: syncManager.current
  }
}