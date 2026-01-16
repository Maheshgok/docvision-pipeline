import React, { useState, useEffect } from 'react'
import { AlertTriangle, Clock, Download, Archive, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface ForcedLogoutWarningProps {
  isVisible: boolean
  reason: string
  pendingDataCount: number
  onProceed: () => void
  onCancel?: () => void
  countdown?: number
}

const ForcedLogoutWarning: React.FC<ForcedLogoutWarningProps> = ({
  isVisible,
  reason,
  pendingDataCount,
  onProceed,
  onCancel,
  countdown = 30
}) => {
  const [timeLeft, setTimeLeft] = useState(countdown)
  const [isAutoLogout, setIsAutoLogout] = useState(false)

  useEffect(() => {
    if (!isVisible) return

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsAutoLogout(true)
          onProceed()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isVisible, onProceed])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex-shrink-0">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Forced Session Logout
            </h3>
            <p className="text-sm text-gray-600">
              Your session will be terminated due to: {reason}
            </p>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">
              Auto-logout in: {timeLeft} seconds
            </span>
          </div>
          
          {pendingDataCount > 0 && (
            <div className="text-sm text-yellow-700">
              <strong>{pendingDataCount}</strong> pending results will be safely captured for recovery
            </div>
          )}
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Download className="w-4 h-4 text-green-500" />
            <span>Pending data will be available for download on next login</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Archive className="w-4 h-4 text-blue-500" />
            <span>Data expires in 7 days if not processed</span>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onProceed}
            disabled={isAutoLogout}
            className={`flex-1 px-4 py-2 rounded-lg text-white font-medium ${
              isAutoLogout 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isAutoLogout ? 'Logging out...' : 'Logout Now'}
          </button>
          
          {onCancel && timeLeft > 5 && (
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="mt-3 text-xs text-gray-500 text-center">
          Uploads are temporarily frozen during logout process
        </div>
      </div>
    </div>
  )
}

export default ForcedLogoutWarning