export interface UploadFile {
  id: string
  file: File
  progress: number
  status: UploadStatus
  error?: string
  jobId?: string
  previewUrl?: string
  uploadedAt: Date
}

export type UploadStatus = 
  | 'pending'
  | 'uploading' 
  | 'processing'
  | 'completed'
  | 'failed'

export interface UploadProgress {
  totalFiles: number
  uploadedFiles: number
  completedFiles: number
  failedFiles: number
  currentFile?: string
  percentage: number
}

export interface BatchUploadResult {
  successful: UploadFile[]
  failed: UploadFile[]
  totalProcessed: number
}

export interface FileValidation {
  isValid: boolean
  errors: string[]
  maxSize: number
  allowedTypes: string[]
}

export interface UploadConfig {
  maxFileSize: number // in bytes
  maxFiles: number
  allowedTypes: string[]
  enablePreview: boolean
  autoProcess: boolean
}

export interface DropzoneState {
  isDragActive: boolean
  isDragAccept: boolean
  isDragReject: boolean
  files: File[]
}