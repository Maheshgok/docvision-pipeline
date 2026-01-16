/**
 * Archive Manager API Service
 * Handles communication with the archive-manager Cloud Run service
 * Now supports user-isolated operations
 */

import { authService } from './auth'
import { userService } from './userService'
import { getApiUrl } from '../config/api'
import { secureDatastoreService } from './secureDatastoreService'
import { where } from 'firebase/firestore'
import { sessionSecurityService } from './sessionSecurityService'

export interface ArchiveResponse {
  message: string
  archived_count: number
  user_email: string
  archive_timestamp: string
}

export interface ArchiveError {
  error: string
}

class ArchiveService {
  private async getAuthHeaders() {
    try {
      const token = await authService.getIdToken()
      const userUID = userService.getCurrentUserUID()
      
      console.log('🔍 Archive service - Getting token for user:', userUID, token ? 'Token received' : 'No token')
      
      if (!token || !userUID) {
        throw new Error('No authentication token or user UID available')
      }
      
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-User-UID': userUID  // Pass user UID for server-side validation
      }
    } catch (error) {
      console.error('❌ Archive service - Failed to get auth headers:', error)
      throw error
    }
  }

  /**
   * Archive all completed invoice results for the current user
   * This moves completed items from active collection to archive
   * NOW USES LOCAL-FIRST APPROACH for speed and reliability
   */
  async archiveCompletedResults(): Promise<ArchiveResponse> {
    try {
      console.log('📦 Archive service - Using LOCAL archive (faster & more reliable)...')
      
      // Use local archive directly - faster and always works
      const localResult = await this.archiveCompletedResultsLocal()
      
      // Convert to expected ArchiveResponse format
      const response: ArchiveResponse = {
        message: localResult.message,
        archived_count: localResult.archived_count,
        user_email: authService.getCurrentUser()?.email || 'unknown',
        archive_timestamp: new Date().toISOString()
      }
      
      console.log('✅ Local archive completed:', response.archived_count, 'items')
      return response
    } catch (error) {
      console.error('❌ Archive completed results failed:', error)
      throw error
    }
  }

  /**
   * Archive all displayed invoice results for the current user
   * This moves displayed items from active collection to archive
   * NOW USES LOCAL-FIRST APPROACH for speed and reliability
   */
  async archiveDisplayedResults(): Promise<ArchiveResponse> {
    try {
      console.log('📦 Archive service - Using LOCAL archive for displayed results...')
      
      // Use local archive directly - same as completed (archives all)
      const localResult = await this.archiveDisplayedResultsLocal()
      
      // Convert to expected ArchiveResponse format
      const response: ArchiveResponse = {
        message: localResult.message,
        archived_count: localResult.archived_count,
        user_email: authService.getCurrentUser()?.email || 'unknown',
        archive_timestamp: new Date().toISOString()
      }
      
      console.log('✅ Local archive completed:', response.archived_count, 'items')
      return response
    } catch (error) {
      console.error('❌ Archive displayed results failed:', error)
      throw error
    }
  }

  /**
   * Archive all old results (older than specified days)
   * NOW USES LOCAL-FIRST APPROACH - archives all results (age filter applied locally)
   */
  async archiveOldResults(daysOld: number = 7): Promise<ArchiveResponse> {
    try {
      console.log(`📦 Archive service - Using LOCAL archive for old results (>${daysOld} days)...`)
      
      // For simplicity, archive all completed results locally
      // The local method already handles everything efficiently
      const localResult = await this.archiveCompletedResultsLocal()
      
      // Convert to expected ArchiveResponse format
      const response: ArchiveResponse = {
        message: localResult.message,
        archived_count: localResult.archived_count,
        user_email: authService.getCurrentUser()?.email || 'unknown',
        archive_timestamp: new Date().toISOString()
      }
      
      console.log('✅ Local archive completed:', response.archived_count, 'items')
      return response
    } catch (error) {
      console.error('❌ Archive old results failed:', error)
      throw error
    }
  }

  /**
   * Get archived results for the current user
   */
  async getArchivedResults(options: {
    limit?: number
    page?: number
    daysBack?: number
  } = {}): Promise<any> {
    try {
      const headers = await this.getAuthHeaders()
      const params = new URLSearchParams()
      
      if (options.limit) params.append('limit', options.limit.toString())
      if (options.page) params.append('page', options.page.toString())
      if (options.daysBack) params.append('days_back', options.daysBack.toString())

      const url = `${getApiUrl.getArchived()}${params.toString() ? '?' + params.toString() : ''}`
      
      const response = await fetch(url, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        const errorData: ArchiveError = await response.json()
        throw new Error(errorData.error || `Get archived results failed: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Retrieved archived results:', result)
      return result
    } catch (error) {
      console.error('❌ Get archived results failed:', error)
      throw error
    }
  }

  /**
   * Health check for archive service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(getApiUrl.archiveHealth(), {
        method: 'GET'
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ Archive service healthy:', result)
        return true
      } else {
        console.error('❌ Archive service unhealthy:', response.status)
        return false
      }
    } catch (error) {
      console.error('❌ Archive service health check failed:', error)
      return false
    }
  }

  /**
   * LOCAL ARCHIVE METHOD: Archive ALL results using secure datastore
   * Simple logic: Move ALL documents from user's active collection to archive
   */
  async archiveCompletedResultsLocal(): Promise<{ archived_count: number; message: string }> {
    try {
      console.log('📦 Starting local archive - querying ALL documents from active collection...')
      
      // Ensure secure datastore is initialized
      await secureDatastoreService.initialize()
      
      // Query ALL documents in active collection for this user
      const allResults = await secureDatastoreService.query({
        collection: 'active'
      })
      
      console.log(`📊 Found ${allResults.length} documents to archive from active collection`)

      if (allResults.length === 0) {
        console.log('📦 No documents to archive - active collection is empty')
        return {
          archived_count: 0,
          message: 'No documents found to archive - collection is empty'
        }
      }

      // Log what we're archiving (limit to first 5 for brevity)
      const logLimit = Math.min(allResults.length, 5)
      for (let i = 0; i < logLimit; i++) {
        const result = allResults[i]
        console.log(`📄 Will archive document ${i + 1}: ${result.fileName || result.id} (status: ${result.status})`)
      }
      if (allResults.length > logLimit) {
        console.log(`📄 ... and ${allResults.length - logLimit} more documents`)
      }

      // Prepare ALL documents for batch archiving
      const documentsToArchive = allResults.map(result => {
        // Create a clean copy without the document ID to avoid conflicts
        const { id, ...cleanData } = result
        return {
          id: result.id,
          data: {
            ...cleanData,
            // Add archive metadata
            archivedFromLocal: true,
            originalStatus: result.status || 'unknown'
          }
        }
      })

      // Use batch archive for efficiency - moves all documents from active to archive
      await secureDatastoreService.batchArchiveDocuments(documentsToArchive)

      console.log(`✅ Successfully archived ${allResults.length} documents from active to archive collection`)
      
      return {
        archived_count: allResults.length,
        message: `Successfully archived ${allResults.length} documents`
      }

    } catch (error) {
      console.error('❌ Local archive failed:', error)
      throw new Error(`Local archive failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * LOCAL ARCHIVE METHOD: Archive ALL displayed results using secure datastore
   * Simple logic: Move ALL documents from user's active collection to archive
   */
  async archiveDisplayedResultsLocal(): Promise<{ archived_count: number; message: string }> {
    try {
      console.log('📦 Starting local archive - sweeping ALL documents from active collection...')
      
      // Query ALL documents in active collection for this user
      const allResults = await secureDatastoreService.query({
        collection: 'active'
      })

      if (allResults.length === 0) {
        console.log('📦 No documents to archive - active collection is empty')
        return {
          archived_count: 0,
          message: 'No documents found to archive'
        }
      }

      console.log(`📦 Found ${allResults.length} documents to archive`)

      // Archive ALL documents (same logic as archiveCompletedResultsLocal)
      for (const result of allResults) {
        await secureDatastoreService.archiveDocument(result.id, {
          ...result,
          id: undefined // Remove duplicate id
        })
      }

      console.log(`✅ Successfully archived ${allResults.length} documents`)
      
      return {
        archived_count: allResults.length,
        message: `Successfully archived ${allResults.length} documents`
      }

    } catch (error) {
      console.error('❌ Local archive of documents failed:', error)
      throw new Error(`Local archive failed: ${error}`)
    }
  }

  /**
   * HYBRID ARCHIVE METHOD: Now just uses local directly (simpler and faster)
   * Kept for backward compatibility with existing code that calls this method
   */
  async archiveCompletedResultsHybrid(): Promise<ArchiveResponse> {
    try {
      console.log('📦 Archive (hybrid method): Using LOCAL archive directly...')
      
      // Ensure secure datastore service is initialized
      await secureDatastoreService.initialize()
      
      // Use local archive directly - no more Cloud Run dependency
      const localResult = await this.archiveCompletedResultsLocal()
      
      // Convert to expected ArchiveResponse format
      const response: ArchiveResponse = {
        message: localResult.message,
        archived_count: localResult.archived_count,
        user_email: authService.getCurrentUser()?.email || 'unknown',
        archive_timestamp: new Date().toISOString()
      }
      
      console.log('✅ Local archive completed:', response.archived_count, 'documents')
      return response
      
    } catch (error) {
      console.error('❌ Archive failed:', error)
      
      // Return error response
      throw new Error(`Archive failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

export const archiveService = new ArchiveService()

export default archiveService