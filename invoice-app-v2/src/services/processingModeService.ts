/**
 * Processing Mode Service - Switch between legacy and functional processing
 * 
 * NOTE: Both modes now route through initial-api → orchestrator pipeline.
 * The 'functional' mode was previously used for direct microservice calls,
 * but has been deprecated in favor of the orchestrated approach.
 */

// CompletePipelineResult type kept for backward compatibility
export interface CompletePipelineResult {
  job_id: string
  status: string
  extracted_data?: any
  standardized_data?: any
  enriched_data?: any
  final_result?: any
  error?: string
}

import { getApiUrl } from '../config/api'
import { authService } from './auth'

export type ProcessingMode = 'legacy' | 'functional'

export interface ProcessingConfig {
  mode: ProcessingMode
  enableRealtime: boolean
  enableFallback: boolean
}

export class ProcessingModeService {
  private config: ProcessingConfig = {
    mode: 'legacy', // Use orchestrated pipeline via initial-api
    enableRealtime: true,
    enableFallback: false // No fallback needed with orchestrator
  }

  /**
   * Set processing mode
   */
  setMode(mode: ProcessingMode): void {
    this.config.mode = mode
    console.log(`🔧 Processing mode set to: ${mode}`)
  }

  /**
   * Get current processing mode
   */
  getMode(): ProcessingMode {
    return this.config.mode
  }

  /**
   * Process invoice using selected mode
   */
  async processInvoice(file: File, jobId: string): Promise<CompletePipelineResult | any> {
    if (this.config.mode === 'functional') {
      return this.processFunctional(file, jobId)
    } else {
      return this.processLegacy(file, jobId)
    }
  }

  /**
   * Process using orchestrated multi-stage pipeline (via initial-api → orchestrator)
   * NOTE: 'functional' mode now goes through orchestrator for multi-stage processing
   */
  private async processFunctional(file: File, jobId: string): Promise<CompletePipelineResult> {
    try {
      console.log('🎼 Using orchestrated pipeline for functional processing')
      
      // All functional processing now goes through initial-api → orchestrator
      return this.processLegacy(file, jobId)
      
    } catch (error) {
      console.error(`❌ Orchestrated processing failed for ${jobId}:`, error)
      throw error // No fallback - orchestrator is the primary path
    }
  }

  /**
   * Process using orchestrated pipeline (initial-api → orchestrator → multi-stage services)
   */
  private async processLegacy(file: File, jobId: string): Promise<any> {
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      // Upload using initial-api → orchestrator pipeline
      const formData = new FormData()
      formData.append('file', file)

      const uploadResponse = await fetch(getApiUrl.uploadInvoice(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        },
        body: formData
      })

      if (!uploadResponse.ok) {
        throw new Error(`Orchestrated upload failed: ${uploadResponse.statusText}`)
      }

      const result = await uploadResponse.json()
      console.log(`✅ Orchestrated processing initiated for ${jobId}`)
      
      return {
        job_id: jobId,
        status: 'PROCESSING',
        orchestrated: true,
        ...result
      }
      
    } catch (error) {
      console.error(`❌ Orchestrated processing failed for ${jobId}:`, error)
      throw error
    }
  }

  /**
   * Check health of services for current mode
   */
  async healthCheck(): Promise<{ healthy: boolean; mode: ProcessingMode; details: any }> {
    if (this.config.mode === 'functional') {
      // Both modes now use orchestrated pipeline
      try {
        const response = await fetch(getApiUrl.health())
        return {
          healthy: response.ok,
          mode: 'functional',
          details: { orchestrated: response.ok }
        }
      } catch (error) {
        return {
          healthy: false,
          mode: 'functional', 
          details: { error: error instanceof Error ? error.message : String(error) }
        }
      }
    } else {
      try {
        const response = await fetch(getApiUrl.health())
        return {
          healthy: response.ok,
          mode: 'legacy', 
          details: { orchestrated: response.ok }
        }
      } catch (error) {
        return {
          healthy: false,
          mode: 'legacy',
          details: { error: error instanceof Error ? error.message : String(error) }
        }
      }
    }
  }

  /**
   * Convert File to base64 string
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = error => reject(error)
    })
  }

  /**
   * Get processing mode configuration
   */
  getConfig(): ProcessingConfig {
    return { ...this.config }
  }

  /**
   * Update processing configuration
   */
  updateConfig(updates: Partial<ProcessingConfig>): void {
    this.config = { ...this.config, ...updates }
    console.log('🔧 Processing config updated:', this.config)
  }
}

// Export singleton instance
export const processingModeService = new ProcessingModeService()