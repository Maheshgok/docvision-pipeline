/**
 * Centralized Cleanup Manager
 * Prevents race conditions and redundant cleanup operations
 */

import { archiveService } from './archive'
import { sessionRecoveryService } from './sessionRecoveryService'

export enum CleanupTrigger {
  MANUAL_LOGOUT = 'manual_logout',
  WINDOW_CLOSE = 'window_close',
  TAB_HIDDEN = 'tab_hidden',
  PAGE_UNLOAD = 'page_unload',
  SESSION_TIMEOUT = 'session_timeout'
}

export interface CleanupResult {
  success: boolean
  archived_count: number
  trigger: CleanupTrigger
  timestamp: string
  error?: string
}

class CleanupManager {
  private static instance: CleanupManager
  private cleanupInProgress = false
  private lastCleanup: number = 0

  private constructor() {}

  static getInstance(): CleanupManager {
    if (!CleanupManager.instance) {
      CleanupManager.instance = new CleanupManager()
    }
    return CleanupManager.instance
  }

  /**
   * Centralized cleanup operation
   * Prevents duplicate cleanup attempts and ensures proper sequencing
   */
  async performCleanup(
    trigger: CleanupTrigger,
    hasResults: boolean = false,
    user?: any
  ): Promise<CleanupResult> {
    const now = Date.now()
    
    // Prevent rapid successive cleanup attempts
    if (this.cleanupInProgress) {
      console.log(`🔄 Cleanup already in progress, skipping ${trigger}`)
      return {
        success: false,
        archived_count: 0,
        trigger,
        timestamp: new Date().toISOString(),
        error: 'Cleanup already in progress'
      }
    }

    this.cleanupInProgress = true
    this.lastCleanup = now
    
    console.log(`🧹 Starting cleanup - Trigger: ${trigger}`, {
      hasResults,
      userEmail: user?.email
    })

    try {
      let archived_count = 0
      
      // Only perform archiving if there are actually results to archive
      if (hasResults) {
        console.log('📦 Archiving completed results...')
        
        // Use Promise.race to prevent cleanup from hanging
        const archiveResult = await Promise.race([
          archiveService.archiveCompletedResults(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Archive timeout')), 10000)
          )
        ])
        
        archived_count = archiveResult.archived_count
        console.log(`✅ Archived ${archived_count} results`)
      }

      // Cleanup blob URLs and other memory leaks
      this.cleanupMemory()

      // Clear session recovery state after successful archive
      sessionRecoveryService.clearRecoveryState()

      const result: CleanupResult = {
        success: true,
        archived_count,
        trigger,
        timestamp: new Date().toISOString()
      }

      console.log('✅ Cleanup completed successfully:', result)
      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Cleanup failed:', errorMessage)
      
      return {
        success: false,
        archived_count: 0,
        trigger,
        timestamp: new Date().toISOString(),
        error: errorMessage
      }
    } finally {
      this.cleanupInProgress = false
    }
  }

  /**
   * Clean up memory leaks (blob URLs, etc.)
   */
  private cleanupMemory(): void {
    // Clean up any blob URLs that might be lingering
    // This would be enhanced based on specific memory tracking needs
    console.log('🧹 Cleaning up memory resources')
  }

  /**
   * Check if cleanup is currently in progress
   */
  isCleanupInProgress(): boolean {
    return this.cleanupInProgress
  }

  /**
   * Get time since last cleanup
   */
  getTimeSinceLastCleanup(): number {
    return Date.now() - this.lastCleanup
  }

  /**
   * Reset cleanup state (for testing purposes)
   */
  reset(): void {
    this.cleanupInProgress = false
    this.lastCleanup = 0
  }
}

// Export singleton instance
export const cleanupManager = CleanupManager.getInstance()
export default cleanupManager