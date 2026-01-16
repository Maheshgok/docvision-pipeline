/**
 * Workspace Service for User-Isolated Storage Management
 * Handles workspace initialization, status checks, and validation
 */

import { authService } from './auth'
import { getApiUrl } from '../config/api'

export interface WorkspaceStatus {
  initialized: boolean
  workspaceId?: string
  storageQuota?: number
  storageUsed?: number
  folderStructure?: {
    raw: string
    processed: string
    archived: string
    temp: string
  }
}

class WorkspaceService {
  /**
   * Check if user's workspace is initialized
   */
  async checkWorkspaceStatus(): Promise<WorkspaceStatus> {
    try {
      const user = authService.getCurrentUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      const idToken = await user.getIdToken()
      
      const response = await fetch(getApiUrl.workspaceStatus(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to check workspace status: ${response.status}`)
      }

      const data = await response.json()
      return {
        initialized: data.initialized || false,
        workspaceId: data.workspace?.workspace_id,
        storageQuota: data.workspace?.storage_quota_gb,
        storageUsed: data.workspace?.storage_used_mb,
        folderStructure: data.workspace?.folder_structure
      }
    } catch (error) {
      console.error('❌ Workspace status check failed:', error)
      return { initialized: false }
    }
  }

  /**
   * Initialize user's workspace
   */
  async initializeWorkspace(): Promise<{ success: boolean, workspaceId?: string, error?: string }> {
    try {
      const user = authService.getCurrentUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      const idToken = await user.getIdToken()
      
      const response = await fetch(getApiUrl.initializeWorkspace(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.uid,
          userEmail: user.email
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Workspace initialization failed: ${response.status}`)
      }

      return {
        success: true,
        workspaceId: data.workspaceId
      }
    } catch (error) {
      console.error('❌ Workspace initialization failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Workspace initialization failed'
      }
    }
  }

  /**
   * Validate workspace before file upload
   */
  async validateWorkspaceForUpload(): Promise<{ valid: boolean, error?: string }> {
    const status = await this.checkWorkspaceStatus()
    
    if (!status.initialized) {
      return {
        valid: false,
        error: 'Workspace not initialized. Please complete onboarding setup.'
      }
    }

    return { valid: true }
  }

  /**
   * Get user's storage paths for file operations
   */
  async getStoragePaths(): Promise<{ raw: string, processed: string, archived: string, temp: string } | null> {
    const status = await this.checkWorkspaceStatus()
    return status.folderStructure || null
  }
}

// Export singleton instance
export const workspaceService = new WorkspaceService()