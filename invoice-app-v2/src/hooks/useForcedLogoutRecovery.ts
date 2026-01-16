import { useState, useEffect, useCallback } from 'react'
import { sessionSecurityService } from '../services/sessionSecurityService'
import { forcedLogoutRecoveryService, PendingLogoutData } from '../services/forcedLogoutRecoveryService'
import { uploadFreezeService } from '../services/uploadFreezeService'

export const useForcedLogoutRecovery = () => {
  const [hasRecoveryData, setHasRecoveryData] = useState(false)
  const [recoveryData, setRecoveryData] = useState<PendingLogoutData[]>([])
  const [showWarning, setShowWarning] = useState(false)
  const [warningReason, setWarningReason] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [isProcessingRecovery, setIsProcessingRecovery] = useState(false)

  // Check for recovery data on component mount
  useEffect(() => {
    checkForRecoveryData()
  }, [])

  // Set up logout warning callback
  useEffect(() => {
    const warningCallback = async (reason: string, count: number): Promise<boolean> => {
      return new Promise((resolve) => {
        setWarningReason(reason)
        setPendingCount(count)
        setShowWarning(true)
        
        // Auto-resolve after 30 seconds
        setTimeout(() => {
          setShowWarning(false)
          resolve(true)
        }, 30000)
        
        // Store resolve function for manual resolution
        ;(window as any)._logoutResolve = resolve
      })
    }

    sessionSecurityService.setLogoutWarningCallback(warningCallback)
    
    return () => {
      sessionSecurityService.setLogoutWarningCallback(null)
    }
  }, [])

  // Listen for upload freeze events
  useEffect(() => {
    const handleUploadsFrozen = (event: CustomEvent) => {
      console.log('🧊 Uploads frozen:', event.detail)
    }

    const handleUploadsUnfrozen = (event: CustomEvent) => {
      console.log('🔥 Uploads unfrozen:', event.detail)
    }

    window.addEventListener('uploadsFrozen', handleUploadsFrozen as EventListener)
    window.addEventListener('uploadsUnfrozen', handleUploadsUnfrozen as EventListener)

    return () => {
      window.removeEventListener('uploadsFrozen', handleUploadsFrozen as EventListener)
      window.removeEventListener('uploadsUnfrozen', handleUploadsUnfrozen as EventListener)
    }
  }, [])

  const checkForRecoveryData = async () => {
    try {
      const data = await forcedLogoutRecoveryService.getPendingRecoveryData()
      setRecoveryData(data)
      setHasRecoveryData(data.length > 0)
    } catch (error) {
      console.error('Failed to check recovery data:', error)
    }
  }

  const handleWarningProceed = useCallback(() => {
    setShowWarning(false)
    if ((window as any)._logoutResolve) {
      ;(window as any)._logoutResolve(true)
    }
  }, [])

  const handleWarningCancel = useCallback(() => {
    setShowWarning(false)
    if ((window as any)._logoutResolve) {
      ;(window as any)._logoutResolve(false)
    }
  }, [])

  const processRecoveryData = async (recoveryId: string, action: 'download' | 'archive') => {
    try {
      setIsProcessingRecovery(true)
      
      if (action === 'download') {
        await forcedLogoutRecoveryService.downloadPendingData(recoveryId)
      } else {
        await forcedLogoutRecoveryService.archivePendingData(recoveryId)
      }
      
      // Refresh recovery data
      await checkForRecoveryData()
      
      return true
    } catch (error) {
      console.error(`Failed to ${action} recovery data:`, error)
      return false
    } finally {
      setIsProcessingRecovery(false)
    }
  }

  const completeRecovery = () => {
    setHasRecoveryData(false)
    setRecoveryData([])
    // Unfreeze uploads if they were frozen
    uploadFreezeService.unfreezeUploads()
  }

  const triggerManualLogout = async (reason: string = 'manual_test') => {
    await sessionSecurityService.triggerForcedLogout(reason)
  }

  return {
    // Recovery state
    hasRecoveryData,
    recoveryData,
    isProcessingRecovery,
    
    // Warning state
    showWarning,
    warningReason,
    pendingCount,
    
    // Actions
    handleWarningProceed,
    handleWarningCancel,
    processRecoveryData,
    completeRecovery,
    refreshRecoveryData: checkForRecoveryData,
    triggerManualLogout,
    
    // Utils
    uploadStatus: uploadFreezeService.getFreezeStatus(),
    isLogoutInProgress: sessionSecurityService.isLogoutInProgress()
  }
}

export default useForcedLogoutRecovery