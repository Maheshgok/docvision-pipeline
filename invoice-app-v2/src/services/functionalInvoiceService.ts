/**
 * @deprecated This service is no longer used. 
 * All processing now goes through: initial-api → orchestrator → Cloud Tasks pipeline.
 * Kept for reference only. See processingModeService.ts for the current implementation.
 * 
 * DEPRECATED: Orchestrated Invoice Processing Service  
 * Previously used for direct microservice calls, now replaced by orchestrated pipeline.
 */

import { getApiUrl } from '../config/api'

export interface FunctionalProcessingResult {
  success: boolean
  content: string
  tokens_used: number
  processing_time: number
  job_id: string
  timestamp: string
}

export interface CompletePipelineResult {
  job_id: string
  status: 'COMPLETE' | 'ERROR'
  extracted_data?: FunctionalProcessingResult
  enriched_data?: FunctionalProcessingResult
  analysis_data?: FunctionalProcessingResult
  final_tabulation?: any
  processing_stats?: {
    total_processing_time: number
    total_tokens_used: number
    tokens_per_second: number
    phase_breakdown: {
      extraction: { time: number; tokens: number }
      enrichment: { time: number; tokens: number }
      analysis: { time: number; tokens: number }
    }
  }
  error?: string
}

/** @deprecated Use initial-api upload endpoint instead */
export class FunctionalInvoiceService {
  
  /**
   * Process invoice through orchestrated pipeline
   */
  async extractInvoiceData(imageData: string, jobId: string): Promise<FunctionalProcessingResult> {
    const response = await fetch(getApiUrl.processInvoice(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_data: imageData,
        job_id: jobId,
        stage: 'extraction'
      })
    })

    if (!response.ok) {
      throw new Error(`Orchestrated extraction failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Standardize extracted data through field standardizer service
   */
  async enrichInvoiceData(extractedData: string, jobId: string): Promise<FunctionalProcessingResult> {
    const response = await fetch(getApiUrl.standardizeData(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw_data: extractedData,
        job_id: jobId
      })
    })

    if (!response.ok) {
      throw new Error(`Field standardization failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Combine and finalize processed invoice data
   */
  async analyzeInvoiceData(combinedData: any, jobId: string): Promise<FunctionalProcessingResult> {
    const response = await fetch(getApiUrl.combineData(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        standardized_data: combinedData,
        job_id: jobId
      })
    })

    if (!response.ok) {
      throw new Error(`Data combination failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Create final tabulated summary from all processing phases
   */
  async createTabulation(
    extractionResult: FunctionalProcessingResult,
    enrichmentResult: FunctionalProcessingResult,
    analysisResult: FunctionalProcessingResult,
    jobId: string
  ): Promise<{ success: boolean; tabulation: any; job_id: string; timestamp: string }> {
    // In orchestrated pipeline, final tabulation is handled by data combiner
    return {
      success: true,
      tabulation: {
        extraction_data: extractionResult,
        standardized_data: enrichmentResult,
        final_data: analysisResult
      },
      job_id: jobId,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Complete orchestrated pipeline processing
   */
  async processInvoiceComplete(imageData: string, jobId: string): Promise<CompletePipelineResult> {
    try {
      console.log(`🚀 Starting orchestrated pipeline for job ${jobId}`)
      
      // Single call to orchestrated pipeline (handles all stages internally)
      const response = await fetch(getApiUrl.processInvoice(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image_data: imageData,
          job_id: jobId,
          process_complete: true
        })
      })

      if (!response.ok) {
        throw new Error(`Orchestrated pipeline failed: ${response.statusText}`)
      }

      const result = await response.json()
      
      console.log('✅ Orchestrated pipeline completed successfully')
      
      return {
        job_id: jobId,
        status: 'COMPLETE',
        extracted_data: result.extraction_result || { 
          success: true, 
          content: 'Extracted by orchestrator', 
          tokens_used: 0, 
          processing_time: 0, 
          job_id: jobId, 
          timestamp: new Date().toISOString() 
        },
        enriched_data: result.standardization_result || { 
          success: true, 
          content: 'Standardized by orchestrator', 
          tokens_used: 0, 
          processing_time: 0, 
          job_id: jobId, 
          timestamp: new Date().toISOString() 
        },
        analysis_data: result.combination_result || { 
          success: true, 
          content: 'Combined by orchestrator', 
          tokens_used: 0, 
          processing_time: 0, 
          job_id: jobId, 
          timestamp: new Date().toISOString() 
        },
        final_tabulation: result.final_result || result,
        processing_stats: result.processing_stats || {
          total_processing_time: result.total_processing_time || 0,
          total_tokens_used: result.total_tokens_used || 0,
          tokens_per_second: result.tokens_per_second || 0,
          phase_breakdown: {
            extraction: { time: 0, tokens: 0 },
            enrichment: { time: 0, tokens: 0 },
            analysis: { time: 0, tokens: 0 }
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Orchestrated pipeline failed for job ${jobId}:`, error)
      return {
        job_id: jobId,
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Check health of all functional services
   */
  async healthCheck(): Promise<{ 
    orchestrator: boolean;
    standardizer: boolean; 
    combiner: boolean; 
    overall: boolean 
  }> {
    try {
      const [orchestratorHealth, standardizerHealth, combinerHealth] = await Promise.all([
        fetch(getApiUrl.orchestratorHealth()).then(r => r.ok),
        fetch(getApiUrl.standardizerHealth()).then(r => r.ok),
        fetch(getApiUrl.combinerHealth()).then(r => r.ok)
      ])

      const overall = orchestratorHealth && standardizerHealth && combinerHealth

      return {
        orchestrator: orchestratorHealth,
        standardizer: standardizerHealth, 
        combiner: combinerHealth,
        overall
      }
    } catch (error) {
      console.error('Orchestrated pipeline health check failed:', error)
      return {
        orchestrator: false,
        standardizer: false,
        combiner: false,
        overall: false
      }
    }
  }
}

// Export singleton instance
export const functionalInvoiceService = new FunctionalInvoiceService()