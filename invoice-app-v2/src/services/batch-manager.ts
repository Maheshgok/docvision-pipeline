/**
 * Batch Processing Manager
 * Handles batch tracking logic and completion detection
 * Separates batch management from UI concerns
 */

export interface BatchFile {
  id: string
  jobId?: string
  fileName: string
  status: 'initializing' | 'uploading' | 'processing' | 'completed' | 'error' | 'displayed'
  progress: number
  error?: string
  localPreviewUrl?: string
  file?: File
}

export interface BatchState {
  files: BatchFile[]
  totalFiles: number
  completedFiles: number
  processingFiles: number
  errorFiles: number
  isComplete: boolean
  readyForDownload: boolean
}

export class BatchManager {
  private files: Map<string, BatchFile> = new Map()
  private listeners: Set<(state: BatchState) => void> = new Set()

  /**
   * Add a file to the batch
   */
  addFile(file: BatchFile): void {
    this.files.set(file.id, file)
    this.notifyListeners()
  }

  /**
   * Update file status in the batch
   */
  updateFile(fileId: string, updates: Partial<BatchFile>): void {
    const file = this.files.get(fileId)
    if (file) {
      this.files.set(fileId, { ...file, ...updates })
      this.notifyListeners()
    }
  }

  /**
   * Update file status by job ID (for Firestore updates)
   */
  updateFileByJobId(jobId: string, updates: Partial<BatchFile>): void {
    for (const [id, file] of this.files.entries()) {
      if (file.jobId === jobId) {
        this.files.set(id, { ...file, ...updates })
        this.notifyListeners()
        break
      }
    }
  }

  /**
   * Mark file as completed by job ID
   */
  markFileCompleted(jobId: string): void {
    this.updateFileByJobId(jobId, { 
      status: 'completed', 
      progress: 100 
    })
  }

  /**
   * Remove a file from the batch
   */
  removeFile(fileId: string): void {
    this.files.delete(fileId)
    this.notifyListeners()
  }

  /**
   * Clear all files
   */
  clear(): void {
    this.files.clear()
    this.notifyListeners()
  }

  /**
   * Get current batch state
   */
  getState(): BatchState {
    const filesArray = Array.from(this.files.values())
    
    const totalFiles = filesArray.length
    const completedFiles = filesArray.filter(f => f.status === 'completed' || f.status === 'displayed').length
    const processingFiles = filesArray.filter(f => f.status === 'uploading' || f.status === 'processing').length
    const errorFiles = filesArray.filter(f => f.status === 'error').length

    // Batch is complete when all files are either completed, displayed, or error
    const isComplete = totalFiles > 0 && processingFiles === 0

    // Ready for download when all files are processed AND at least one is completed
    const readyForDownload = isComplete && completedFiles > 0

    return {
      files: filesArray,
      totalFiles,
      completedFiles,
      processingFiles,
      errorFiles,
      isComplete,
      readyForDownload
    }
  }

  /**
   * Get files array
   */
  getFiles(): BatchFile[] {
    return Array.from(this.files.values())
  }

  /**
   * Check if batch has any files
   */
  hasFiles(): boolean {
    return this.files.size > 0
  }

  /**
   * Get file by ID
   */
  getFile(fileId: string): BatchFile | undefined {
    return this.files.get(fileId)
  }

  /**
   * Get file by job ID
   */
  getFileByJobId(jobId: string): BatchFile | undefined {
    for (const file of this.files.values()) {
      if (file.jobId === jobId) {
        return file
      }
    }
    return undefined
  }

  /**
   * Subscribe to batch state changes
   */
  subscribe(listener: (state: BatchState) => void): () => void {
    this.listeners.add(listener)
    
    // Immediately notify with current state
    listener(this.getState())
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const state = this.getState()
    this.listeners.forEach(listener => {
      try {
        listener(state)
      } catch (error) {
        console.error('Error in batch manager listener:', error)
      }
    })
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    total: number
    completed: number
    processing: number
    errors: number
    completionRate: number
  } {
    const state = this.getState()
    const completionRate = state.totalFiles > 0 ? (state.completedFiles / state.totalFiles) * 100 : 0

    return {
      total: state.totalFiles,
      completed: state.completedFiles,
      processing: state.processingFiles,
      errors: state.errorFiles,
      completionRate: Math.round(completionRate)
    }
  }

  /**
   * Validate batch for processing
   */
  validateForProcessing(): { valid: boolean; issues: string[] } {
    const issues: string[] = []
    
    if (this.files.size === 0) {
      issues.push('No files in batch')
    }
    
    const processingFiles = Array.from(this.files.values()).filter(f => 
      f.status === 'uploading' || f.status === 'processing'
    )
    
    if (processingFiles.length > 0) {
      issues.push(`${processingFiles.length} files still processing`)
    }

    return {
      valid: issues.length === 0,
      issues
    }
  }
}