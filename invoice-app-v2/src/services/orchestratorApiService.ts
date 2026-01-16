/**
 * Orchestrator API Service - Modern Invoice Processing Pipeline
 * Handles tenant-isolated, job-driven invoice processing with real-time progress tracking
 */

import { auth } from '../config/firebase';
import { getServiceUrl, processInvoiceWorkflow } from '../config/services';
import { User } from 'firebase/auth';
import { toast } from 'react-hot-toast';

export interface JobStatus {
  job_id: string;
  tenant_id: string;
  status: 'CREATED' | 'EXTRACTING' | 'ENRICHING' | 'STANDARDIZING' | 'COMBINING' | 'COMPLETED' | 'FAILED';
  created_at: string;
  updated_at: string;
  progress: {
    percentage: number;
    current_phase: string;
    chunks?: {
      total: number;
      completed: number;
      failed: number;
    };
  };
  processing_stats?: {
    total_line_items?: number;
    processing_time_seconds?: number;
    openai_tokens_used?: number;
  };
}

export interface ProcessInvoiceRequest {
  gcs_input_path: string;
  original_filename: string;
  file_size_bytes: number;
}

export interface ProcessInvoiceResponse {
  job_id: string;
  tenant_id: string;
  status: string;
  extraction_triggered: boolean;
  next_phase: string;
  created_at: string;
}

export interface ExtractionResult {
  job_id: string;
  tenant_id: string;
  extraction_timestamp: string;
  source_document: string;
  header_data: {
    vendor_name: string;
    vendor_address: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    currency: string;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    payment_terms: string;
  };
  line_items: Array<{
    line_number: number;
    description: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
    tax_rate: number;
  }>;
  processing_stats: {
    total_line_items: number;
    processing_time_seconds: number;
    openai_tokens_used: number;
  };
}

export interface StandardizedResult {
  job_id: string;
  tenant_id: string;
  standardization_timestamp: string;
  standardized_line_items: Array<{
    line_number: number;
    description: string;
    quantity: number;
    unit: string;
    rate: number;
    amount: number;
    enrichment_data: {
      product_category: string;
      hsn_code: string;
      tax_category: string;
      account_code: string;
      business_classification: string;
      enrichment_confidence: number;
    };
    tax_calculations: {
      base_amount: number;
      tax_rate: number;
      tax_amount: number;
      total_with_tax: number;
      gst_breakdown: {
        cgst_rate: number;
        cgst_amount: number;
        sgst_rate: number;
        sgst_amount: number;
        igst_rate: number;
        igst_amount: number;
      };
    };
  }>;
  standardized_totals: {
    subtotal: number;
    total_tax: number;
    grand_total: number;
    gst_totals: {
      cgst_total: number;
      sgst_total: number;
      igst_total: number;
    };
    currency: string;
    total_line_items: number;
  };
  validation_results: {
    errors: string[];
    warnings: string[];
    validation_passed: boolean;
  };
}

class OrchestratorApiService {
  private readonly baseUrl: string;

  constructor() {
    // Use health endpoint to derive base URL since processInvoice no longer exists
    this.baseUrl = getServiceUrl.orchestrator.health().replace('/health', '');
  }

  /**
   * Get authentication headers for API requests
   */
  private async getAuthHeaders(user?: User): Promise<Record<string, string>> {
    const currentUser = user || auth.currentUser;
    
    if (!currentUser) {
      throw new Error('User not authenticated');
    }

    const token = await currentUser.getIdToken();
    const tenantId = await this.getTenantId(currentUser);
    
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': tenantId
    };
  }

  /**
   * Get tenant ID for current user (from custom claims or user metadata)
   */
  private async getTenantId(user: User): Promise<string> {
    try {
      const idTokenResult = await user.getIdTokenResult();
      
      // Try to get tenant ID from custom claims
      const tenantId = idTokenResult.claims.tenant_id || 
                       idTokenResult.claims.tenantId || 
                       user.uid; // Fallback to user ID as tenant
      
      return tenantId as string;
    } catch (error) {
      console.warn('⚠️ Could not get tenant ID from claims, using user UID:', error);
      return user.uid;
    }
  }

  /**
   * Handle API response and error cases
   */
  private async handleApiResponse<T>(response: Response, operation: string): Promise<T> {
    if (!response.ok) {
      let errorMessage = `${operation} failed`;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = `${operation} failed with status ${response.status}`;
      }
      
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Initiate invoice processing workflow
   * NOTE: This now calls initial-api for job creation, not orchestrator directly
   * The orchestrator only handles status updates after job is created
   */
  async processInvoice(request: ProcessInvoiceRequest): Promise<ProcessInvoiceResponse> {
    try {
      const headers = await this.getAuthHeaders();
      
      // Job creation should go through initial-api, not orchestrator
      // This is a legacy method - use initial-api/upload_invoice for new code
      console.warn('⚠️ processInvoice is deprecated - use initial-api upload instead');
      
      // For now, return a mock response to prevent crashes
      // Real processing happens via initial-api → Cloud Tasks
      return {
        job_id: `legacy_${Date.now()}`,
        status: 'DEPRECATED',
        message: 'Use initial-api/upload_invoice instead'
      } as ProcessInvoiceResponse;
      
    } catch (error) {
      console.error('❌ Process invoice error:', error);
      throw error;
    }
  }

  /**
   * Get job status with progress information
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(getServiceUrl.orchestrator.jobStatus(jobId), {
        method: 'GET',
        headers
      });

      const result = await this.handleApiResponse<{data: JobStatus}>(
        response, 
        'Job status retrieval'
      );

      return result.data;
      
    } catch (error) {
      console.error('❌ Get job status error:', error);
      throw error;
    }
  }

  /**
   * Get job progress (uses jobStatus endpoint - jobProgress was removed)
   */
  async getJobProgress(jobId: string): Promise<JobStatus['progress']> {
    try {
      // jobProgress endpoint no longer exists, use jobStatus instead
      const status = await this.getJobStatus(jobId);
      return status.progress;
      
    } catch (error) {
      console.error('❌ Get job progress error:', error);
      throw error;
    }
  }

  /**
   * Get extraction results for a job
   */
  async getExtractionResult(jobId: string): Promise<ExtractionResult> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(getServiceUrl.dataExtractor.extractionResult(jobId), {
        method: 'GET',
        headers
      });

      const result = await this.handleApiResponse<{data: ExtractionResult}>(
        response, 
        'Extraction result retrieval'
      );

      return result.data;
      
    } catch (error) {
      console.error('❌ Get extraction result error:', error);
      throw error;
    }
  }

  /**
   * Get standardized results for a job
   */
  async getStandardizedResult(jobId: string): Promise<StandardizedResult> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(getServiceUrl.fieldStandardizer.standardizedResult(jobId), {
        method: 'GET',
        headers
      });

      const result = await this.handleApiResponse<{data: StandardizedResult}>(
        response, 
        'Standardized result retrieval'
      );

      return result.data;
      
    } catch (error) {
      console.error('❌ Get standardized result error:', error);
      throw error;
    }
  }

  /**
   * Get chunk processing status for a job
   */
  async getChunkStatus(jobId: string): Promise<any> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(getServiceUrl.chunkDispatcher.jobChunks(jobId), {
        method: 'GET',
        headers
      });

      const result = await this.handleApiResponse<{data: any}>(
        response, 
        'Chunk status retrieval'
      );

      return result.data;
      
    } catch (error) {
      console.error('❌ Get chunk status error:', error);
      throw error;
    }
  }

  /**
   * Monitor job progress with real-time updates
   * Returns a promise that resolves when job is complete
   */
  async monitorJobProgress(
    jobId: string, 
    onProgress?: (progress: JobStatus['progress']) => void,
    onStatusChange?: (status: JobStatus) => void
  ): Promise<JobStatus> {
    return new Promise((resolve, reject) => {
      const pollInterval = 2000; // Poll every 2 seconds
      const maxPollingTime = 10 * 60 * 1000; // Max 10 minutes
      const startTime = Date.now();

      const poll = async () => {
        try {
          // Check if we've exceeded max polling time
          if (Date.now() - startTime > maxPollingTime) {
            reject(new Error('Job monitoring timeout after 10 minutes'));
            return;
          }

          const status = await this.getJobStatus(jobId);
          
          // Call callbacks if provided
          if (onProgress) {
            onProgress(status.progress);
          }
          if (onStatusChange) {
            onStatusChange(status);
          }

          // Check if job is complete
          if (status.status === 'COMPLETED') {
            resolve(status);
            return;
          }

          // Check if job failed
          if (status.status === 'FAILED' || status.status.includes('FAILED')) {
            reject(new Error(`Job failed with status: ${status.status}`));
            return;
          }

          // Continue polling
          setTimeout(poll, pollInterval);
          
        } catch (error) {
          reject(error);
        }
      };

      // Start polling
      poll();
    });
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<any> {
    try {
      const response = await fetch(getServiceUrl.orchestrator.health());
      return await response.json();
    } catch (error) {
      console.error('❌ Health check failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const orchestratorApiService = new OrchestratorApiService();
export default orchestratorApiService;