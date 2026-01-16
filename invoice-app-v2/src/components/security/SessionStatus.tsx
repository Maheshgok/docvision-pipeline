import React, { useEffect, useState } from 'react'
import { sessionSecurityService } from '../../services/sessionSecurityService'
import { Shield, Monitor, Square, Clock, AlertTriangle } from 'lucide-react'

interface SessionStatusProps {
  className?: string
}

/**
 * Component to display current session security status
 */
export const SessionStatus: React.FC<SessionStatusProps> = ({ className = '' }) => {
  const [sessionInfo, setSessionInfo] = useState<{
    sessionId: string | null
    tabId: string
    isActiveTab: boolean
  }>({ sessionId: null, tabId: '', isActiveTab: false })
  const [isSecure, setIsSecure] = useState<boolean>(false)

  useEffect(() => {
    const updateSessionStatus = () => {
      const currentSession = sessionSecurityService.getCurrentSession()
      const canPerformSecure = sessionSecurityService.canPerformSecureOperations()
      
      setSessionInfo(currentSession)
      setIsSecure(canPerformSecure)
    }

    // Initial check
    updateSessionStatus()

    // Update every 10 seconds
    const interval = setInterval(updateSessionStatus, 10000)

    return () => clearInterval(interval)
  }, [])

  const getStatusColor = () => {
    if (!sessionInfo.sessionId) return 'text-red-600 bg-red-50 border-red-200'
    if (!sessionInfo.isActiveTab) return 'text-amber-600 bg-amber-50 border-amber-200'
    if (isSecure) return 'text-green-600 bg-green-50 border-green-200'
    return 'text-gray-600 bg-gray-50 border-gray-200'
  }

  const getStatusIcon = () => {
    if (!sessionInfo.sessionId) return <AlertTriangle className="h-4 w-4" />
    if (!sessionInfo.isActiveTab) return <Square className="h-4 w-4" />
    if (isSecure) return <Shield className="h-4 w-4" />
    return <Monitor className="h-4 w-4" />
  }

  const getStatusText = () => {
    if (!sessionInfo.sessionId) return 'No Session'
    if (!sessionInfo.isActiveTab) return 'Inactive Tab'
    if (isSecure) return 'Secure Session'
    return 'Active'
  }

  const getStatusDescription = () => {
    if (!sessionInfo.sessionId) return 'Please login to start a secure session'
    if (!sessionInfo.isActiveTab) return 'Another tab is currently active for analysis'
    if (isSecure) return 'This tab is secured for analysis operations'
    return 'Session active'
  }

  return (
    <div className={`border rounded-lg p-3 ${getStatusColor()} ${className}`}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          {getStatusIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">
              Session Security
            </h4>
            <span className="text-xs px-2 py-1 rounded-full bg-white/20">
              {getStatusText()}
            </span>
          </div>
          
          <p className="text-xs mt-1 opacity-90">
            {getStatusDescription()}
          </p>
          
          {sessionInfo.sessionId && (
            <div className="mt-2 space-y-1 text-xs opacity-75">
              <div className="flex items-center space-x-1">
                <Monitor className="h-3 w-3" />
                <span>Device: Single login enforced</span>
              </div>
              <div className="flex items-center space-x-1">
                <Square className="h-3 w-3" />
                <span>Tab: {sessionInfo.isActiveTab ? 'Active' : 'Restricted'}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>Session expires after 24h inactivity</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SessionStatus