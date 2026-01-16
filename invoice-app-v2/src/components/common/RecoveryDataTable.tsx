import React, { useState, useEffect } from 'react'
import { Download, Archive, Clock, AlertCircle, CheckCircle } from 'lucide-react'
import { forcedLogoutRecoveryService, PendingLogoutData } from '../../services/forcedLogoutRecoveryService'
import toast from 'react-hot-toast'

interface RecoveryDataTableProps {
  onDataProcessed: () => void
}

const RecoveryDataTable: React.FC<RecoveryDataTableProps> = ({ onDataProcessed }) => {
  const [recoveryData, setRecoveryData] = useState<PendingLogoutData[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    loadRecoveryData()
  }, [])

  const loadRecoveryData = async () => {
    try {
      setLoading(true)
      const data = await forcedLogoutRecoveryService.getPendingRecoveryData()
      setRecoveryData(data)
    } catch (error) {
      console.error('Failed to load recovery data:', error)
      toast.error('Failed to load recovery data')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (recoveryId: string) => {
    try {
      setProcessing(recoveryId)
      
      // Mark as downloaded
      await forcedLogoutRecoveryService.downloadPendingData(recoveryId)
      
      // Remove from list
      setRecoveryData(prev => prev.filter(item => item.id !== recoveryId))
      
      toast.success('Data marked for download - processing...')
      
      // Check if all data processed
      if (recoveryData.length <= 1) {
        setTimeout(onDataProcessed, 1000)
      }
    } catch (error) {
      console.error('Failed to download recovery data:', error)
      toast.error('Failed to process download request')
    } finally {
      setProcessing(null)
    }
  }

  const handleArchive = async (recoveryId: string) => {
    try {
      setProcessing(recoveryId)
      
      // Mark as archived
      await forcedLogoutRecoveryService.archivePendingData(recoveryId)
      
      // Remove from list
      setRecoveryData(prev => prev.filter(item => item.id !== recoveryId))
      
      toast.success('Data archived successfully')
      
      // Check if all data processed
      if (recoveryData.length <= 1) {
        setTimeout(onDataProcessed, 1000)
      }
    } catch (error) {
      console.error('Failed to archive recovery data:', error)
      toast.error('Failed to archive data')
    } finally {
      setProcessing(null)
    }
  }

  const formatCaptureTime = (timestamp: any) => {
    try {
      const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
    } catch {
      return 'Unknown'
    }
  }

  const getReasonIcon = (reason: string) => {
    switch (reason) {
      case 'timeout': return <Clock className="w-4 h-4 text-yellow-500" />
      case 'security': return <AlertCircle className="w-4 h-4 text-red-500" />
      default: return <AlertCircle className="w-4 h-4 text-orange-500" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading recovery data...</span>
      </div>
    )
  }

  if (recoveryData.length === 0) {
    return (
      <div className="text-center p-8">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Recovery Data</h3>
        <p className="text-gray-600">All pending data has been processed. You can now proceed with normal usage.</p>
        <button
          onClick={onDataProcessed}
          className="mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
        >
          Continue
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-orange-500" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Recovery Data Available
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Your previous session was interrupted. Please choose how to handle your pending data.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Session Info
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Pending Data
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Captured
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {recoveryData.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    {getReasonIcon(item.captureReason)}
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {item.captureReason.replace('_', ' ').toUpperCase()}
                      </div>
                      <div className="text-xs text-gray-500">
                        Session: {item.sessionId.substring(0, 12)}...
                      </div>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">
                    <div>{item.pendingResults.length} results</div>
                    <div className="text-xs text-gray-500">
                      {item.pendingDownloads.length} ready for download
                    </div>
                  </div>
                </td>

                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">
                    {formatCaptureTime(item.capturedAt)}
                  </div>
                </td>

                <td className="px-6 py-4">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleDownload(item.id!)}
                      disabled={processing === item.id}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      {processing === item.id ? 'Processing...' : 'Download'}
                    </button>
                    
                    <button
                      onClick={() => handleArchive(item.id!)}
                      disabled={processing === item.id}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Archive className="w-4 h-4 mr-1" />
                      Archive
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 bg-yellow-50 border-t border-yellow-200">
        <div className="flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-yellow-600" />
          <span className="text-sm text-yellow-800 font-medium">
            Important: You must process all recovery data before continuing with new work.
          </span>
        </div>
        <div className="text-xs text-yellow-700 mt-1">
          Recovery data expires in 7 days. Download saves to your device, Archive moves to long-term storage.
        </div>
      </div>
    </div>
  )
}

export default RecoveryDataTable