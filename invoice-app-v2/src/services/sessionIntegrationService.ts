/**
 * Session Integration Service - Frontend integration with Session Manager
 */

export class SessionIntegrationService {
  private sessionManagerUrl = 'https://session-manager-812016027146.asia-south1.run.app'
  private heartbeatInterval: number | null = null
  private currentUserId: string | null = null

  /**
   * 1. DETECT LOGIN - Called when user logs in
   */
  async notifyLogin(userId: string, idToken: string): Promise<void> {
    try {
      console.log('🔥 Notifying session manager: user login')
      
      const response = await fetch(`${this.sessionManagerUrl}/session/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          user_id: userId,
          session_token: idToken,
          login_time: new Date().toISOString(),
          client_info: {
            user_agent: navigator.userAgent,
            timestamp: Date.now()
          }
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ Session manager notified of login:', result.session_status)
        
        // Start activity heartbeat (every 60 seconds)
        this.startActivityHeartbeat(userId, idToken)
        this.currentUserId = userId
      } else {
        console.error('❌ Failed to notify session manager of login')
      }

    } catch (error) {
      console.error('❌ Session manager login notification failed:', error)
      // Continue without session management - services will cold start normally
    }
  }

  /**
   * 2. ACTIVITY HEARTBEAT - Keeps session alive while user is active
   */
  private startActivityHeartbeat(userId: string, idToken: string): void {
    // Clear any existing heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    console.log('💓 Starting activity heartbeat every 60 seconds')
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        // Only send if user is still active (page visible, recent mouse/keyboard activity)
        if (this.isUserActive()) {
          await fetch(`${this.sessionManagerUrl}/session/activity`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              user_id: userId,
              activity_time: new Date().toISOString(),
              page_visible: !document.hidden
            })
          })
          
          console.log('💓 Activity heartbeat sent')
        } else {
          console.log('💤 User inactive - skipping heartbeat')
        }
      } catch (error) {
        console.error('❌ Activity heartbeat failed:', error)
      }
    }, 60000) // Every 60 seconds
  }

  /**
   * 3. DETECT USER ACTIVITY - Check if user is actively using the app
   */
  private lastActivityTime = Date.now()

  private isUserActive(): boolean {
    // User is active if:
    // 1. Page is visible
    // 2. Recent mouse/keyboard activity (within last 2 minutes)
    const twoMinutesAgo = Date.now() - (2 * 60 * 1000)
    return !document.hidden && this.lastActivityTime > twoMinutesAgo
  }

  /**
   * Track user interactions
   */
  private trackUserActivity = () => {
    this.lastActivityTime = Date.now()
  }

  /**
   * Initialize activity tracking
   */
  initActivityTracking(): void {
    // Track mouse and keyboard activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    events.forEach(event => {
      document.addEventListener(event, this.trackUserActivity, { passive: true })
    })

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.trackUserActivity()
      }
    })
  }

  /**
   * 4. DETECT LOGOUT - Called when user logs out
   */
  async notifyLogout(userId?: string): Promise<void> {
    const logoutUserId = userId || this.currentUserId
    
    if (!logoutUserId) {
      console.log('🚪 No user ID for logout notification')
      return
    }

    try {
      console.log('🚪 Notifying session manager: user logout')
      
      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval)
        this.heartbeatInterval = null
      }

      const response = await fetch(`${this.sessionManagerUrl}/session/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: logoutUserId,
          logout_time: new Date().toISOString()
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ Session manager notified of logout:', result.session_status)
      }

      this.currentUserId = null

    } catch (error) {
      console.error('❌ Session manager logout notification failed:', error)
    }
  }

  /**
   * 5. AUTOMATIC SESSION CLEANUP - Handle page close, browser close
   */
  initSessionCleanup(): void {
    // Handle page unload (browser close, tab close, navigation)
    window.addEventListener('beforeunload', () => {
      if (this.currentUserId) {
        // Use sendBeacon for reliable delivery even during page unload
        const data = JSON.stringify({
          user_id: this.currentUserId,
          logout_time: new Date().toISOString(),
          logout_reason: 'page_unload'
        })

        navigator.sendBeacon(
          `${this.sessionManagerUrl}/session/logout`,
          new Blob([data], { type: 'application/json' })
        )
      }
    })

    // Handle page visibility changes (browser minimize, tab switch)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Page hidden - could be user switching tabs or minimizing
        console.log('👁️ Page hidden - user may be inactive')
      } else {
        // Page visible - user is back
        this.trackUserActivity()
        console.log('👁️ Page visible - user is active')
      }
    })
  }

  /**
   * Get current session status from session manager
   */
  async getSessionStatus(): Promise<any> {
    try {
      const response = await fetch(`${this.sessionManagerUrl}/session/status`)
      return response.ok ? await response.json() : null
    } catch (error) {
      console.error('❌ Failed to get session status:', error)
      return null
    }
  }

  /**
   * Manually trigger service warmup (admin function)
   */
  async triggerServiceWarmup(): Promise<any> {
    try {
      const response = await fetch(`${this.sessionManagerUrl}/services/warmup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      return response.ok ? await response.json() : null
    } catch (error) {
      console.error('❌ Failed to trigger service warmup:', error)
      return null
    }
  }
}

// Export singleton instance
export const sessionIntegrationService = new SessionIntegrationService()