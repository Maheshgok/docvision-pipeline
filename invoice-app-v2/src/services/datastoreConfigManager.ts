/**
 * Datastore Configuration Manager
 * Provides secure, consistent datastore path management with server-side validation
 * 
 * SECURITY: All paths are validated server-side, never trusting client configuration
 */

import { authService } from './auth'
import { userService } from './userService'
import { collectionPathResolver } from './collectionPathResolver'

export interface DatastoreConfig {
  userId: string
  organizationId?: string
  collections: {
    active: string
    archive: string
    backup: string
  }
  permissions: {
    canRead: boolean
    canWrite: boolean
    canDelete: boolean
    canViewOrgData: boolean
  }
  context: {
    userEmail: string
    organizationRole?: string
    lastUpdated: number
    sessionId: string
  }
}

export interface DatastoreOperation {
  operation: 'read' | 'write' | 'archive' | 'delete'
  collection: 'active' | 'archive' | 'backup'
  documentId?: string
  data?: any
}

class DatastoreConfigManager {
  private static instance: DatastoreConfigManager
  private currentConfig: DatastoreConfig | null = null
  private configCache: Map<string, { config: DatastoreConfig; expires: number }> = new Map()
  private readonly CONFIG_TTL = 300000 // 5 minutes

  private constructor() {}

  static getInstance(): DatastoreConfigManager {
    if (!DatastoreConfigManager.instance) {
      DatastoreConfigManager.instance = new DatastoreConfigManager()
    }
    return DatastoreConfigManager.instance
  }

  /**
   * Initialize secure datastore configuration for current user
   * This replaces session storage with server-validated config
   */
  async initializeConfig(): Promise<DatastoreConfig> {
    try {
      const user = authService.getCurrentUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      // Check cache first
      const cacheKey = user.uid
      const cached = this.configCache.get(cacheKey)
      if (cached && cached.expires > Date.now()) {
        this.currentConfig = cached.config
        console.log('📦 Using cached datastore config')
        return cached.config
      }

      // Get user profile with permissions
      const userProfile = await userService.getUserProfile(user.uid)
      if (!userProfile) {
        throw new Error('User profile not found')
      }

      // Resolve collection paths securely
      const pathResult = await collectionPathResolver.resolveCollectionPaths(userProfile)

      // Create secure configuration
      const config: DatastoreConfig = {
        userId: user.uid,
        organizationId: userProfile.organizationId,
        collections: {
          active: pathResult.paths.active,
          archive: pathResult.paths.archive,
          backup: `${pathResult.paths.active}_backup`
        },
        permissions: {
          canRead: true, // Default true for all authenticated users
          canWrite: userProfile.permissions?.canUpload !== false,
          canDelete: userProfile.permissions?.canDelete === true, // Default false
          canViewOrgData: userProfile.permissions?.canViewOrgData === true
        },
        context: {
          userEmail: user.email || '',
          organizationRole: userProfile.organizationRole,
          lastUpdated: Date.now(),
          sessionId: this.generateSecureSessionId()
        }
      }

      // Cache configuration
      this.configCache.set(cacheKey, {
        config,
        expires: Date.now() + this.CONFIG_TTL
      })

      this.currentConfig = config
      console.log('✅ Datastore configuration initialized:', {
        userId: config.userId,
        collections: config.collections,
        permissions: config.permissions
      })

      return config

    } catch (error) {
      console.error('❌ Failed to initialize datastore config:', error)
      throw error
    }
  }

  /**
   * Get collection path for specific operation (with permission validation)
   */
  async getCollectionPath(operation: DatastoreOperation): Promise<string> {
    if (!this.currentConfig) {
      await this.initializeConfig()
    }

    if (!this.currentConfig) {
      throw new Error('No datastore configuration available')
    }

    // Validate permissions
    this.validateOperationPermissions(operation)

    // Return appropriate collection path
    switch (operation.collection) {
      case 'active':
        return this.currentConfig.collections.active
      case 'archive':
        return this.currentConfig.collections.archive
      case 'backup':
        return this.currentConfig.collections.backup
      default:
        throw new Error(`Invalid collection type: ${operation.collection}`)
    }
  }

  /**
   * Validate user has permission for requested operation
   */
  private validateOperationPermissions(operation: DatastoreOperation): void {
    if (!this.currentConfig) {
      throw new Error('No configuration available for permission check')
    }

    const { permissions } = this.currentConfig

    switch (operation.operation) {
      case 'read':
        if (!permissions.canRead) {
          throw new Error('User lacks read permission')
        }
        break
      case 'write':
        if (!permissions.canWrite) {
          throw new Error('User lacks write permission')
        }
        break
      case 'delete':
        if (!permissions.canDelete) {
          throw new Error('User lacks delete permission')
        }
        break
      case 'archive':
        // Archive requires write permission
        if (!permissions.canWrite) {
          throw new Error('User lacks archive permission')
        }
        break
      default:
        throw new Error(`Invalid operation: ${operation.operation}`)
    }
  }

  /**
   * Get current configuration (read-only)
   */
  getCurrentConfig(): DatastoreConfig | null {
    return this.currentConfig ? { ...this.currentConfig } : null
  }

  /**
   * Refresh configuration (useful when user permissions change)
   */
  async refreshConfig(): Promise<DatastoreConfig> {
    this.currentConfig = null
    this.configCache.clear()
    return await this.initializeConfig()
  }

  /**
   * Clear configuration (on logout)
   */
  clearConfig(): void {
    this.currentConfig = null
    this.configCache.clear()
    console.log('🧹 Datastore configuration cleared')
  }

  /**
   * Create secure wrapper for Firestore operations
   */
  async executeSecureOperation<T>(
    operation: DatastoreOperation,
    firestoreCallback: (collectionPath: string) => Promise<T>
  ): Promise<T> {
    try {
      const collectionPath = await this.getCollectionPath(operation)
      console.log(`🔒 Executing ${operation.operation} on ${collectionPath}`)
      
      const result = await firestoreCallback(collectionPath)
      
      // Log successful operation
      console.log(`✅ ${operation.operation} completed successfully`)
      return result
      
    } catch (error) {
      console.error(`❌ Secure operation failed:`, {
        operation: operation.operation,
        collection: operation.collection,
        error: error
      })
      throw error
    }
  }

  /**
   * Generate cryptographically secure session ID
   */
  private generateSecureSessionId(): string {
    const timestamp = Date.now().toString(36)
    const randomBytes = crypto.getRandomValues(new Uint8Array(16))
    const randomString = Array.from(randomBytes, byte => byte.toString(36)).join('')
    return `ds_${timestamp}_${randomString}`
  }

  /**
   * Get configuration statistics for monitoring
   */
  getConfigStats(): {
    isConfigured: boolean
    cacheSize: number
    lastUpdated?: number
    sessionId?: string
  } {
    return {
      isConfigured: !!this.currentConfig,
      cacheSize: this.configCache.size,
      lastUpdated: this.currentConfig?.context.lastUpdated,
      sessionId: this.currentConfig?.context.sessionId
    }
  }
}

// Export singleton instance
export const datastoreConfigManager = DatastoreConfigManager.getInstance()
export default datastoreConfigManager