import { collection, doc, addDoc, getDocs, query, where, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'

// Interface for pending logout data
export interface PendingLogoutData {
  id?: string
  userUid: string
  sessionId: string
  pendingResults: any[]
  pendingDownloads: string[]
  captureReason: 'forced_logout' | 'timeout' | 'security'
  capturedAt: Timestamp
  status: 'pending' | 'downloaded' | 'archived'
  expiresAt: Timestamp
}

/**
 * Service for managing forced logout data recovery
 */
class ForcedLogoutRecoveryService {
  
  /**
   * Step 1-3: Capture pending data before forced logout
   */
  async capturePendingData(sessionId: string, reason: PendingLogoutData['captureReason'] = 'forced_logout'): Promise<string | null> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return null

      console.log('🔒 Capturing pending data for forced logout...')

      // Check for pending results from real-time service
      const pendingResults = await this.getPendingResults()
      const pendingDownloads = await this.getPendingDownloads()

      // Only create recovery data if there's something to recover
      if (pendingResults.length === 0 && pendingDownloads.length === 0) {
        console.log('✅ No pending data to capture')
        return null
      }

      // Create expiration date (7 days from now)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const recoveryData: PendingLogoutData = {
        userUid: currentUser.uid,
        sessionId,
        pendingResults,
        pendingDownloads,
        captureReason: reason,
        capturedAt: serverTimestamp() as Timestamp,
        status: 'pending',
        expiresAt: serverTimestamp() as Timestamp
      }

      const docRef = await addDoc(collection(db, 'forced_logout_recovery'), recoveryData)
      console.log('💾 Captured pending data:', docRef.id)
      
      return docRef.id
    } catch (error) {
      console.error('❌ Failed to capture pending data:', error)
      return null
    }
  }

  /**
   * Get pending results from real-time service
   */
  private async getPendingResults(): Promise<any[]> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return []

      // Get active results from user's collection
      const resultsQuery = query(
        collection(db, `users/${currentUser.uid}/invoice_results`),
        where('status', 'in', ['processing', 'completed'])
      )

      const snapshot = await getDocs(resultsQuery)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    } catch (error) {
      console.error('❌ Error getting pending results:', error)
      return []
    }
  }

  /**
   * Get pending downloads (files ready for download)
   */
  private async getPendingDownloads(): Promise<string[]> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return []

      // Get completed results that haven't been downloaded
      const completedQuery = query(
        collection(db, `users/${currentUser.uid}/invoice_results`),
        where('status', '==', 'completed'),
        where('downloaded', '!=', true)
      )

      const snapshot = await getDocs(completedQuery)
      return snapshot.docs.map(doc => doc.id)
    } catch (error) {
      console.error('❌ Error getting pending downloads:', error)
      return []
    }
  }

  /**
   * Check if user has pending recovery data on login
   */
  async getPendingRecoveryData(): Promise<PendingLogoutData[]> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return []

      const recoveryQuery = query(
        collection(db, 'forced_logout_recovery'),
        where('userUid', '==', currentUser.uid),
        where('status', '==', 'pending')
      )

      const snapshot = await getDocs(recoveryQuery)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PendingLogoutData[]
    } catch (error) {
      console.error('❌ Error getting recovery data:', error)
      return []
    }
  }

  /**
   * User chooses to download pending data
   */
  async downloadPendingData(recoveryId: string): Promise<boolean> {
    try {
      const recoveryRef = doc(db, 'forced_logout_recovery', recoveryId)
      
      await updateDoc(recoveryRef, {
        status: 'downloaded',
        processedAt: serverTimestamp()
      })

      console.log('✅ Marked recovery data as downloaded')
      return true
    } catch (error) {
      console.error('❌ Failed to mark as downloaded:', error)
      return false
    }
  }

  /**
   * User chooses to archive pending data
   */
  async archivePendingData(recoveryId: string): Promise<boolean> {
    try {
      const recoveryRef = doc(db, 'forced_logout_recovery', recoveryId)
      
      await updateDoc(recoveryRef, {
        status: 'archived',
        processedAt: serverTimestamp()
      })

      console.log('📦 Marked recovery data as archived')
      return true
    } catch (error) {
      console.error('❌ Failed to archive recovery data:', error)
      return false
    }
  }

  /**
   * Delete recovery data after processing
   */
  async deleteRecoveryData(recoveryId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'forced_logout_recovery', recoveryId))
      console.log('🗑️ Deleted recovery data:', recoveryId)
    } catch (error) {
      console.error('❌ Failed to delete recovery data:', error)
    }
  }

  /**
   * Clean up expired recovery data
   */
  async cleanupExpiredRecoveryData(): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return

      const now = new Date()
      const expiredQuery = query(
        collection(db, 'forced_logout_recovery'),
        where('userUid', '==', currentUser.uid),
        where('expiresAt', '<', now)
      )

      const snapshot = await getDocs(expiredQuery)
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref))
      
      await Promise.all(deletePromises)
      console.log(`🧹 Cleaned up ${snapshot.docs.length} expired recovery entries`)
    } catch (error) {
      console.error('❌ Failed to cleanup expired recovery data:', error)
    }
  }
}

export const forcedLogoutRecoveryService = new ForcedLogoutRecoveryService()