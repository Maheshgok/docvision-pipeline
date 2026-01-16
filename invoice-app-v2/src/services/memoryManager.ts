/**
 * Memory Management Service  
 * Handles blob URL cleanup and prevents memory leaks
 */

export interface BlobUrlInfo {
  url: string
  fileName: string
  size: number
  createdAt: number
  lastAccessed: number
  fileType: string
  category: string
}

export interface MemoryStats {
  totalUrls: number
  totalSize: number // Estimated size in bytes
  oldestUrl: number
  newestUrl: number
  urlsByType: Record<string, number>
  byCategory: Record<string, number>
}

class MemoryManager {
  private static instance: MemoryManager
  private blobUrls: Map<string, BlobUrlInfo> = new Map()
  private cleanupTimer: number | null = null
  
  // Configuration
  private readonly MAX_BLOB_AGE = 3600000 // 1 hour in milliseconds
  private readonly MAX_BLOB_COUNT = 100
  private readonly CLEANUP_INTERVAL = 300000 // 5 minutes
  private readonly MAX_TOTAL_SIZE = 500 * 1024 * 1024 // 500MB estimated limit

  private constructor() {
    this.startPeriodicCleanup()
    this.setupUnloadHandler()
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager()
    }
    return MemoryManager.instance
  }

  /**
   * Register a blob URL for tracking
   */
  registerBlobUrl(url: string, fileName: string, size: number, fileType: string = 'unknown', category: string = 'general'): void {
    const now = Date.now()
    
    const blobInfo: BlobUrlInfo = {
      url,
      fileName,
      size,
      createdAt: now,
      lastAccessed: now,
      fileType: fileType.split('/')[0] || 'unknown', // 'image', 'application', etc.
      category
    }

    this.blobUrls.set(url, blobInfo)
    console.log(`📝 Registered blob URL: ${fileName} (${this.formatSize(size)})`)

    // Trigger cleanup if we exceed limits
    if (this.blobUrls.size > this.MAX_BLOB_COUNT) {
      console.log('⚠️ Max blob count exceeded, triggering cleanup')
      this.performCleanup()
    }

    const stats = this.getMemoryStats()
    if (stats.totalSize > this.MAX_TOTAL_SIZE) {
      console.log('⚠️ Estimated memory limit exceeded, triggering aggressive cleanup')
      this.performAggressiveCleanup()
    }
  }

  /**
   * Update last accessed time for a blob URL
   */
  touchBlobUrl(url: string): void {
    const blobInfo = this.blobUrls.get(url)
    if (blobInfo) {
      blobInfo.lastAccessed = Date.now()
    }
  }

  /**
   * Manually revoke a specific blob URL
   */
  revokeBlobUrl(url: string): boolean {
    const blobInfo = this.blobUrls.get(url)
    if (blobInfo) {
      try {
        URL.revokeObjectURL(url)
        this.blobUrls.delete(url)
        console.log(`🗑️ Revoked blob URL: ${blobInfo.fileName}`)
        return true
      } catch (error) {
        console.error('❌ Error revoking blob URL:', error)
        // Remove from tracking even if revocation failed
        this.blobUrls.delete(url)
        return false
      }
    }
    return false
  }

  /**
   * Revoke all blob URLs for a specific file type
   */
  revokeUrlsByType(fileType: string): number {
    let revokedCount = 0
    
    for (const [url, info] of this.blobUrls) {
      if (info.fileType === fileType) {
        if (this.revokeBlobUrl(url)) {
          revokedCount++
        }
      }
    }
    
    console.log(`🧹 Revoked ${revokedCount} blob URLs of type: ${fileType}`)
    return revokedCount
  }

  /**
   * Perform regular cleanup of old blob URLs
   */
  /**
   * Clean up all tracked blob URLs
   */
  cleanup(): void {
    this.performCleanup()
  }

  /**
   * Track a blob URL for automatic cleanup
   */
  trackBlobUrl(url: string, category: string = 'general', size?: number): void {
    this.registerBlobUrl(url, 'unknown', size || 0, category, category)
  }

  /**
   * Release a specific blob URL
   */
  releaseBlobUrl(url: string): void {
    this.revokeBlobUrl(url)
  }

  /**
   * Get all active blob URLs
   */
  getActiveUrls(): string[] {
    return Array.from(this.blobUrls.keys())
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): MemoryStats {
    const stats: MemoryStats = {
      totalUrls: this.blobUrls.size,
      totalSize: 0,
      oldestUrl: 0,
      newestUrl: 0,
      urlsByType: {},
      byCategory: {}
    }

    let oldestTime = Date.now()
    let newestTime = 0

    for (const [_, info] of this.blobUrls.entries()) {
      stats.totalSize += info.size
      oldestTime = Math.min(oldestTime, info.createdAt)
      newestTime = Math.max(newestTime, info.createdAt)
      
      // Count by category
      if (!stats.byCategory[info.category]) {
        stats.byCategory[info.category] = 0
      }
      stats.byCategory[info.category]++
      
      // Count by file type
      if (!stats.urlsByType[info.fileType]) {
        stats.urlsByType[info.fileType] = 0
      }
      stats.urlsByType[info.fileType]++
    }

    stats.oldestUrl = oldestTime
    stats.newestUrl = newestTime

    return stats
  }

  private performCleanup(): void {
    const now = Date.now()
    let cleanedCount = 0
    
    for (const [url, info] of this.blobUrls) {
      // Clean up URLs older than MAX_BLOB_AGE
      if (now - info.createdAt > this.MAX_BLOB_AGE) {
        if (this.revokeBlobUrl(url)) {
          cleanedCount++
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old blob URLs`)
    }
  }

  /**
   * Perform aggressive cleanup when memory limits are exceeded
   */
  private performAggressiveCleanup(): void {
    console.log('🚨 Performing aggressive memory cleanup')
    
    // Sort by last accessed time (oldest first)
    const urlsByAge = Array.from(this.blobUrls.entries())
      .sort(([,a], [,b]) => a.lastAccessed - b.lastAccessed)
    
    // Remove oldest 30% of URLs
    const toRemove = Math.ceil(urlsByAge.length * 0.3)
    let removedCount = 0
    
    for (let i = 0; i < toRemove && i < urlsByAge.length; i++) {
      const [url] = urlsByAge[i]
      if (this.revokeBlobUrl(url)) {
        removedCount++
      }
    }

    console.log(`🚨 Aggressively cleaned ${removedCount} blob URLs`)
  }

  /**
   * Start periodic cleanup timer
   */
  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup()
    }, this.CLEANUP_INTERVAL)

    console.log('⏰ Started periodic blob URL cleanup')
  }

  /**
   * Setup window unload handler for final cleanup
   */
  private setupUnloadHandler(): void {
    const handleUnload = () => {
      console.log('🚪 Page unloading - cleaning up all blob URLs')
      this.revokeAllUrls()
    }

    // Use multiple events for better coverage
    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    window.addEventListener('unload', handleUnload)

    // Cleanup on visibility change (mobile safari)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Don't revoke all, just clean up old ones
        this.performCleanup()
      }
    })
  }

  /**
   * Revoke all tracked blob URLs
   */
  revokeAllUrls(): number {
    let revokedCount = 0
    
    for (const [url] of this.blobUrls) {
      if (this.revokeBlobUrl(url)) {
        revokedCount++
      }
    }

    console.log(`🗑️ Revoked all ${revokedCount} blob URLs`)
    return revokedCount
  }

  /**
   * Get detailed information about all tracked URLs
   */
  getUrlDetails(): BlobUrlInfo[] {
    return Array.from(this.blobUrls.values())
      .sort((a, b) => b.createdAt - a.createdAt) // Newest first
  }

  /**
   * Check if memory usage is within limits
   */
  isWithinLimits(): { urlCount: boolean; memorySize: boolean; overall: boolean } {
    const stats = this.getMemoryStats()
    
    const urlCount = this.blobUrls.size <= this.MAX_BLOB_COUNT
    const memorySize = stats.totalSize <= this.MAX_TOTAL_SIZE
    
    return {
      urlCount,
      memorySize,
      overall: urlCount && memorySize
    }
  }

  /**
   * Format size in human readable format
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  /**
   * Cleanup and stop all timers
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    
    this.revokeAllUrls()
    console.log('💀 Memory manager destroyed')
  }

  /**
   * Reset for testing purposes
   */
  reset(): void {
    this.revokeAllUrls()
    this.blobUrls.clear()
    console.log('🔄 Memory manager reset')
  }
}

// Export singleton instance
export const memoryManager = MemoryManager.getInstance()
export default memoryManager