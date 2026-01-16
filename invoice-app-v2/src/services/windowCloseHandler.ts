import { cleanupManager, CleanupTrigger } from './cleanupManager'

class WindowCloseHandler {
  private cleanupInProgress = false
  private hasResults = false
  private user: any = null
  private cleanupPromise: Promise<void> | null = null
  private visibilityTimeout: NodeJS.Timeout | null = null
  private lastVisibilityChange = 0

  /**
   * Initialize the window close handler with event listeners
   */
  initialize(user: any) {
    this.user = user
    this.setupEventListeners()
  }

  /**
   * Update the status of whether there are results to archive
   */
  setHasResults(hasResults: boolean) {
    this.hasResults = hasResults
    console.log('🗂️ WindowCloseHandler: Updated results status:', hasResults)
  }

  /**
   * Set up all the window/tab close event listeners
   */
  private setupEventListeners() {
    // Handle beforeunload - shows warning if there are unsaved results
    window.addEventListener('beforeunload', this.handleBeforeUnload)
    
    // Handle unload - send beacon for server-side cleanup
    window.addEventListener('unload', this.handleUnload)
    
    // Handle pagehide - more reliable than unload on mobile
    window.addEventListener('pagehide', this.handlePageHide)
    
    // Handle visibility change - cleanup when tab is hidden for extended time
    document.addEventListener('visibilitychange', this.handleVisibilityChange)

    // Listen for manual logout to cleanup
    window.addEventListener('user-logout', this.handleManualLogout)
  }

  /**
   * Remove all event listeners
   */
  cleanup() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    window.removeEventListener('unload', this.handleUnload)
    window.removeEventListener('pagehide', this.handlePageHide)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('user-logout', this.handleManualLogout)
    
    // Clear any pending visibility timeout
    if (this.visibilityTimeout) {
      clearTimeout(this.visibilityTimeout)
      this.visibilityTimeout = null
    }
  }

  /**
   * Handle beforeunload event - show warning if user has unsaved data
   */
  private handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.hasResults && this.user && !this.cleanupInProgress) {
      const message = 'You have unprocessed invoice results. Are you sure you want to leave?'
      event.preventDefault()
      event.returnValue = message
      return message
    }
  }

  /**
   * Handle unload event - perform lightweight cleanup only
   */
  private handleUnload = () => {
    if (this.user && this.hasResults) {
      console.log('📡 Window unload detected for user:', this.user.email)
      // Note: Removed sendBeacon call as the endpoint doesn't exist
      // If needed, implement proper endpoint first
    }
  }

  /**
   * Handle pagehide event - perform cleanup only on actual page unload
   */
  private handlePageHide = async (event: PageTransitionEvent) => {
    // Only cleanup on actual navigation away (not just tab switching)
    if (event.persisted) {
      console.log('📄 Page cached, not performing cleanup')
      return // Don't cleanup if page is just being cached
    }
    
    if (!this.user || this.cleanupInProgress) {
      return
    }
    
    console.log('🚪 Page actually unloading - triggering cleanup for user:', this.user.email)
    
    // Perform immediate synchronous cleanup if possible
    if (this.hasResults) {
      try {
        // Use sendBeacon for fire-and-forget archive request
        const token = await authService.getIdToken()
        if (token && navigator.sendBeacon) {
          const archiveData = JSON.stringify({
            action: 'archive_on_close',
            userUID: this.user.uid,
            timestamp: Date.now()
          })
          
          // Note: This would need a proper endpoint, for now just log
          console.log('📡 Would send beacon for archive on close:', archiveData)
        }
      } catch (error) {
        console.warn('⚠️ Beacon archive failed:', error)
      }
    }
    
    // Also trigger async cleanup (won't complete but starts the process)
    this.performAsyncCleanup()
  }

  /**
   * Handle visibility change - cleanup if hidden for extended time
   */
  private handleVisibilityChange = () => {
    const now = Date.now()
    this.lastVisibilityChange = now
    
    if (document.visibilityState === 'hidden' && this.user && this.hasResults) {
      console.log('👁️ Page hidden with results - will cleanup only on actual page close')
      
      // Clear any existing timeout to avoid multiple concurrent ones
      if (this.visibilityTimeout) {
        clearTimeout(this.visibilityTimeout)
        this.visibilityTimeout = null
      }
      
      // Only schedule cleanup after a very long delay (30 minutes)
      // This gives users plenty of time to return without losing their results
      this.visibilityTimeout = setTimeout(() => {
        // Double-check: only cleanup if still hidden and this timeout hasn't been superseded
        if (document.visibilityState === 'hidden' && 
            this.user && 
            this.hasResults &&
            this.lastVisibilityChange <= now) {
          console.log('⏰ Page still hidden after extended delay - triggering cleanup')
          this.performAsyncCleanup()
        } else {
          console.log('🔄 Page visibility changed during timeout - skipping cleanup')
        }
        this.visibilityTimeout = null
      }, 1800000) // 30 minutes delay
      
    } else if (document.visibilityState === 'visible') {
      console.log('👁️ Page visible again - cancelling any pending cleanup')
      // Cancel cleanup if page becomes visible again
      if (this.visibilityTimeout) {
        clearTimeout(this.visibilityTimeout)
        this.visibilityTimeout = null
      }
    }
  }

  /**
   * Handle manual logout
   */
  private handleManualLogout = () => {
    console.log('👤 Manual logout triggered')
    this.performAsyncCleanup()
  }

  /**
   * Perform async cleanup operations
   */
  private performAsyncCleanup() {
    if (this.cleanupInProgress || !this.user) {
      return this.cleanupPromise || Promise.resolve()
    }

    this.cleanupInProgress = true
    
    this.cleanupPromise = this.executeCleanup()
      .then(() => {
        console.log('✅ Async cleanup completed successfully')
      })
      .catch((error) => {
        console.error('❌ Error during async cleanup:', error)
      })
      .finally(() => {
        this.cleanupInProgress = false
        this.cleanupPromise = null
      })

    return this.cleanupPromise
  }

  /**
   * Execute the actual cleanup operations using centralized manager
   */
  private async executeCleanup() {
    if (!this.user) return

    console.log('🧹 Starting centralized cleanup for user:', this.user.email)

    try {
      const result = await cleanupManager.performCleanup(
        CleanupTrigger.WINDOW_CLOSE,
        this.hasResults,
        this.user
      )

      if (result.success) {
        // Clear results tracking
        this.hasResults = false
        console.log('✅ Centralized cleanup completed:', result)
      } else {
        console.error('❌ Centralized cleanup failed:', result.error)
        throw new Error(result.error || 'Cleanup failed')
      }

    } catch (error) {
      console.error('❌ Cleanup error:', error)
      throw error
    }
  }

  /**
   * Trigger manual cleanup (for logout button, etc.)
   */
  async triggerCleanup() {
    return this.performAsyncCleanup()
  }
}

// Export singleton instance
export const windowCloseHandler = new WindowCloseHandler()