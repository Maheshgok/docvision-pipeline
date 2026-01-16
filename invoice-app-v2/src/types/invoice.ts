// New GST-structured invoice data types to match the updated prompt
export interface InvoiceData {
  id: string
  fileName: string
  uploadedAt: Date
  processedAt?: Date
  status: ProcessingStatus
  userEmail: string
  extractedData?: NewExtractedInvoiceData
  confidence?: number
  originalFileUrl?: string
  processingError?: string
}

export interface NewExtractedInvoiceData {
  document_type: string
  visibility_confidence: string
  vendor_details: VendorDetails
  buyer_details: BuyerDetails
  invoice_details: InvoiceDetails
  currency: string
  items: InvoiceItem[]
  tax_summary: TaxSummary
  bank_details: BankDetails
  compliance_flags: ComplianceFlags
  extracted_table: any[][]
  raw_text_reference: string
}

export interface VendorDetails {
  name: string
  gstin: string
  pan: string
  contact_number: string
  email: string
  address: string
}

export interface BuyerDetails {
  name: string
  gstin: string
  address: string
  place_of_supply: string
}

export interface InvoiceDetails {
  invoice_number: string
  invoice_date: string
  due_date: string
  po_number: string
  challan_number: string
  reverse_charge: string
  transport_details: string
  terms_and_conditions: string
}

export interface InvoiceItem {
  serial_no: string
  description: string
  detailed_narration: string
  hsn_code: string
  quantity: number
  unit: string
  unit_price: number
  discount: number
  taxable_value: number
  gst_rate: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  line_total: number
}

export interface TaxSummary {
  taxable_value: number
  cgst_total: number
  sgst_total: number
  igst_total: number
  total_gst: number
  round_off: number
  grand_total: number
}

export interface BankDetails {
  account_number: string
  ifsc: string
  bank_name: string
  upi_id: string
}

export interface ComplianceFlags {
  gst_invoice_compliant: string
  mandatory_fields_missing: string[]
  gst_applicable: string
  tds_applicable: string
}

// Legacy interface for backward compatibility
export interface ExtractedInvoiceData {
  vendorName: string
  vendorGSTIN?: string
  vendorAddress?: string
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string
  totalAmount: number
  taxAmount: number
  subtotal: number
  currency: string
  placeOfSupply?: string
  lineItems: InvoiceLineItem[]
  taxBreakdown?: TaxBreakdown[]
  paymentTerms?: string
  purchaseOrder?: string
}

export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  taxRate?: number
  hsnCode?: string
  unit?: string
}

export interface TaxBreakdown {
  taxType: 'CGST' | 'SGST' | 'IGST' | 'CESS' | 'OTHER'
  rate: number
  amount: number
  taxableAmount: number
}

export type ProcessingStatus = 
  | 'uploading'
  | 'processing' 
  | 'completed'
  | 'failed'
  | 'pending'

export interface InvoiceValidationError {
  field: keyof ExtractedInvoiceData | string
  message: string
  severity: 'error' | 'warning'
}

export interface InvoicePreview {
  id: string
  file: File
  previewUrl: string
  type: 'image' | 'pdf'
  pageCount?: number
  currentPage?: number
}

export interface InvoiceFilter {
  status?: ProcessingStatus[]
  dateRange?: {
    start: Date
    end: Date
  }
  search?: string
  vendorName?: string
  amountRange?: {
    min: number
    max: number
  }
}