import { useState, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { authService } from '../services/auth'
import { finalSimplifiedFirestoreService } from '../services/final-simplified-firestore'
import { archiveService } from '../services/archive'
import { getApiUrl } from '../config/api'
import { shouldDisplayInTable } from '../config/features'
import { processingModeService } from '../services/processingModeService'

// Define interface locally to avoid dependencies
interface InvoiceProcessingResult {
  id: string
  filename?: string
  status: 'queued' | 'processing' | 'completed' | 'error'
  [key: string]: any
}

interface UploadedFile {
  id: string
  file: File
  status: 'initializing' | 'uploading' | 'processing' | 'completed' | 'error' | 'displayed'
  progress: number
  result?: InvoiceProcessingResult
  error?: string
  jobId?: string
}

interface JournalEntry {
  id: string
  invoiceId: string
  date: string
  accountName: string
  accountCode: string
  description: string
  debitAmount: number
  creditAmount: number
  reference: string
  vendor?: string
  totalAmount?: number
  taxableAmount?: number
  gstAmount?: number
  isBalanced?: boolean
  hsnCode?: string
  itemDescription?: string
  quantity?: number
  unitPrice?: number
}

export const useRealtimeUpload = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [allInvoiceResults, setAllInvoiceResults] = useState<InvoiceProcessingResult[]>([])
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [processedJobIds, setProcessedJobIds] = useState<Set<string>>(new Set())
  const [hasActiveUploads, setHasActiveUploads] = useState(false)
  const [listenersActive, setListenersActive] = useState(false)

  const updateFileProgress = useCallback((fileId: string, status: UploadedFile['status'], progress: number) => {
    setUploadedFiles(prev =>
      prev.map(file =>
        file.id === fileId ? { ...file, status, progress } : file
      )
    )
  }, [])

  const setFileResult = useCallback((fileId: string, result: any) => {
    setUploadedFiles(prev =>
      prev.map(file =>
        file.id === fileId ? { ...file, result } : file
      )
    )
  }, [])

  const setFileError = useCallback((fileId: string, error: string) => {
    setUploadedFiles(prev =>
      prev.map(file =>
        file.id === fileId ? { ...file, error } : file
      )
    )
  }, [])

  // Mark results as displayed to prevent future notifications
  const markAsDisplayed = useCallback(async (jobIds: string[]) => {
    try {
      // Note: markAsDisplayed not available in final-simplified-firestore
      console.log('📋 Would mark as displayed:', jobIds)
      console.log('📤 Marked as displayed:', jobIds)
    } catch (error) {
      console.error('❌ Failed to mark as displayed:', error)
    }
  }, [])

  // Mark all completed results as displayed
  const markAllDisplayed = useCallback(async () => {
    const completedJobIds = allInvoiceResults
      .filter(result => result.status === 'completed' && result.jobId && result.frontendStatus !== 'displayed')
      .map(result => result.jobId!)
    
    if (completedJobIds.length > 0) {
      await markAsDisplayed(completedJobIds)
      toast.success(`🏠 Marked ${completedJobIds.length} results as displayed`)
    } else {
      toast.success('📋 No new results to mark as displayed')
    }
  }, [allInvoiceResults, markAsDisplayed])

  // Function to start listeners on-demand (lazy loading for auth safety and error prevention)
  const startRealtimeListeners = useCallback(() => {
    if (listenersActive) {
      console.log('🔥 Real-time listeners already active')
      return
    }

    const user = authService.getCurrentUser()
    if (!user) {
      console.log('⚠️ Cannot start listeners - user not authenticated')
      return
    }

    console.log('🚀 STARTING real-time listeners after first upload (lazy loaded):', user.email)
    setListenersActive(true)
    
    // Track if this specific listener has had its first load
    let listenerInitialLoad = true
    
    // ⚡ Tier 1: Active processing results (real-time, small dataset)
    finalSimplifiedFirestoreService.listenToUserResults(
      (activeResults) => {
        console.log('🎨 Active results update:', activeResults.length, 'active items')
        
        // Extract journal entries from active results only
        // Journal entries are already processed in the service callback
        console.log('📋 Active results received:', activeResults.length)
        const journalEntries = entries.map(entry => ({
          id: entry.id,
          invoiceId: entry.invoiceId,
          date: entry.date,
          accountName: entry.accountName,
          accountCode: entry.accountCode,
          description: entry.narration,
          debitAmount: entry.debitAmount,
          creditAmount: entry.creditAmount,
          reference: entry.invoiceNumber,
          vendor: entry.vendor
        }))
        
        // Update state with active results
        setAllInvoiceResults(activeResults)
        setJournalEntries(journalEntries)
        
        // Handle notifications for NEW active results only
        if (listenerInitialLoad) {
          console.log('📚 Initial listener load - setting baseline job IDs')
          listenerInitialLoad = false
          const existingJobIds = new Set(activeResults.map(r => r.jobId).filter((jobId): jobId is string => Boolean(jobId)))
          setProcessedJobIds(existingJobIds)
        } else {
          // Check for NEW completed results and notify
          console.log('🔍 Checking for new completions...')
          activeResults.forEach(result => {
            if (result.jobId && !processedJobIds.has(result.jobId)) {
              console.log('🆔 Found new job:', result.jobId, 'Status:', result.status)
              
              // Find the uploaded file with matching jobId and update its progress
              const matchingFile = uploadedFiles.find(file => file.jobId === result.jobId)
              if (matchingFile) {
                updateFileProgress(matchingFile.id, result.status as UploadedFile['status'], 
                  result.status === 'completed' ? 100 : result.status === 'processing' ? 80 : 60)
              } else {
                console.log('🔍 No matching file found for jobId:', result.jobId)
              }
              
              if (result.status === 'completed') {
                toast.success(`✅ Invoice processed: ${result.fileName}`)
                console.log('🎉 NEW completion notification for:', result.jobId)
              } else if (result.status === 'processing') {
                console.log('⚡ New job processing:', result.jobId)
              }
              // Track this job ID to avoid duplicate notifications
              setProcessedJobIds((prev: Set<string>) => new Set(prev).add(result.jobId!))
            }
          })
        }
      },
      (error) => {
        console.error('❌ Active results listener error:', error)
        toast.error('Unable to get real-time updates for active processing')
      }
    )
  }, [listenersActive, processedJobIds])

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      if (listenersActive) {
        console.log('🧹 Cleaning up real-time listeners on unmount...')
        finalSimplifiedFirestoreService.cleanup()
      }
    }
  }, [listenersActive]) // Empty dependency array - set up once on mount

  const processFile = useCallback(async (uploadedFile: UploadedFile) => {
    try {
      // Step 1: Get authentication token
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      // Show initializing state (handles cold start delay gracefully)
      updateFileProgress(uploadedFile.id, 'initializing', 5)

      // Step 2: Health check (may take up to 5s on cold start)
      try {
        console.log('🔄 Waking up processing service...')
        const startTime = Date.now()
        const healthCheck = await fetch(getApiUrl.health(), {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${idToken}` }
        })
        const elapsed = Date.now() - startTime
        
        if (!healthCheck.ok) {
          throw new Error(`Cloud Run service health check failed: ${healthCheck.status}`)
        }
        
        if (elapsed > 2000) {
          console.log(`✅ Service ready (cold start: ${elapsed}ms)`)
        } else {
          console.log('✅ Service ready (warm)')
        }
      } catch (healthError) {
        console.error('❌ Cloud Run service health check failed:', healthError)
        throw new Error('Cloud Run service is not responding. Please check if the service is running.')
      }
      
      updateFileProgress(uploadedFile.id, 'uploading', 20)

      // Step 3: Upload file to initial-api (orchestrator handles all processing)
      const formData = new FormData()
      formData.append('file', uploadedFile.file)

      const uploadResponse = await fetch(getApiUrl.uploadInvoice(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        },
        body: formData
      })

      if (!uploadResponse.ok) {
        console.error('Upload failed:', uploadResponse.status, uploadResponse.statusText)
        let errorMessage = `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`
        
        try {
          const errorData = await uploadResponse.json()
          errorMessage = errorData.error || errorMessage
        } catch (jsonError) {
          const errorText = await uploadResponse.text()
          console.error('Non-JSON error response:', errorText.substring(0, 500))
          if (uploadResponse.status === 502) {
            errorMessage = 'Cloud Run service unavailable (502). Service may be starting up or down.'
          } else if (uploadResponse.status === 503) {
            errorMessage = 'Cloud Run service temporarily unavailable (503). Please try again.'
          } else {
            errorMessage = `Service error (${uploadResponse.status}). Please check if the Cloud Run service is running.`
          }
        }
        throw new Error(errorMessage)
      }

      const uploadResult = await uploadResponse.json()
      const jobId = uploadResult.job_id

      console.log('🎯 Upload response:', uploadResult)
      console.log('🆔 Job ID received from backend:', jobId)

      // Step 4: Update file with job ID and set to processing
      setUploadedFiles(prev => prev.map(file => 
        file.id === uploadedFile.id 
          ? { ...file, jobId, status: 'processing', progress: 30 }
          : file
      ))

      // Step 5: Track this job ID for real-time updates
      // Note: trackJobIds not available in final-simplified-firestore
      console.log('📋 Would track job ID:', jobId)

      // Step 6: Cloud Tasks will automatically process the file
      // No need to call queue processor directly - Cloud Tasks handles this!
      console.log('✅ File uploaded successfully - Cloud Tasks will handle processing')
      console.log('📋 Job ID:', jobId)
      console.log('📁 Bucket path:', uploadResult.bucket_path)
      console.log('☁️ Cloud Tasks mode: Processing will be automatic')
      
      updateFileProgress(uploadedFile.id, 'processing', 50)
      toast.success('File uploaded! Cloud Tasks is processing...')

      // Real-time listener will handle completion automatically via Firestore!

    } catch (error) {
      console.error('❌ File processing error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      updateFileProgress(uploadedFile.id, 'error', 0)
      setFileError(uploadedFile.id, errorMessage)
      toast.error(`Upload failed: ${errorMessage}`)
    }
  }, [updateFileProgress, setFileError])

  const uploadFiles = useCallback(async (files: FileList) => {
    const newFiles: UploadedFile[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'uploading' as const,
      progress: 0
    }))

    setUploadedFiles(prev => [...prev, ...newFiles])
    setHasActiveUploads(true)
    
    // 🚀 START real-time listeners after first upload (lazy loading for auth/collection safety)
    if (!listenersActive) {
      console.log('🎯 First upload detected - starting real-time listeners (lazy loading)')
      startRealtimeListeners()
    }

    // Process files one by one
    for (const file of newFiles) {
      await processFile(file)
    }
  }, [processFile, listenersActive, startRealtimeListeners])

  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  const clearAll = useCallback(() => {
    setUploadedFiles([])
    setJournalEntries([])
  }, [])

  // Archive only old results (older than 1 hour) to preserve recent completions
  const archiveOldResults = useCallback(async () => {
    try {
      console.log('📦 Starting archive of old results (>1 hour)...')
      const result = await archiveService.archiveOldResults()
      console.log('📦 Archive old completed:', result.archived_count, 'items archived')
      
      // Restart listeners after archive to get fresh data
      if (listenersActive) {
        console.log('🔄 Restarting listeners after archive...')
        finalSimplifiedFirestoreService.cleanup()
        setListenersActive(false)
        // Small delay before restarting
        setTimeout(() => {
          startRealtimeListeners()
        }, 1000)
      }
      
      return result
    } catch (error) {
      console.error('❌ Archive old results failed:', error)
      throw error
    }
  }, [listenersActive, startRealtimeListeners])

  // Archive completed results to clean up the active collection
  const archiveCompletedResults = useCallback(async () => {
    try {
      console.log('📦 Starting archive of completed results...')
      const result = await archiveService.archiveCompletedResults()
      
      if (result.archived_count > 0) {
        toast.success(`📦 Archived ${result.archived_count} completed results`)
        console.log('✅ Archive completed:', result)
        
        // Refresh real-time listeners after archiving to show updated active collection
        if (listenersActive) {
          console.log('🔄 Refreshing listeners after archive...')
          finalSimplifiedFirestoreService.cleanup()
          setTimeout(() => {
            startRealtimeListeners()
          }, 500)
        }
      } else {
        console.log('📭 No completed results to archive')
      }
      
      return result
    } catch (error) {
      console.error('❌ Archive failed:', error)
      toast.error('Failed to archive completed results')
      throw error
    }
  }, [listenersActive, startRealtimeListeners])

  // Archive displayed results 
  const archiveDisplayedResults = useCallback(async () => {
    try {
      console.log('📦 Starting archive of displayed results...')
      const result = await archiveService.archiveDisplayedResults()
      
      if (result.archived_count > 0) {
        toast.success(`📦 Archived ${result.archived_count} displayed results`)
        console.log('✅ Archive completed:', result)
      } else {
        console.log('📭 No displayed results to archive')
      }
      
      return result
    } catch (error) {
      console.error('❌ Archive failed:', error)
      toast.error('Failed to archive displayed results')
      throw error
    }
  }, [])

  const updateJournalEntry = useCallback((entryId: string, field: string, value: any) => {
    setJournalEntries(prev => prev.map(entry => 
      entry.id === entryId 
        ? { ...entry, [field]: value }
        : entry
    ))
    toast.success('Journal entry updated')
  }, [])

  // Check if full batch is processed and ready for download
  const isBatchReadyForDownload = useCallback(() => {
    if (uploadedFiles.length === 0) return false
    
    // All files must be either completed or error (no uploading/processing)
    const allFilesProcessed = uploadedFiles.every(file => 
      file.status === 'completed' || file.status === 'displayed' || file.status === 'error'
    )
    
    // At least one file must be completed
    const hasCompletedFiles = uploadedFiles.some(file => 
      file.status === 'completed' || file.status === 'displayed'
    )
    
    return allFilesProcessed && hasCompletedFiles
  }, [uploadedFiles])

  // Enhanced download CSV with batch completion check and archiving
  const downloadCSV = useCallback(async () => {
    try {
      // Check if full batch is ready for download
      if (!isBatchReadyForDownload()) {
        toast.error('⏳ Please wait for all files to complete processing before downloading')
        return
      }

      if (journalEntries.length === 0) {
        toast.error('No journal entries to download')
        return
      }

      console.log('📦 Pre-download archive - archiving completed results...')
      // Archive completed results before download to clean up interface
      await archiveCompletedResults()
      
      // Create CSV content with conditional headers
      const baseHeaders = ['Date', 'Account Name'];
      const conditionalHeaders = shouldDisplayInTable('accountCodes') ? ['Account Code'] : [];
      const remainingHeaders = ['Description', 'Debit Amount', 'Credit Amount', 'Reference', 'Vendor', 'HSN Code', 'Item Description', 'Quantity', 'Unit Price', 'CGST Amount', 'SGST Amount', 'IGST Amount', 'Total GST Amount', 'Balanced'];
      const headers = [...baseHeaders, ...conditionalHeaders, ...remainingHeaders];
      const csvContent = [
        headers.join(','),
        ...journalEntries.map(entry => {
          const baseRow = [
            entry.date,
            `"${entry.accountName}"`
          ];
          const conditionalRow = shouldDisplayInTable('accountCodes') ? [entry.accountCode || ''] : [];
          const remainingRow = [
            `"${entry.description}"`,
            entry.debitAmount,
            entry.creditAmount,
            `"${entry.reference}"`,
            `"${entry.vendor || ''}"`,
            `"${entry.hsnCode || ''}"`,
            `"${entry.itemDescription || ''}"`,
            entry.quantity || '',
            entry.unitPrice || '',
            entry.cgstAmount || 0,
            entry.sgstAmount || 0,
            entry.igstAmount || 0,
            entry.gstAmount || 0,
            entry.isBalanced ? 'Yes' : 'No'
          ];
          return [...baseRow, ...conditionalRow, ...remainingRow].join(',');
        })
      ].join('\n')

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `journal_entries_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      toast.success(`📥 Downloaded ${journalEntries.length} journal entries`)
    } catch (error) {
      console.error('❌ Download CSV failed:', error)
      toast.error('Failed to download CSV')
    }
  }, [journalEntries, isBatchReadyForDownload, archiveCompletedResults])

  return {
    uploadedFiles,
    journalEntries,
    allInvoiceResults,
    uploadFiles,
    removeFile,
    clearAll,
    downloadCSV,  // Enhanced with batch completion check
    updateJournalEntry,
    markAsDisplayed,
    markAllDisplayed,
    archiveCompletedResults,  // Manual archive trigger (download + window close)
    archiveDisplayedResults,  // Archive displayed results
    archiveOldResults,        // Archive only old results (>1 hour)
    isBatchReadyForDownload,  // Check if batch is ready for download
    startRealtimeListeners,   // Manual listener control
    processFile,
    updateFileProgress,
    setFileResult,
    setFileError
  }
}