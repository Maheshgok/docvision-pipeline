import { authService } from './auth'

/**
 * Service for managing upload freeze during logout process
 */
class UploadFreezeService {
  private isFrozen: boolean = false
  private freezeReason: string = ''
  private frozenAt: Date | null = null

  /**
   * Freeze all upload operations
   */
  freezeUploads(reason: string = 'Session logout in progress'): void {
    this.isFrozen = true
    this.freezeReason = reason
    this.frozenAt = new Date()
    
    console.log('🧊 Uploads frozen:', reason)
    
    // Broadcast freeze event to all components
    this.broadcastFreezeEvent()
  }

  /**
   * Unfreeze upload operations
   */
  unfreezeUploads(): void {
    if (this.isFrozen) {
      console.log('🔥 Uploads unfrozen after:', this.getFreezeDuration())
    }
    
    this.isFrozen = false
    this.freezeReason = ''
    this.frozenAt = null
    
    // Broadcast unfreeze event
    this.broadcastUnfreezeEvent()
  }

  /**
   * Check if uploads are currently frozen
   */
  areUploadsFrozen(): boolean {
    return this.isFrozen
  }

  /**
   * Get freeze status details
   */
  getFreezeStatus(): {
    isFrozen: boolean
    reason: string
    frozenAt: Date | null
    duration: string
  } {
    return {
      isFrozen: this.isFrozen,
      reason: this.freezeReason,
      frozenAt: this.frozenAt,
      duration: this.getFreezeDuration()
    }
  }

  /**
   * Get freeze duration in human readable format
   */
  private getFreezeDuration(): string {
    if (!this.frozenAt) return '0s'
    
    const duration = Date.now() - this.frozenAt.getTime()
    const seconds = Math.floor(duration / 1000)
    const minutes = Math.floor(seconds / 60)
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  /**
   * Broadcast freeze event to components
   */
  private broadcastFreezeEvent(): void {
    const event = new CustomEvent('uploadsFrozen', {
      detail: {
        reason: this.freezeReason,
        frozenAt: this.frozenAt
      }
    })
    window.dispatchEvent(event)
  }

  /**
   * Broadcast unfreeze event to components
   */
  private broadcastUnfreezeEvent(): void {
    const event = new CustomEvent('uploadsUnfrozen', {
      detail: {
        duration: this.getFreezeDuration()
      }
    })
    window.dispatchEvent(event)
  }

  /**
   * Prevent upload if frozen - to be called by upload components
   */
  validateUploadAllowed(): { allowed: boolean; reason?: string } {
    if (this.isFrozen) {
      return {
        allowed: false,
        reason: `Uploads are temporarily disabled: ${this.freezeReason}`
      }
    }
    
    return { allowed: true }
  }

  /**
   * Auto-unfreeze after timeout (safety mechanism)
   */
  setupAutoUnfreeze(timeoutMs: number = 300000): void { // 5 minutes default
    if (this.isFrozen) {
      setTimeout(() => {
        if (this.isFrozen) {
          console.log('⏰ Auto-unfreezing uploads after timeout')
          this.unfreezeUploads()
        }
      }, timeoutMs)
    }
  }
}

export const uploadFreezeService = new UploadFreezeService()