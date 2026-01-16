import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { CheckCircle, Settings, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import WorkspaceStep from '../components/onboarding/WorkspaceStep'

interface WorkspaceSetup {
  workspaceId: string
  storageQuota: number
  initialized: boolean
}

const WorkspaceSetup: React.FC = () => {
  const { user, userProfile, refreshUserProfile } = useAuth()
  const [isCompleting, setIsCompleting] = useState(false)

  // Redirect if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Show loading while user profile loads
  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // If workspace is already initialized, redirect to dashboard
  if (userProfile.workspace_initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Workspace Already Set Up</h2>
          <p className="text-gray-600 mb-4">
            Your workspace is already configured and ready for use.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const handleWorkspaceComplete = async (workspaceData: WorkspaceSetup) => {
    try {
      setIsCompleting(true)
      await refreshUserProfile()
      toast.success('Workspace setup completed!')
      // Redirect to dashboard after workspace setup
      setTimeout(() => {
        window.location.href = '/'
      }, 1500)
    } catch (error) {
      console.error('Error completing workspace setup:', error)
      toast.error('Failed to complete workspace setup')
    } finally {
      setIsCompleting(false)
    }
  }

  const handleWorkspaceBack = () => {
    // Navigate back to previous step or home
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Settings className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Workspace Setup
            </h1>
            <p className="text-gray-600">
              Initialize your secure workspace to start processing invoices
            </p>
          </div>

          {/* Warning Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800">
                  Workspace Setup Required
                </h3>
                <p className="text-sm text-amber-700 mt-1">
                  You need to complete workspace initialization before you can upload and process invoices.
                  This creates your secure, isolated storage space.
                </p>
              </div>
            </div>
          </div>

          {/* Workspace Step Component */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <WorkspaceStep 
              onComplete={handleWorkspaceComplete}
              onBack={handleWorkspaceBack}
            />
          </div>

          {/* Help Text */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              This process creates your personal workspace with secure file storage 
              and ensures your data is completely isolated from other users.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WorkspaceSetup