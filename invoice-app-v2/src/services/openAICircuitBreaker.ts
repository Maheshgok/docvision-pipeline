/**
 * OpenAI Circuit Breaker
 * Prevents cascade failures and manages OpenAI API call reliability
 */

export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failures detected, calls blocked
  HALF_OPEN = 'half_open' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number    // Number of failures before opening
  resetTimeout: number        // Time before attempting to close circuit (ms)
  monitoringWindow: number    // Time window for failure tracking (ms)
  successThreshold: number    // Successes needed in half-open to close
  maxRetries: number          // Max retry attempts per call
  retryDelayMs: number        // Base delay between retries
}

export interface CircuitBreakerStats {
  state: CircuitState
  failureCount: number
  successCount: number
  lastFailure?: number
  lastSuccess?: number
  totalCalls: number
  totalFailures: number
  totalSuccesses: number
  circuitOpenedAt?: number
  estimatedRecoveryTime?: number
}

export interface OpenAICallResult<T> {
  success: boolean
  data?: T
  error?: Error
  fromCache?: boolean
  retryCount?: number
  responseTime?: number
}

class OpenAICircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount = 0
  private successCount = 0
  private lastFailureTime = 0
  private lastSuccessTime = 0
  private circuitOpenedAt = 0
  
  private totalCalls = 0
  private totalFailures = 0
  private totalSuccesses = 0
  
  // Response cache for fallback
  private responseCache: Map<string, { data: any, timestamp: number, ttl: number }> = new Map()
  
  private readonly config: CircuitBreakerConfig = {
    failureThreshold: 5,           // Open after 5 failures
    resetTimeout: 60000,           // Try to close after 1 minute
    monitoringWindow: 300000,      // Track failures in 5-minute window
    successThreshold: 3,           // Need 3 successes in half-open to close
    maxRetries: 3,                 // Max 3 retry attempts
    retryDelayMs: 1000            // Start with 1 second delay
  }

  /**
   * Execute OpenAI API call with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationKey?: string,
    cacheOptions?: { ttl?: number, useCache?: boolean }
  ): Promise<OpenAICallResult<T>> {
    this.totalCalls++
    const startTime = Date.now()
    
    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN
        this.successCount = 0
        console.log('🔄 Circuit breaker transitioning to HALF_OPEN state')
      } else {
        console.log('⛔ Circuit breaker is OPEN, rejecting call')
        
        // Try to serve from cache
        const cachedResult = this.getCachedResponse<T>(operationKey)
        if (cachedResult) {
          console.log('📦 Serving cached response while circuit is open')
          return {
            success: true,
            data: cachedResult,
            fromCache: true,
            responseTime: Date.now() - startTime
          }
        }
        
        return {
          success: false,
          error: new Error('Circuit breaker is OPEN - OpenAI service temporarily unavailable'),
          responseTime: Date.now() - startTime
        }
      }
    }

    // Execute with retries
    let lastError: Error
    let retryCount = 0
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateRetryDelay(attempt)
          console.log(`🔄 Retrying OpenAI call (${attempt}/${this.config.maxRetries}) after ${delay}ms`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        
        const result = await operation()
        
        // Success!
        this.onSuccess()
        
        // Cache successful response
        if (operationKey && cacheOptions?.ttl) {
          this.cacheResponse(operationKey, result, cacheOptions.ttl)
        }
        
        return {
          success: true,
          data: result,
          retryCount: attempt,
          responseTime: Date.now() - startTime
        }
        
      } catch (error) {
        lastError = error as Error
        retryCount = attempt + 1
        
        // Check if this is a retryable error
        if (!this.isRetryableError(error as Error) || attempt === this.config.maxRetries) {
          break
        }
      }
    }
    
    // All retries failed
    this.onFailure(lastError!)
    
    // Try to serve stale cache as last resort
    const cachedResult = this.getCachedResponse<T>(operationKey, true)
    if (cachedResult) {
      console.log('⚠️ Serving stale cached response after failure')
      return {
        success: true,
        data: cachedResult,
        fromCache: true,
        responseTime: Date.now() - startTime
      }
    }
    
    return {
      success: false,
      error: lastError!,
      retryCount,
      responseTime: Date.now() - startTime
    }
  }

  /**
   * Record successful operation
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now()
    this.totalSuccesses++
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++
      console.log(`✅ Half-open success ${this.successCount}/${this.config.successThreshold}`)
      
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED
        this.failureCount = 0
        this.successCount = 0
        console.log('🟢 Circuit breaker CLOSED - service recovered')
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in normal operation
      this.failureCount = Math.max(0, this.failureCount - 1)
    }
  }

  /**
   * Record failed operation
   */
  private onFailure(error: Error): void {
    this.lastFailureTime = Date.now()
    this.totalFailures++
    this.failureCount++
    
    console.error('❌ OpenAI call failed:', error.message)
    
    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open immediately opens circuit
      this.state = CircuitState.OPEN
      this.circuitOpenedAt = Date.now()
      this.failureCount = this.config.failureThreshold
      console.log('🔴 Circuit breaker OPENED from half-open due to failure')
    } else if (this.failureCount >= this.config.failureThreshold) {
      // Open circuit due to too many failures
      this.state = CircuitState.OPEN
      this.circuitOpenedAt = Date.now()
      console.log(`🔴 Circuit breaker OPENED due to ${this.failureCount} failures`)
    }
  }

  /**
   * Check if circuit should attempt to reset to half-open
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.circuitOpenedAt >= this.config.resetTimeout
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    return this.config.retryDelayMs * Math.pow(2, attempt - 1)
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    // Retryable errors: rate limits, timeouts, temporary server errors
    const retryablePatterns = [
      /rate.?limit/i,
      /timeout/i,
      /503/,
      /502/,
      /500/,
      /network/i,
      /connection/i,
      /temporary/i
    ]
    
    return retryablePatterns.some(pattern => 
      pattern.test(error.message) || pattern.test(error.name)
    )
  }

  /**
   * Cache response for fallback
   */
  private cacheResponse(key: string, data: any, ttl: number): void {
    this.responseCache.set(key, {
      data: JSON.parse(JSON.stringify(data)), // Deep copy
      timestamp: Date.now(),
      ttl
    })
    
    // Cleanup old entries (simple TTL)
    this.cleanupCache()
  }

  /**
   * Get cached response
   */
  private getCachedResponse<T>(key?: string, allowStale = false): T | null {
    if (!key) return null
    
    const cached = this.responseCache.get(key)
    if (!cached) return null
    
    const age = Date.now() - cached.timestamp
    if (!allowStale && age > cached.ttl) {
      this.responseCache.delete(key)
      return null
    }
    
    return cached.data as T
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now()
    for (const [key, entry] of this.responseCache.entries()) {
      if (now - entry.timestamp > entry.ttl * 2) { // Keep stale entries for 2x TTL
        this.responseCache.delete(key)
      }
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const stats: CircuitBreakerStats = {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses
    }
    
    if (this.lastFailureTime > 0) {
      stats.lastFailure = this.lastFailureTime
    }
    
    if (this.lastSuccessTime > 0) {
      stats.lastSuccess = this.lastSuccessTime
    }
    
    if (this.state === CircuitState.OPEN) {
      stats.circuitOpenedAt = this.circuitOpenedAt
      stats.estimatedRecoveryTime = this.circuitOpenedAt + this.config.resetTimeout
    }
    
    return stats
  }

  /**
   * Manually reset circuit (for admin/testing)
   */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.circuitOpenedAt = 0
    console.log('🔄 Circuit breaker manually reset')
  }

  /**
   * Configure circuit breaker parameters
   */
  configure(newConfig: Partial<CircuitBreakerConfig>): void {
    Object.assign(this.config, newConfig)
    console.log('🔧 Circuit breaker configuration updated:', this.config)
  }

  /**
   * Health check for monitoring
   */
  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED || 
           (this.state === CircuitState.HALF_OPEN && this.successCount > 0)
  }

  /**
   * Clear cache and reset statistics
   */
  cleanup(): void {
    this.responseCache.clear()
    this.totalCalls = 0
    this.totalFailures = 0
    this.totalSuccesses = 0
    console.log('🧹 Circuit breaker cleanup complete')
  }
}

// Export singleton instance
export const openAICircuitBreaker = new OpenAICircuitBreaker()
export default openAICircuitBreaker