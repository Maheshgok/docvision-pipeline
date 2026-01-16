// API client for Core Invoice service operations

import { createCoreServiceClient } from '../../../services/shared/api-client'
import { SERVICE_URLS } from '../config/services'
import { authTokenManager } from './authTokenManager'

export interface UploadJob {
  jobId: string
  status: 'uploaded' | 'processing' | 'completed' | 'error'
  totalFiles: number
  uploadedFiles: {
    id: string
    fileName: string
    fileSize: number
    mimeType: string
  }[]
  nextStep?: string
}

export interface ProcessingResult {
  id: string
  jobId: string
  fileName: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  processingProgress?: number
  extractedData?: Record<string, any>
  error?: string
  createdAt: Date
  completedAt?: Date
}

export interface SignedUrlResponse {
  jobId: string
  signedUrl: string
  gcsPath: string
  expiresIn: number
}

class CoreInvoiceApiService {
  private client = createCoreServiceClient(SERVICE_URLS.core)

  constructor() {
    // Client will handle auth via the authTokenManager when making requests
  }

  // File Upload
  async uploadFiles(files: File[]): Promise<UploadJob> {
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    const response = await fetch(`${SERVICE_URLS.core}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await authTokenManager.getValidToken()}`
      },
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }

    const result = await response.json()
    return result.data
  }

  async getSignedUploadUrl(fileName: string, contentType: string): Promise<SignedUrlResponse> {
    const params = new URLSearchParams({
      fileName,
      contentType
    })
    
    const response = await this.client.get<{ data: SignedUrlResponse }>(`/api/upload/signed-url?${params}`)
    return response.data
  }

  async completeBatchUpload(jobId: string, files: {
    id?: string
    fileName: string
    fileSize?: number
    mimeType?: string
    gcsPath: string
  }[]): Promise<UploadJob> {
    const response = await this.client.post<{ data: UploadJob }>('/api/upload/batch', {
      jobId,
      files
    })
    return response.data
  }

  // Processing
  async startProcessing(jobId: string, options?: {
    priority?: 'low' | 'normal' | 'high'
    extractionPrompt?: string
  }): Promise<void> {
    await this.client.post(`/api/process/${jobId}`, options)
  }

  async getProcessingStatus(jobId: string): Promise<{
    jobId: string
    status: string
    progress: number
    results: ProcessingResult[]
  }> {
    const response = await this.client.get<{ data: any }>(`/api/process/${jobId}`)
    return response.data
  }

  // Results
  async getResults(jobId: string): Promise<ProcessingResult[]> {
    const response = await this.client.get<{ data: ProcessingResult[] }>(`/api/results/${jobId}`)
    return response.data
  }

  async getResultStream(jobId: string): Promise<EventSource> {
    const token = await authTokenManager.getValidToken()
    const eventSource = new EventSource(
      `${SERVICE_URLS.core}/api/results/${jobId}/stream?token=${token}`
    )
    return eventSource
  }

  async downloadResultsCSV(jobId: string): Promise<Blob> {
    const token = await authTokenManager.getValidToken()
    const response = await fetch(`${SERVICE_URLS.core}/api/results/${jobId}/csv`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`)
    }
    
    return response.blob()
  }

  // Archive
  async archiveJob(jobId: string): Promise<void> {
    await this.client.post('/api/archive', { jobId })
  }

  async archiveCompletedJobs(olderThanDays: number = 30): Promise<{
    archived: number
    totalSize: number
  }> {
    const response = await this.client.post<{ data: any }>('/api/archive/bulk', {
      olderThanDays
    })
    return response.data
  }

  // Health and Status
  async checkHealth(): Promise<{
    status: string
    service: string
    timestamp: string
    version: string
  }> {
    const response = await this.client.get<any>('/health')
    return response
  }

  async getQuotaUsage(): Promise<{
    used: number
    limit: number
    resetDate: Date
  }> {
    const response = await this.client.get<{ data: any }>('/api/quota')
    return response.data
  }
}

export const coreInvoiceApiService = new CoreInvoiceApiService()