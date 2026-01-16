/**
 * Collection Path Resolver Service
 * Ensures consistent routing across user, organization, and legacy collections
 */

import { authService } from './auth'
import { userService, type UserProfile } from './userService'

export enum CollectionType {
  USER_ISOLATED = 'user_isolated',
  ORGANIZATION = 'organization', 
  LEGACY = 'legacy'
}

export interface CollectionPaths {
  active: string
  archive: string
  type: CollectionType
  context: {
    userId?: string
    organizationId?: string
    userEmail?: string
  }
}

export interface PathResolutionResult {
  paths: CollectionPaths
  fallbackPaths?: CollectionPaths[]
  explanation: string
}

class CollectionPathResolver {
  private static instance: CollectionPathResolver
  private pathCache: Map<string, CollectionPaths> = new Map()
  private readonly CACHE_TTL = 300000 // 5 minutes

  private constructor() {}

  static getInstance(): CollectionPathResolver {
    if (!CollectionPathResolver.instance) {
      CollectionPathResolver.instance = new CollectionPathResolver()
    }
    return CollectionPathResolver.instance
  }

  /**
   * Resolve collection paths for current user with fallback strategy
   */
  async resolveCollectionPaths(userProfile?: UserProfile): Promise<PathResolutionResult> {
    try {
      const user = authService.getCurrentUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      // Get user profile if not provided
      if (!userProfile) {
        userProfile = await userService.getUserProfile(user.uid) || undefined
      }

      if (!userProfile) {
        throw new Error('User profile not found')
      }

      // Check cache first
      const cacheKey = this.getCacheKey(userProfile)
      const cached = this.getCachedPaths(cacheKey)
      if (cached) {
        return {
          paths: cached,
          explanation: 'Resolved from cache'
        }
      }

      let primaryPaths: CollectionPaths
      let fallbackPaths: CollectionPaths[] = []
      let explanation: string

      // Resolution priority: Organization → User-isolated → Legacy
      if (userProfile.organizationId) {
        // Organization-based collection
        primaryPaths = {
          active: `organizations/${userProfile.organizationId}/invoice_results`,
          archive: `organizations/${userProfile.organizationId}/invoice_results_archive`,
          type: CollectionType.ORGANIZATION,
          context: {
            userId: user.uid,
            organizationId: userProfile.organizationId,
            userEmail: user.email || ''
          }
        }
        
        // Add user-isolated as fallback
        fallbackPaths.push({
          active: `users/${user.uid}/invoice_results`,
          archive: `users/${user.uid}/invoice_results_archive`,
          type: CollectionType.USER_ISOLATED,
          context: {
            userId: user.uid,
            userEmail: user.email || ''
          }
        })
        
        explanation = `Organization-based collection for org: ${userProfile.organizationId}`
        
      } else {
        // User-isolated collection
        primaryPaths = {
          active: `users/${user.uid}/invoice_results`,
          archive: `users/${user.uid}/invoice_results_archive`,
          type: CollectionType.USER_ISOLATED,
          context: {
            userId: user.uid,
            userEmail: user.email || ''
          }
        }
        
        explanation = `User-isolated collection for user: ${user.uid}`
      }

      // Always add legacy as final fallback
      fallbackPaths.push({
        active: 'invoice_results',
        archive: 'invoice_results_archive',
        type: CollectionType.LEGACY,
        context: {
          userId: user.uid,
          userEmail: user.email || ''
        }
      })

      // Cache the result
      this.setCachedPaths(cacheKey, primaryPaths)

      return {
        paths: primaryPaths,
        fallbackPaths,
        explanation
      }

    } catch (error) {
      console.error('❌ Error resolving collection paths:', error)
      
      // Emergency fallback to legacy collection
      const user = authService.getCurrentUser()
      const emergencyPaths: CollectionPaths = {
        active: 'invoice_results',
        archive: 'invoice_results_archive',
        type: CollectionType.LEGACY,
        context: {
          userId: user?.uid,
          userEmail: user?.email || ''
        }
      }

      return {
        paths: emergencyPaths,
        explanation: `Emergency fallback to legacy collection due to error: ${error}`
      }
    }
  }

  /**
   * Resolve paths for archive operations (backend compatible)
   */
  async resolveArchivePaths(userProfile?: UserProfile): Promise<{ active: string; archive: string }> {
    const result = await this.resolveCollectionPaths(userProfile)
    return {
      active: result.paths.active,
      archive: result.paths.archive
    }
  }

  /**
   * Get paths for real-time listeners with fallback strategy
   */
  async resolveListenerPaths(userProfile?: UserProfile): Promise<CollectionPaths[]> {
    const result = await this.resolveCollectionPaths(userProfile)
    return [result.paths, ...(result.fallbackPaths || [])]
  }

  /**
   * Validate if a path matches expected user context
   */
  validatePathAccess(path: string, userProfile: UserProfile): boolean {
    const user = authService.getCurrentUser()
    if (!user) return false

    // Check organization path access
    if (path.startsWith('organizations/')) {
      const pathOrgId = path.split('/')[1]
      return pathOrgId === userProfile.organizationId
    }

    // Check user-isolated path access  
    if (path.startsWith('users/')) {
      const pathUserId = path.split('/')[1]
      return pathUserId === user.uid
    }

    // Legacy paths are accessible to all authenticated users
    if (path === 'invoice_results' || path === 'invoice_results_archive') {
      return true
    }

    return false
  }

  /**
   * Get cache key for user/org combination
   */
  private getCacheKey(userProfile: UserProfile): string {
    return `${userProfile.uid}_${userProfile.organizationId || 'no_org'}`
  }

  /**
   * Get cached paths if still valid
   */
  private getCachedPaths(cacheKey: string): CollectionPaths | null {
    const cached = this.pathCache.get(cacheKey)
    if (cached) {
      // Simple TTL check - in production would use timestamps
      return cached
    }
    return null
  }

  /**
   * Cache resolved paths
   */
  private setCachedPaths(cacheKey: string, paths: CollectionPaths): void {
    this.pathCache.set(cacheKey, paths)
    
    // Simple cleanup - remove after TTL
    setTimeout(() => {
      this.pathCache.delete(cacheKey)
    }, this.CACHE_TTL)
  }

  /**
   * Clear path cache (useful for testing or when user context changes)
   */
  clearCache(): void {
    this.pathCache.clear()
    console.log('🧹 Collection path cache cleared')
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.pathCache.size,
      keys: Array.from(this.pathCache.keys())
    }
  }
}

// Export singleton instance
export const collectionPathResolver = CollectionPathResolver.getInstance()
export default collectionPathResolver