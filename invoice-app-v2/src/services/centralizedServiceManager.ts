/**
 * Centralized Service Initializer
 * Manages initialization and cleanup of all core services
 */

import { authTokenManager } from './authTokenManager'
import { finalSimplifiedFirestoreService } from './final-simplified-firestore'
import { memoryManager } from './memoryManager'
import { openAICircuitBreaker } from './openAICircuitBreaker'
import { collectionPathResolver } from './collectionPathResolver'
import { secureDatastoreService } from './secureDatastoreService'
import { datastoreConfigManager } from './datastoreConfigManager'

export interface ServiceStats {
  authTokenManager: ReturnType<typeof authTokenManager.getStats>
  circuitBreaker: ReturnType<typeof openAICircuitBreaker.getStats>
  secureDatastore: ReturnType<typeof secureDatastoreService.getServiceStats>
}

class CentralizedServiceManager {
  private initialized = false
  private initializationPromise: Promise<void> | null = null

  /**
   * Initialize all core services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('🔄 Services already initialized')
      return
    }

    if (this.initializationPromise) {
      return this.initializationPromise
    }

    console.log('🚀 Initializing centralized services...')
    
    this.initializationPromise = this.performInitialization()
    return this.initializationPromise
  }

  private async performInitialization(): Promise<void> {
    try {
      // Initialize authentication token management
      console.log('🔐 Initializing authentication token management...')
      authTokenManager.initializeGlobalTokenManagement()

      // Initialize secure datastore configuration
      console.log('🔒 Initializing secure datastore configuration...')
      await datastoreConfigManager.initializeConfig()
      await secureDatastoreService.initialize()

      // Initialize memory management
      console.log('🧠 Initializing memory management...')
      // Memory manager is auto-initialized on first use

      // Configure circuit breaker for OpenAI
      console.log('⚡ Configuring OpenAI circuit breaker...')
      openAICircuitBreaker.configure({
        failureThreshold: 3,     // More conservative threshold
        resetTimeout: 30000,     // Try to reset after 30 seconds
        maxRetries: 2           // Fewer retries to fail faster
      })

      // Validate collection path resolver
      console.log('📂 Validating collection path resolver...')
      // Validate that collection path resolver can be used
      await collectionPathResolver.resolveCollectionPaths()

      this.initialized = true
      console.log('✅ All centralized services initialized successfully')
      
    } catch (error) {
      console.error('❌ Service initialization failed:', error)
      this.initialized = false
      throw error
    } finally {
      this.initializationPromise = null
    }
  }

  /**
   * Initialize real-time listeners (now using final-simplified-firestore directly)
   */
  async initializeSmartListeners(jobId?: string): Promise<void> {
    if (!this.initialized) {
      console.warn('⚠️ Core services not initialized, initializing first...')
      await this.initialize()
    }

    console.log('✅ Using final-simplified-firestore service directly for real-time updates')
  }

  /**
   * Get comprehensive service statistics
   */
  getServiceStats(): ServiceStats {
    return {
      authTokenManager: authTokenManager.getStats(),

      circuitBreaker: openAICircuitBreaker.getStats(),
      secureDatastore: secureDatastoreService.getServiceStats()
    }
  }

  /**
   * Check if all services are healthy
   */
  isHealthy(): boolean {
    if (!this.initialized) return false

    const stats = this.getServiceStats()
    
    return (
      // Token manager should have valid tokens or not be in error state
      stats.authTokenManager.cachedTokens >= 0 &&
      
      // Circuit breaker should be healthy
      openAICircuitBreaker.isHealthy()
    )
  }

  /**
   * Get system health report
   */
  getHealthReport(): {
    healthy: boolean
    services: {
      [key: string]: {
        status: 'healthy' | 'warning' | 'error'
        details: string
      }
    }
  } {
    const stats = this.getServiceStats()
    const services: any = {}

    // Auth Token Manager
    if (stats.authTokenManager.cachedTokens > 0) {
      services.authTokenManager = { status: 'healthy', details: `${stats.authTokenManager.cachedTokens} cached tokens` }
    } else {
      services.authTokenManager = { status: 'warning', details: 'No cached tokens' }
    }

    // Circuit Breaker
    if (openAICircuitBreaker.isHealthy()) {
      services.circuitBreaker = { status: 'healthy', details: `State: ${stats.circuitBreaker.state}, Success rate: ${Math.round((stats.circuitBreaker.totalSuccesses / Math.max(stats.circuitBreaker.totalCalls, 1)) * 100)}%` }
    } else {
      services.circuitBreaker = { status: 'error', details: `State: ${stats.circuitBreaker.state}, Failures: ${stats.circuitBreaker.totalFailures}` }
    }

    return {
      healthy: this.isHealthy(),
      services
    }
  }

  /**
   * Reset all services (useful for testing or recovery)
   */
  async reset(): Promise<void> {
    console.log('🔄 Resetting all services...')
    
    try {
      authTokenManager.clearTokenCache()
      openAICircuitBreaker.reset()
      memoryManager.cleanup()
      
      this.initialized = false
      
      // Reinitialize
      await this.initialize()
      
      console.log('✅ All services reset and reinitialized')
    } catch (error) {
      console.error('❌ Service reset failed:', error)
      throw error
    }
  }

  /**
   * Cleanup all services
   */
  cleanup(): void {
    console.log('🧹 Cleaning up all centralized services...')
    
    try {
      authTokenManager.cleanup()
      memoryManager.cleanup()
      openAICircuitBreaker.cleanup()
      
      this.initialized = false
      console.log('✅ All services cleaned up')
    } catch (error) {
      console.error('❌ Service cleanup error:', error)
    }
  }

  /**
   * Force service reinitialization
   */
  async forceReinitialize(): Promise<void> {
    this.cleanup()
    await this.initialize()
  }

  /**
   * Check initialization status
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

// Export singleton instance
export const centralizedServiceManager = new CentralizedServiceManager()
export default centralizedServiceManager