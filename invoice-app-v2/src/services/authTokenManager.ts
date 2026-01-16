/**
 * Centralized Authentication Token Manager
 * Consolidates all token management logic and provides automatic refresh
 */

import { authService } from './auth'
import { User } from 'firebase/auth'

export interface TokenInfo {
  token: string
  expiresAt: number
  refreshedAt: number
  userId: string
}

export interface TokenRefreshConfig {
  autoRefreshEnabled: boolean
  refreshThresholdMs: number
  maxRetries: number
  retryDelayMs: number
}

class AuthTokenManager {
  private tokenCache: Map<string, TokenInfo> = new Map()
  private refreshPromises: Map<string, Promise<string>> = new Map()
  private refreshTimers: Map<string, number> = new Map()
  
  private config: TokenRefreshConfig = {
    autoRefreshEnabled: true,
    refreshThresholdMs: 5 * 60 * 1000, // Refresh 5 minutes before expiry
    maxRetries: 3,
    retryDelayMs: 1000
  }

  /**
   * Get valid token for current user with automatic refresh
   */
  async getValidToken(): Promise<string> {
    const user = authService.getCurrentUser()
    if (!user?.uid) {
      throw new Error('User not authenticated')
    }

    return this.getValidTokenForUser(user)
  }

  /**
   * Get valid token for specific user
   */
  async getValidTokenForUser(user: User): Promise<string> {
    const userId = user.uid
    
    // Check if we already have a refresh in progress for this user
    const existingRefresh = this.refreshPromises.get(userId)
    if (existingRefresh) {
      console.log('🔄 Token refresh already in progress for user:', userId)
      return existingRefresh
    }

    // Check cached token
    const cachedToken = this.tokenCache.get(userId)
    if (cachedToken && this.isTokenValid(cachedToken)) {
      return cachedToken.token
    }

    // Need to refresh token
    const refreshPromise = this.refreshTokenForUser(user)
    this.refreshPromises.set(userId, refreshPromise)

    try {
      const token = await refreshPromise
      return token
    } finally {
      this.refreshPromises.delete(userId)
    }
  }

  /**
   * Refresh token for specific user with retry logic
   */
  private async refreshTokenForUser(user: User, retryCount = 0): Promise<string> {
    try {
      console.log('🔄 Refreshing token for user:', user.uid)
      
      // Force token refresh
      const token = await user.getIdToken(true)
      const tokenResult = await user.getIdTokenResult(true)
      
      const tokenInfo: TokenInfo = {
        token,
        expiresAt: new Date(tokenResult.expirationTime).getTime(),
        refreshedAt: Date.now(),
        userId: user.uid
      }
      
      // Cache the token
      this.tokenCache.set(user.uid, tokenInfo)
      
      // Setup auto-refresh timer
      this.scheduleTokenRefresh(user, tokenInfo)
      
      console.log('✅ Token refreshed successfully for user:', user.uid)
      return token
      
    } catch (error) {
      console.error('❌ Token refresh failed:', error)
      
      if (retryCount < this.config.maxRetries) {
        console.log(`🔄 Retrying token refresh (${retryCount + 1}/${this.config.maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs * (retryCount + 1)))
        return this.refreshTokenForUser(user, retryCount + 1)
      }
      
      throw new Error(`Failed to refresh token after ${this.config.maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Check if token is still valid (not expired and not close to expiry)
   */
  private isTokenValid(tokenInfo: TokenInfo): boolean {
    const now = Date.now()
    const timeUntilExpiry = tokenInfo.expiresAt - now
    return timeUntilExpiry > this.config.refreshThresholdMs
  }

  /**
   * Schedule automatic token refresh before expiry
   */
  private scheduleTokenRefresh(user: User, tokenInfo: TokenInfo): void {
    // Clear existing timer
    const existingTimer = this.refreshTimers.get(user.uid)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    if (!this.config.autoRefreshEnabled) {
      return
    }

    const refreshTime = tokenInfo.expiresAt - this.config.refreshThresholdMs - Date.now()
    const timer = setTimeout(async () => {
      try {
        console.log('⏰ Auto-refreshing token for user:', user.uid)
        await this.refreshTokenForUser(user)
      } catch (error) {
        console.error('❌ Auto-refresh failed:', error)
      }
    }, Math.max(refreshTime, 1000)) as unknown as number // Type cast for browser compatibility // At least 1 second delay

    this.refreshTimers.set(user.uid, timer)
    console.log(`⏰ Scheduled token refresh for user ${user.uid} in ${Math.round(refreshTime / 1000)}s`)
  }

  /**
   * Get cached token info (for debugging)
   */
  getTokenInfo(userId?: string): TokenInfo | undefined {
    const uid = userId || authService.getCurrentUser()?.uid
    return uid ? this.tokenCache.get(uid) : undefined
  }

  /**
   * Force token refresh for current user
   */
  async forceRefresh(): Promise<string> {
    const user = authService.getCurrentUser()
    if (!user?.uid) {
      throw new Error('User not authenticated')
    }

    // Clear cached token to force refresh
    this.tokenCache.delete(user.uid)
    return this.getValidTokenForUser(user)
  }

  /**
   * Configure token management settings
   */
  configure(config: Partial<TokenRefreshConfig>): void {
    this.config = { ...this.config, ...config }
    console.log('🔧 Token manager configuration updated:', this.config)
  }

  /**
   * Clear cached token for user (useful for logout)
   */
  clearTokenCache(userId?: string): void {
    if (userId) {
      this.tokenCache.delete(userId)
      const timer = this.refreshTimers.get(userId)
      if (timer) {
        clearTimeout(timer)
        this.refreshTimers.delete(userId)
      }
    } else {
      // Clear all cached tokens
      this.tokenCache.clear()
      this.refreshTimers.forEach(timer => clearTimeout(timer))
      this.refreshTimers.clear()
    }
    console.log('🧹 Token cache cleared')
  }

  /**
   * Get statistics about token management
   */
  getStats(): {
    cachedTokens: number
    activeRefreshes: number
    scheduledRefreshes: number
  } {
    return {
      cachedTokens: this.tokenCache.size,
      activeRefreshes: this.refreshPromises.size,
      scheduledRefreshes: this.refreshTimers.size
    }
  }

  /**
   * Validate token format and claims
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      // Basic JWT format validation
      const parts = token.split('.')
      if (parts.length !== 3) {
        return false
      }

      // Decode payload to check expiry
      const payload = JSON.parse(atob(parts[1]))
      const now = Math.floor(Date.now() / 1000)
      
      return payload.exp > now
    } catch (error) {
      console.error('Token validation failed:', error)
      return false
    }
  }

  /**
   * Setup global token refresh for all authenticated users
   */
  initializeGlobalTokenManagement(): void {
    console.log('🚀 Initializing global token management')
    
    // Listen for auth state changes
    authService.onAuthStateChanged((user) => {
      if (user) {
        console.log('👤 User signed in, setting up token management:', user.uid)
        // Get initial token and setup auto-refresh
        this.getValidTokenForUser(user).catch(error => {
          console.error('Failed to initialize token for user:', error)
        })
      } else {
        console.log('🔓 User signed out, clearing token cache')
        this.clearTokenCache()
      }
    })
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.clearTokenCache()
    this.refreshPromises.clear()
    console.log('🧹 Auth token manager cleanup complete')
  }
}

// Export singleton instance
export const authTokenManager = new AuthTokenManager()
export default authTokenManager