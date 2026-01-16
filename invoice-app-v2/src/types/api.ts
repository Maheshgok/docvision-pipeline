export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface ApiError {
  code: string
  message: string
  details?: any
  statusCode: number
}

export interface JobStatusResponse {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  result?: any
  error?: string
  createdAt: string
  updatedAt: string
}

export interface UploadResponse {
  jobId: string
  fileName: string
  uploadUrl?: string
  message: string
}

export interface ProcessingResult {
  jobId: string
  invoiceData: any
  confidence: number
  processingTime: number
  extractedFields: string[]
}

// API Endpoints
export const API_ENDPOINTS = {
  UPLOAD: '/upload_invoice',
  JOB_STATUS: '/job_status',
  INVOICES: '/invoices',
  AUTH: '/auth',
  USER: '/user',
} as const

// HTTP Methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

// Request configuration
export interface RequestConfig {
  method: HttpMethod
  headers?: Record<string, string>
  body?: any
  timeout?: number
  retries?: number
}