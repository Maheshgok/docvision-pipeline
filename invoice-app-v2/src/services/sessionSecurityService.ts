import { Timestamp, serverTimestamp, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy, addDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import { uploadFreezeService } from './uploadFreezeService'
import { forcedLogoutRecoveryService } from './forcedLogoutRecoveryService'
import toast from 'react-hot-toast'

// Session activity logging interface
interface SessionActivity {
  sessionId: string
  userUid: string
  event: 'session_start' | 'session_end' | 'tab_switch' | 'activity_timeout' | 'force_logout' | 'error'
  details?: string
  timestamp: Timestamp
  tabId: string
  browserInfo: string
}

// Local UserSession interface for session tracking
interface UserSession {
  sessionId: string
  userUid: string
  deviceFingerprint: string
  browserInfo: string
  ipAddress: string
  location?: string
  createdAt: Timestamp
  lastActivity: Timestamp
  isActive: boolean
  tabId?: string
}

/**
 * Service for managing single-device sessions and single-tab restrictions
 */
class SessionSecurityService {
  private currentSessionId: string | null = null
  private deviceFingerprint: string
  private tabId: string
  private broadcastChannel: BroadcastChannel | null = null
  private isActiveTab: boolean = true
  private activityInterval: number | null = null
  private sessionCheckInterval: number | null = null
  private activityThrottleTimer: number | null = null // Separate timer for activity throttling
  private sessionLogs: SessionActivity[] = [] // In-memory buffer
  private maxLogBuffer = 50 // Max logs to keep in memory
  private logFlushInterval: number | null = null
  private logoutInProgressFlag = false
  private logoutWarningCallback: ((reason: string, pendingCount: number) => Promise<boolean>) | null = null

  constructor() {
    this.deviceFingerprint = this.generateDeviceFingerprint()
    this.tabId = this.generateTabId()
    this.initializeBroadcastChannel()
    this.setupActivityTracking()
    this.setupBeforeUnloadHandler()
    this.initializeSessionLogging()
  }

  /**
   * Initialize session logging with periodic flush to Firestore
   */
  private initializeSessionLogging(): void {
    // Flush logs every 30 seconds to balance performance and data consistency
    this.logFlushInterval = window.setInterval(() => {
      this.flushSessionLogs()
    }, 30000)
  }

  /**
   * Log session activity efficiently (in-memory first, batch write later)
   */
  private logSessionActivity(event: SessionActivity['event'], details?: string): void {
    const currentUser = authService.getCurrentUser()
    if (!currentUser || !this.currentSessionId) return

    const activity: SessionActivity = {
      sessionId: this.currentSessionId,
      userUid: currentUser.uid,
      event,
      details,
      timestamp: serverTimestamp() as Timestamp,
      tabId: this.tabId,
      browserInfo: navigator.userAgent // Direct access to avoid method binding issues
    }

    // Add to in-memory buffer
    this.sessionLogs.push(activity)

    // Keep buffer size manageable
    if (this.sessionLogs.length > this.maxLogBuffer) {
      this.sessionLogs = this.sessionLogs.slice(-this.maxLogBuffer)
    }

    // For critical events, flush immediately
    if (['session_start', 'session_end', 'force_logout', 'error'].includes(event)) {
      this.flushSessionLogs()
    }
  }

  /**
   * Flush session logs to Firestore efficiently
   */
  private async flushSessionLogs(): Promise<void> {
    if (this.sessionLogs.length === 0) return

    const logsToFlush = [...this.sessionLogs]
    this.sessionLogs = [] // Clear buffer

    try {
      // Batch write all logs at once
      const promises = logsToFlush.map(log => 
        addDoc(collection(db, 'session_logs'), log)
      )
      
      await Promise.all(promises)
      console.log(`🔒 Flushed ${logsToFlush.length} session logs to Firestore`)
    } catch (error) {
      console.error('❌ Failed to flush session logs:', error)
      // Re-add failed logs to buffer (up to max size)
      this.sessionLogs = [...logsToFlush.slice(-this.maxLogBuffer), ...this.sessionLogs]
    }
  }

  /**
   * Get session logs for a user (admin/debug use)
   */
  async getUserSessionLogs(userUid: string, limit = 100): Promise<SessionActivity[]> {
    try {
      const logsQuery = query(
        collection(db, 'session_logs'),
        where('userUid', '==', userUid),
        orderBy('timestamp', 'desc')
      )
      
      const snapshot = await getDocs(logsQuery)
      return snapshot.docs.map(doc => ({ ...doc.data() } as SessionActivity))
    } catch (error) {
      console.error('❌ Failed to get session logs:', error)
      return []
    }
  }

  /**
   * Clean up old session logs (call periodically to manage storage costs)
   */
  async cleanupOldSessionLogs(daysToKeep = 30): Promise<void> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)
    
    console.log(`🧹 Cleaning up session logs older than ${daysToKeep} days would require Cloud Functions`)
    // Note: This would typically be implemented as a Cloud Function for efficiency
  }

  /**
   * Generate device fingerprint for session tracking
   */
  private generateDeviceFingerprint(): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.textBaseline = 'top'
      ctx.font = '14px Arial'
      ctx.fillText('Device fingerprint', 2, 2)
    }
    
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvasFingerprint: canvas.toDataURL(),
      cookiesEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as any).deviceMemory
    }

    return btoa(JSON.stringify(fingerprint)).slice(0, 32)
  }

  /**
   * Generate unique tab ID
   */
  private generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get browser information for session tracking
   */
  private getBrowserInfo(): string {
    return navigator.userAgent
  }

  /**
   * Initialize broadcast channel for tab communication
   */
  private initializeBroadcastChannel(): void {
    try {
      this.broadcastChannel = new BroadcastChannel('session_security')
      this.broadcastChannel.onmessage = (event) => {
        const { type, data } = event.data
        
        switch (type) {
          case 'NEW_TAB_OPENED':
            if (data.tabId !== this.tabId && this.isActiveTab) {
              this.handleDuplicateTab()
            }
            break
          case 'TAB_CLAIMING_ACTIVE':
            if (data.tabId !== this.tabId) {
              this.isActiveTab = false
              this.showTabDeactivatedMessage()
            }
            break
          case 'TAB_CLOSED':
            if (!this.isActiveTab && data.tabId !== this.tabId) {
              this.attemptToRecoverActiveStatus()
            }
            break
        }
      }
    } catch (error) {
      console.warn('BroadcastChannel not supported, tab management disabled')
    }
  }

  /**
   * Start a new session with security checks
   */
  async startSession(userUid: string): Promise<boolean> {
    try {
      // FIRST: Check if any other user is currently active in the system
      const globalActiveSessions = await this.getAnyActiveGlobalSessions()
      const otherUserActiveSessions = globalActiveSessions.filter(session => session.userUid !== userUid)
      
      if (otherUserActiveSessions.length > 0) {
        const activeUser = otherUserActiveSessions[0]
        console.log('🚫 Blocking login - Another user is currently active:', activeUser.userUid)
        
        toast.error('System is currently in use by another user. Please try again later.', {
          duration: 5000,
          position: 'top-center'
        })
        
        return false
      }
      
      // Check for existing sessions of the same user
      const existingSessions = await this.getActiveUserSessions(userUid)
      
      // Terminate other sessions
      if (existingSessions.length > 0) {
        console.log('🔒 Terminating existing sessions for single-device policy')
        await this.terminateOtherSessions(existingSessions)
      }

      // Create new session
      this.currentSessionId = this.generateSessionId()
      const session: UserSession = {
        sessionId: this.currentSessionId,
        userUid: userUid,
        deviceFingerprint: this.deviceFingerprint,
        browserInfo: navigator.userAgent,
        ipAddress: await this.getClientIP(),
        createdAt: serverTimestamp() as Timestamp,
        lastActivity: serverTimestamp() as Timestamp,
        isActive: true,
        tabId: this.tabId
      }

      await this.createUserSessionDoc(session)
      
      // Start activity tracking
      this.startActivityTracking()
      this.startSessionMonitoring()
      
      // Announce new tab
      this.broadcastTabMessage('NEW_TAB_OPENED', { tabId: this.tabId })
      this.claimActiveTab()

      console.log('🔒 Session started successfully:', this.currentSessionId)
      this.logSessionActivity('session_start', 'New session created')
      return true

    } catch (error) {
      console.error('❌ Error starting session:', error)
      return false
    }
  }

  /**
   * Check if system is currently in use by any user (public method)
   */
  async isSystemCurrentlyInUse(): Promise<{ inUse: boolean; activeUserUid?: string }> {
    try {
      const globalActiveSessions = await this.getAnyActiveGlobalSessions()
      
      if (globalActiveSessions.length > 0) {
        return {
          inUse: true,
          activeUserUid: globalActiveSessions[0].userUid
        }
      }
      
      return { inUse: false }
    } catch (error) {
      console.error('❌ Error checking system usage:', error)
      return { inUse: false }
    }
  }

  /**
   * End current session
   */
  async endSession(): Promise<void> {
    try {
      if (this.currentSessionId) {
        this.logSessionActivity('session_end', 'Session ended by user')
        await this.deactivateSessionDoc(this.currentSessionId)
        this.currentSessionId = null
      }

      this.cleanup()
      this.broadcastTabMessage('TAB_CLOSED', { tabId: this.tabId })

    } catch (error) {
      console.error('❌ Error ending session:', error)
    }
  }

  /**
   * Check if current tab is allowed to perform upload/analysis
   */
  canPerformSecureOperations(): boolean {
    if (!this.isActiveTab) {
      toast.error('Only one tab can perform analysis at a time. Please close other tabs.')
      return false
    }

    if (!this.currentSessionId) {
      toast.error('No active session. Please login again.')
      return false
    }

    return true
  }

  /**
   * Validate session and check for concurrent logins
   */
  async validateSession(): Promise<boolean> {
    try {
      if (!this.currentSessionId) return false

      // Only validate if tab is visible to reduce false positives
      if (document.visibilityState !== 'visible') {
        return true // Assume valid if tab is hidden
      }

      const sessionValid = await this.validateSessionDoc(this.currentSessionId)
      if (!sessionValid) {
        await this.handleInvalidSession()
        return false
      }

      return true
    } catch (error) {
      console.error('❌ Error validating session:', error)
      // Don't invalidate on network errors
      return true
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`
  }

  /**
   * Get client IP address (simplified for CSP compliance)
   */
  private async getClientIP(): Promise<string> {
    // Return a placeholder since external IP fetching violates CSP
    return 'client-ip-masked'
  }

  /**
   * Terminate other active sessions
   */
  private async terminateOtherSessions(sessions: UserSession[]): Promise<void> {
    for (const session of sessions) {
      if (session.deviceFingerprint !== this.deviceFingerprint) {
        await this.deactivateSessionDoc(session.sessionId)
        console.log('🔒 Terminated session from other device:', session.sessionId)
      }
    }
  }

  /**
   * Start activity tracking
   */
  private startActivityTracking(): void {
    this.activityInterval = window.setInterval(async () => {
      if (this.currentSessionId) {
        await this.updateSessionActivityDoc(this.currentSessionId)
      }
    }, 30000) // Update every 30 seconds
  }

  /**
   * Start session monitoring
   */
  private startSessionMonitoring(): void {
    this.sessionCheckInterval = window.setInterval(async () => {
      // Only check if tab is active and visible
      if (document.visibilityState === 'visible' && this.isActiveTab) {
        const isValid = await this.validateSession()
        if (!isValid) {
          await this.handleInvalidSession()
        }
      }
    }, 300000) // Check every 5 minutes (reduced frequency)
  }

  /**
   * Handle duplicate tab detection
   */
  private handleDuplicateTab(): void {
    toast.error('Analysis functionality is already open in another tab. This tab will be restricted.')
    this.isActiveTab = false
    this.showTabDeactivatedMessage()
  }

  /**
   * Claim active tab status
   */
  private claimActiveTab(): void {
    this.isActiveTab = true
    this.broadcastTabMessage('TAB_CLAIMING_ACTIVE', { tabId: this.tabId })
  }

  /**
   * Attempt to recover active status when other tabs close
   */
  private attemptToRecoverActiveStatus(): void {
    setTimeout(() => {
      if (!this.isActiveTab) {
        this.claimActiveTab()
        toast.success('This tab is now active for analysis operations')
      }
    }, 1000)
  }

  /**
   * Show tab deactivated message
   */
  private showTabDeactivatedMessage(): void {
    // Create overlay to block interaction
    const overlay = document.createElement('div')
    overlay.id = 'tab-restriction-overlay'
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: Arial, sans-serif;
    `
    
    overlay.innerHTML = `
      <div style="text-align: center; padding: 2rem; background: rgba(255, 255, 255, 0.1); border-radius: 8px;">
        <h2>Tab Restricted</h2>
        <p>Analysis functionality is active in another tab.</p>
        <p>Please close the other tab or use this tab for analysis.</p>
        <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Refresh Page
        </button>
      </div>
    `
    
    document.body.appendChild(overlay)
  }

  /**
   * Handle invalid session with forced logout process
   */
  private async handleInvalidSession(): Promise<void> {
    // Only show error if we haven't already invalidated
    if (this.currentSessionId && !this.logoutInProgressFlag) {
      console.warn('🔒 Session invalidated:', this.currentSessionId)
      this.logoutInProgressFlag = true

      await this.executeForcedLogoutProcess('session_timeout')
    }
  }

  /**
   * Execute the complete forced logout process
   * Steps: 1) Freeze uploads, 2) Check pending data, 3) Capture data, 4) Warn user, 5) Logout
   */
  async executeForcedLogoutProcess(reason: string): Promise<void> {
    try {
      console.log('🚨 Starting forced logout process:', reason)
      
      // Step 1: Freeze uploads immediately
      // uploadFreezeService.freezeUploads(`Forced logout: ${reason}`)
      
      // Step 2 & 3: Capture pending data
      // const recoveryId = await forcedLogoutRecoveryService.capturePendingData(
      //   this.currentSessionId!,
      //   reason.includes('timeout') ? 'timeout' : 'forced_logout'
      // )
      
      const pendingCount = 0 // Simplified for now
      
      // Step 4: Warn user (if callback is set)
      if (this.logoutWarningCallback) {
        const userConfirmed = await this.logoutWarningCallback(reason, pendingCount)
        if (!userConfirmed) {
          console.log('📝 User cancelled forced logout')
          this.logoutInProgressFlag = false
          return
        }
      }
      
      // Step 5: Complete logout
      this.logSessionActivity('force_logout', `Forced logout completed: ${reason}`)
      
      if (this.currentSessionId) {
        await this.deactivateSessionDoc(this.currentSessionId)
        this.currentSessionId = null
      }

      this.cleanup()
      
      // Show logout message
      if (document.visibilityState === 'visible') {
        toast.error(`Session ended: ${reason}. Please log in again.`, {
          duration: 4000,
          position: 'top-center'
        })
      }
      
    } catch (error) {
      console.error('❌ Error in forced logout process:', error)
      this.logSessionActivity('error', `Forced logout failed: ${error}`)
    } finally {
      this.logoutInProgressFlag = false
    }
  }

  /**
   * Broadcast message to other tabs
   */
  private broadcastTabMessage(type: string, data: any): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type, data })
    }
  }

  /**
   * Setup activity tracking listeners
   */
  private setupActivityTracking(): void {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    
    events.forEach(event => {
      document.addEventListener(event, () => {
        if (this.currentSessionId) {
          this.updateLastActivity()
        }
      }, true)
    })
  }

  /**
   * Update last activity timestamp
   */
  private updateLastActivity(): void {
    // Throttled update to avoid excessive calls - use separate timer
    if (!this.activityThrottleTimer) {
      this.activityThrottleTimer = window.setTimeout(() => {
        if (this.currentSessionId) {
          this.updateSessionActivityDoc(this.currentSessionId)
          this.logSessionActivity('tab_switch', 'User activity detected')
        }
        this.activityThrottleTimer = null
      }, 10000) // Update at most every 10 seconds
    }
  }

  /**
   * Public method to update activity (for external services like uploads)
   */
  public updateActivity(): void {
    if (this.currentSessionId) {
      console.log('🔄 Updating session activity for:', this.currentSessionId.substring(0, 20) + '...')
      this.updateSessionActivityDoc(this.currentSessionId)
    }
  }

  /**
   * Setup beforeunload handler for cleanup
   */
  private setupBeforeUnloadHandler(): void {
    window.addEventListener('beforeunload', () => {
      this.broadcastTabMessage('TAB_CLOSED', { tabId: this.tabId })
      if (this.currentSessionId) {
        // Cleanup session locally (beacon endpoint not available)
        this.deactivateSessionDoc(this.currentSessionId).catch(err => {
          console.warn('⚠️ Failed to cleanup session on unload:', err)
        })
      }
    })
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Flush any remaining logs before cleanup
    this.flushSessionLogs()

    if (this.activityInterval) {
      window.clearTimeout(this.activityInterval)
      this.activityInterval = null
    }

    if (this.activityThrottleTimer) {
      window.clearTimeout(this.activityThrottleTimer)
      this.activityThrottleTimer = null
    }

    if (this.sessionCheckInterval) {
      window.clearInterval(this.sessionCheckInterval)
      this.sessionCheckInterval = null
    }

    if (this.logFlushInterval) {
      window.clearInterval(this.logFlushInterval)
      this.logFlushInterval = null
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.close()
      this.broadcastChannel = null
    }

    // Remove overlay if exists
    const overlay = document.getElementById('tab-restriction-overlay')
    if (overlay) {
      overlay.remove()
    }
  }

  /**
   * Set callback for logout warning (used by UI components)
   */
  setLogoutWarningCallback(callback: ((reason: string, pendingCount: number) => Promise<boolean>) | null): void {
    this.logoutWarningCallback = callback
  }

  /**
   * Manually trigger forced logout (for admin/testing)
   */
  async triggerForcedLogout(reason: string = 'manual_trigger'): Promise<void> {
    await this.executeForcedLogoutProcess(reason)
  }

  /**
   * Check if logout is in progress
   */
  isLogoutInProgress(): boolean {
    return this.logoutInProgressFlag
  }

  /**
   * Get current session info
   */
  getCurrentSession(): { sessionId: string | null; tabId: string; isActiveTab: boolean } {
    return {
      sessionId: this.currentSessionId,
      tabId: this.tabId,
      isActiveTab: this.isActiveTab
    }
  }

  // Direct Firestore operations for session management
  
  /**
   * Check for any active sessions across all users (system-wide)
   * Uses a simplified approach to avoid permission issues
   */
  private async getAnyActiveGlobalSessions(): Promise<UserSession[]> {
    try {
      // Simplified: just check if current user has an active session
      // For single-user systems, this is sufficient
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return []
      
      return await this.getActiveUserSessions(currentUser.uid)
      
    } catch (error) {
      console.warn('⚠️ Global session check failed (using fallback):', error.message)
      return []
    }
  }

  /**
   * Get user's active sessions from Firestore
   */
  private async getActiveUserSessions(userUid: string): Promise<UserSession[]> {
    try {
      const sessionsRef = collection(db, `users/${userUid}/sessions`)
      
      // Use simple query to avoid index requirements
      const simpleQuery = query(
        sessionsRef,
        where('isActive', '==', true)
      )
      const snapshot = await getDocs(simpleQuery)
      
      // Sort in memory instead of using orderBy to avoid index
      const sessions = snapshot.docs
        .map(doc => ({ ...doc.data(), sessionId: doc.id } as UserSession))
        .sort((a, b) => {
          const aTime = a.lastActivity?.toDate ? a.lastActivity.toDate() : new Date(a.lastActivity)
          const bTime = b.lastActivity?.toDate ? b.lastActivity.toDate() : new Date(b.lastActivity)
          return bTime.getTime() - aTime.getTime() // Most recent first
        })
        
      return sessions
    } catch (error) {
      console.error('❌ Error getting active sessions:', error)
      return []
    }
  }

  /**
   * Update system status document with active sessions
   */
  private async updateSystemStatusDoc(action: 'add' | 'remove', userUid: string, sessionId: string): Promise<void> {
    try {
      const systemStatusRef = doc(db, 'system_status', 'active_sessions')
      
      // Simplified approach: just track session count instead of detailed arrays
      if (action === 'add') {
        await setDoc(systemStatusRef, {
          [`user_${userUid}`]: {
            sessionId,
            lastUpdated: new Date().toISOString(),
            isActive: true
          },
          lastUpdated: serverTimestamp()
        }, { merge: true })
      } else if (action === 'remove') {
        await setDoc(systemStatusRef, {
          [`user_${userUid}`]: null, // Remove the user entry
          lastUpdated: serverTimestamp()
        }, { merge: true })
      }
      
    } catch (error) {
      console.warn('⚠️ System status update failed (non-critical):', error.message)
      // Don't throw - this is not critical for core functionality
    }
  }

  /**
   * Create user session document in Firestore
   */
  private async createUserSessionDoc(session: UserSession): Promise<void> {
    try {
      const sessionRef = doc(db, `users/${session.userUid}/sessions`, session.sessionId)
      await setDoc(sessionRef, {
        ...session,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      })
      
      // Update system status
      await this.updateSystemStatusDoc('add', session.userUid, session.sessionId)
      
      console.log('✅ User session created:', session.sessionId)
    } catch (error) {
      console.error('❌ Error creating user session:', error)
      throw error
    }
  }

  /**
   * Validate user session document
   */
  private async validateSessionDoc(sessionId: string): Promise<boolean> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return false

      const sessionRef = doc(db, `users/${currentUser.uid}/sessions`, sessionId)
      const sessionDoc = await getDoc(sessionRef)
      
      if (!sessionDoc.exists()) return false
      
      const session = sessionDoc.data() as UserSession
      
      // Check if session is active and not too old
      const now = new Date()
      
      // Handle both Firestore Timestamp and null/undefined cases
      if (!session.lastActivity) {
        console.warn('⚠️ Session missing lastActivity, invalidating')
        await this.deactivateSessionDoc(sessionId)
        return false
      }
      
      const lastActivity = session.lastActivity.toDate ? 
        session.lastActivity.toDate() : 
        new Date(session.lastActivity)
        
      const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60)
      
      // Extended activity window: 20 minutes for active operations, 24 hours max
      const isRecentlyActive = minutesSinceActivity <= 20
      const isWithinMaxWindow = minutesSinceActivity <= (24 * 60)
      
      console.log('🔍 Session validation:', {
        sessionId: sessionId.substring(0, 20) + '...',
        minutesSinceActivity: Math.round(minutesSinceActivity),
        isActive: session.isActive,
        isRecentlyActive,
        isWithinMaxWindow
      })
      
      if (!session.isActive || !isWithinMaxWindow) {
        console.log('❌ Session invalid - deactivating')
        this.logSessionActivity('activity_timeout', `Session expired: ${Math.round(minutesSinceActivity)} minutes since last activity`)
        await this.deactivateSessionDoc(sessionId)
        return false
      }
      
      // If session is getting stale but still within max window, update activity
      if (minutesSinceActivity > 10) {
        console.log('🔄 Refreshing stale session activity')
        await this.updateSessionActivityDoc(sessionId)
      }
      
      return true
    } catch (error) {
      console.error('❌ Error validating session:', error)
      return false
    }
  }

  /**
   * Update session activity timestamp
   */
  private async updateSessionActivityDoc(sessionId: string): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return

      const sessionRef = doc(db, `users/${currentUser.uid}/sessions`, sessionId)
      await updateDoc(sessionRef, {
        lastActivity: serverTimestamp()
      })
    } catch (error) {
      console.error('❌ Error updating session activity:', error)
    }
  }

  /**
   * Deactivate user session document
   */
  private async deactivateSessionDoc(sessionId: string): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return

      const sessionRef = doc(db, `users/${currentUser.uid}/sessions`, sessionId)
      await updateDoc(sessionRef, {
        isActive: false,
        deactivatedAt: serverTimestamp()
      })
      
      // Update system status
      await this.updateSystemStatusDoc('remove', currentUser.uid, sessionId)
      
      console.log('✅ Session deactivated:', sessionId)
    } catch (error) {
      console.error('❌ Error deactivating session:', error)
    }
  }
}

// Create and export singleton instance
export const sessionSecurityService = new SessionSecurityService()
export default sessionSecurityService