// Re-export all types from specific type modules
export * from './auth'
export * from './api'
export * from './invoice'
export * from './upload'

// Additional types for components
export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  file: File
  status: 'pending' | 'processing' | 'completed' | 'error'
  uploadedAt: Date
  url?: string
  invoiceData?: SimplifiedInvoiceData
}

// Simplified version for Dashboard component
export interface SimplifiedInvoiceData {
  invoiceNumber?: string
  date?: string
  dueDate?: string
  totalAmount?: number
  taxAmount?: number
  currency?: string
  vendorName?: string
  vendorEmail?: string
  vendorAddress?: string
  confidence?: number
  processedAt?: Date
}

// Override the InvoiceData type for backward compatibility
export interface InvoiceData extends SimplifiedInvoiceData {
  id?: string
  fileName?: string
  uploadedAt?: Date
  processedAt?: Date
  status?: ProcessingStatus
  userEmail?: string
  extractedData?: ExtractedInvoiceData
  originalFileUrl?: string
  processingError?: string
}