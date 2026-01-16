/**
 * Firestore Sync Manager
 * Handles synchronization between Firestore updates and local batch state
 * Separates Firestore logic from batch management
 */
import { finalSimplifiedFirestoreService } from './final-simplified-firestore'
import { BatchManager } from './batch-manager'

export interface JournalEntry {
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
  cgstAmount?: number
  sgstAmount?: number
  igstAmount?: number
  isBalanced?: boolean
  hsnCode?: string
  itemDescription?: string
  quantity?: number
  unitPrice?: number
}

export class FirestoreSyncManager {
  private batchManager: BatchManager
  private journalEntries: JournalEntry[] = []
  private allResults: InvoiceProcessingResult[] = []
  private listeners: Set<(entries: JournalEntry[]) => void> = new Set()
  private resultListeners: Set<(results: InvoiceProcessingResult[]) => void> = new Set()
  private isListening = false
  private processedJobIds = new Set<string>()

  constructor(batchManager: BatchManager) {
    this.batchManager = batchManager
  }

  /**
   * Start listening to Firestore updates
   */
  startListening(): void {
    if (this.isListening) {
      console.log('🔥 Firestore sync already listening')
      return
    }

    console.log('🚀 Starting Firestore sync manager')
    this.isListening = true

    // USE FINAL SIMPLIFIED SERVICE - uses existing perfect journal entries
    finalSimplifiedFirestoreService.listenToUserResults(
      (entries) => this.handleDirectJournalEntries(entries),
      (error) => this.handleFirestoreError(error)
    )
  }

  /**
   * Stop listening to Firestore updates
   */
  stopListening(): void {
    if (!this.isListening) {
      return
    }

    console.log('🛑 Stopping Firestore sync manager')
    this.isListening = false
    finalSimplifiedFirestoreService.cleanup()
  }

  /**
   * SIMPLIFIED: Handle journal entries directly from simplified service
   */
  private handleDirectJournalEntries(entries: JournalEntry[]): void {
    console.log('🔥 SIMPLIFIED: Received', entries.length, 'direct journal entries')
    
    this.journalEntries = entries
    
    // Notify all journal entry listeners
    this.listeners.forEach(listener => {
      try {
        listener([...this.journalEntries])
      } catch (error) {
        console.error('❌ Error in journal entry listener:', error)
      }
    })
    
    // Update batch state with completions
    const completedJobs = new Set<string>()
    entries.forEach(entry => {
      const jobId = entry.invoiceId
      if (jobId && !this.processedJobIds.has(jobId)) {
        completedJobs.add(jobId)
        this.processedJobIds.add(jobId)
        console.log('🎉 SIMPLIFIED: New completion detected:', jobId)
      }
    })
    
    // Update batch manager with completed jobs
    completedJobs.forEach(jobId => {
      this.batchManager.markFileCompleted(jobId)
    })
    
    console.log('📊 SIMPLIFIED: Journal entries updated, notified', this.listeners.size, 'listeners')
  }

  /**
   * Handle Firestore updates
   */
  private handleFirestoreUpdate(results: InvoiceProcessingResult[]): void {
    console.log('🔥 Firestore sync received update:', results.length, 'results')
    
    // Update all results
    this.allResults = results
    this.notifyResultListeners()

    // Process each result
    results.forEach(result => {
      if (result.jobId) {
        // Check if this is a new completion
        const isNewCompletion = !this.processedJobIds.has(result.jobId) && 
                               result.status === 'completed'

        // Update batch manager with Firestore data
        this.batchManager.updateFileByJobId(result.jobId, {
          status: result.status as any,
          progress: this.mapStatusToProgress(result.status),
          error: result.error
        })

        // Track processed job IDs
        this.processedJobIds.add(result.jobId)

        // Log new completions
        if (isNewCompletion) {
          console.log('🎉 New completion detected:', result.jobId, result.fileName)
        }
      }
    })

    // Extract and update journal entries
    this.updateJournalEntries(results)
  }

  /**
   * Handle Firestore errors
   */
  private handleFirestoreError(error: Error): void {
    console.error('❌ Firestore sync error:', error)
    // Could emit error events here if needed
  }

  /**
   * Map Firestore status to progress percentage
   */
  private mapStatusToProgress(status: string): number {
    switch (status) {
      case 'queued': return 10
      case 'processing': return 50
      case 'completed': return 100
      case 'error': return 0
      default: return 0
    }
  }

  /**
   * Update journal entries from Firestore results
   */
  private updateJournalEntries(results: InvoiceProcessingResult[]): void {
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 SYNC MANAGER: updateJournalEntries called with', results.length, 'results')
    }
    const entries = realtimeFirestoreService.extractJournalEntriesFromResults(results)
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 SYNC MANAGER: Extracted', entries.length, 'raw entries from firestore service')
    }
    
    this.journalEntries = entries.map(entry => ({
      id: entry.id,
      invoiceId: entry.invoiceId,
      date: entry.date,
      accountName: entry.accountName,
      accountCode: entry.accountCode,
      description: entry.narration,
      debitAmount: entry.debitAmount,
      creditAmount: entry.creditAmount,
      reference: entry.invoiceNumber,
      vendor: entry.vendor,
      // Enhanced fields from new GST structure
      totalAmount: this.getTotalAmountFromResult(entry.invoiceId, results),
      taxableAmount: this.getTaxableAmountFromResult(entry.invoiceId, results),
      gstAmount: this.getGstAmountFromResult(entry.invoiceId, results),
      isBalanced: entry.isBalanced
    }))

    if (process.env.NODE_ENV === 'development' && this.journalEntries.length > 0) {
      console.log('📊 SYNC MANAGER: Mapped to', this.journalEntries.length, 'journal entries')
      console.log('📊 SYNC MANAGER: Sample entry:', this.journalEntries[0])
    }
    this.notifyJournalListeners()
  }

  /**
   * Get current journal entries
   */
  getJournalEntries(): JournalEntry[] {
    return [...this.journalEntries]
  }

  /**
   * Get all results
   */
  getAllResults(): InvoiceProcessingResult[] {
    return [...this.allResults]
  }

  /**
   * Update a journal entry
   */
  updateJournalEntry(entryId: string, field: string, value: any): void {
    this.journalEntries = this.journalEntries.map(entry =>
      entry.id === entryId ? { ...entry, [field]: value } : entry
    )
    this.notifyJournalListeners()
  }

  /**
   * Subscribe to journal entry updates
   */
  subscribeToJournalEntries(listener: (entries: JournalEntry[]) => void): () => void {
    console.log('🔄 SYNC MANAGER: New journal listener subscribed')
    this.listeners.add(listener)
    
    // Immediately notify with current entries
    console.log('🔄 SYNC MANAGER: Immediately notifying new listener with', this.journalEntries.length, 'entries')
    listener(this.journalEntries)
    
    return () => {
      console.log('🔄 SYNC MANAGER: Journal listener unsubscribed')
      this.listeners.delete(listener)
    }
  }

  /**
   * Subscribe to all results updates
   */
  subscribeToResults(listener: (results: InvoiceProcessingResult[]) => void): () => void {
    this.resultListeners.add(listener)
    
    // Immediately notify with current results
    listener(this.allResults)
    
    return () => {
      this.resultListeners.delete(listener)
    }
  }

  /**
   * Notify journal listeners
   */
  private notifyJournalListeners(): void {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔔 SYNC MANAGER: Notifying', this.listeners.size, 'journal listeners with', this.journalEntries.length, 'entries')
    }
    this.listeners.forEach((listener, index) => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔔 SYNC MANAGER: Calling listener ${listener.toString().substring(0, 50)}...`)
        }
        listener(this.journalEntries)
      } catch (error) {
        console.error('Error in journal listener:', error)
      }
    })
  }

  /**
   * Notify result listeners
   */
  private notifyResultListeners(): void {
    this.resultListeners.forEach(listener => {
      try {
        listener(this.allResults)
      } catch (error) {
        console.error('Error in result listener:', error)
      }
    })
  }

  /**
   * Mark results as displayed
   */
  async markAsDisplayed(jobIds: string[]): Promise<void> {
    try {
      await realtimeFirestoreService.markAsDisplayed(jobIds)
      console.log('📤 Marked as displayed:', jobIds)
    } catch (error) {
      console.error('❌ Failed to mark as displayed:', error)
      throw error
    }
  }

  /**
   * Mark all completed results as displayed
   */
  async markAllDisplayed(): Promise<void> {
    const completedJobIds = this.allResults
      .filter(result => result.status === 'completed' && result.jobId && result.frontendStatus !== 'displayed')
      .map(result => result.jobId!)
    
    if (completedJobIds.length > 0) {
      await this.markAsDisplayed(completedJobIds)
    }
  }

  /**
   * Get sync statistics
   */
  getStats(): {
    isListening: boolean
    resultsCount: number
    journalEntriesCount: number
    processedJobIds: number
  } {
    return {
      isListening: this.isListening,
      resultsCount: this.allResults.length,
      journalEntriesCount: this.journalEntries.length,
      processedJobIds: this.processedJobIds.size
    }
  }

  /**
   * Reset sync state (useful for testing)
   */
  reset(): void {
    this.processedJobIds.clear()
    this.journalEntries = []
    this.allResults = []
    this.notifyJournalListeners()
    this.notifyResultListeners()
  }

  /**
   * Helper methods to extract amounts from new GST structure
   */
  private getTotalAmountFromResult(invoiceId: string, results: InvoiceProcessingResult[]): number {
    const result = results.find(r => r.id === invoiceId)
    return result?.extractedData?.tax_summary?.grand_total || 
           result?.extractedData?.total_amount || 0
  }

  private getTaxableAmountFromResult(invoiceId: string, results: InvoiceProcessingResult[]): number {
    const result = results.find(r => r.id === invoiceId)
    return result?.extractedData?.tax_summary?.taxable_value || 
           result?.extractedData?.taxable_amount || 0
  }

  private getGstAmountFromResult(invoiceId: string, results: InvoiceProcessingResult[]): number {
    const result = results.find(r => r.id === invoiceId)
    return result?.extractedData?.tax_summary?.total_gst || 
           result?.extractedData?.gst_amount || 0
  }
}