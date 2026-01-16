import React, { useEffect, useState, ReactNode } from 'react'
import { sessionSecurityService } from '../../services/sessionSecurityService'

interface SecureAnalysisGuardProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Security wrapper component that enforces single-device and single-tab restrictions
 * for analysis functionality
 */
export const SecureAnalysisGuard: React.FC<SecureAnalysisGuardProps> = ({
  children,
  fallback
}) => {
  const [canPerformSecureOperations, setCanPerformSecureOperations] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [sessionInfo, setSessionInfo] = useState<{
    sessionId: string | null
    tabId: string
    isActiveTab: boolean
  }>({ sessionId: null, tabId: '', isActiveTab: false })

  useEffect(() => {
    let mounted = true

    const checkSecurity = async () => {
      try {
        const canPerform = sessionSecurityService.canPerformSecureOperations()
        const currentSession = sessionSecurityService.getCurrentSession()
        
        if (mounted) {
          setCanPerformSecureOperations(canPerform)
          setSessionInfo(currentSession)
          setIsLoading(false)
        }
      } catch (error) {
        console.error('❌ Error checking security status:', error)
        if (mounted) {
          setCanPerformSecureOperations(false)
          setIsLoading(false)
        }
      }
    }

    // Initial check
    checkSecurity()

    // Check periodically for session validity
    const interval = setInterval(checkSecurity, 30000) // Every 30 seconds

    // Listen for tab activity changes
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkSecurity()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying session security...</p>
        </div>
      </div>
    )
  }

  if (!canPerformSecureOperations) {
    return (
      fallback || (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <div className="text-red-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          
          <h3 className="text-xl font-semibold text-red-800 mb-2">
            Security Restriction Active
          </h3>
          
          <div className="text-red-700 space-y-2 mb-6">
            {!sessionInfo.sessionId && (
              <p>No active session detected. Please login again.</p>
            )}
            {sessionInfo.sessionId && !sessionInfo.isActiveTab && (
              <div>
                <p>Analysis functionality is active in another tab.</p>
                <p className="text-sm">Close other tabs or refresh this page to continue.</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Refresh Page
            </button>
            
            <div className="text-sm text-red-600 bg-red-100 p-3 rounded border">
              <strong>Security Policy:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Only one device can be signed in at a time</li>
                <li>Only one tab can perform analysis operations</li>
                <li>Sessions expire after 24 hours of inactivity</li>
              </ul>
            </div>
          </div>
        </div>
      )
    )
  }

  return <>{children}</>
}

export default SecureAnalysisGuard