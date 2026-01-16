import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { workspaceService } from '../../services/workspaceService'
import { HardDrive, FolderPlus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface WorkspaceStepProps {
  onComplete: (workspaceData: WorkspaceSetup) => void
  onBack: () => void
}

interface WorkspaceSetup {
  workspaceId: string
  storageQuota: number
  initialized: boolean
}

const WorkspaceStep: React.FC<WorkspaceStepProps> = ({ onComplete, onBack }) => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initializeWorkspace = async () => {
    if (!user) return
    
    setLoading(true)
    setError(null)

    try {
      const result = await workspaceService.initializeWorkspace()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to initialize workspace')
      }
      
      setInitialized(true)
      toast.success('Workspace initialized successfully!')
      
      // Proceed to next step
      setTimeout(() => {
        onComplete({
          workspaceId: result.workspaceId || '',
          storageQuota: 5,
          initialized: true
        })
      }, 1500)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize workspace'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <HardDrive className="mx-auto h-12 w-12 text-blue-600 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Set Up Your Workspace
        </h2>
        <p className="text-gray-600">
          We'll create your isolated storage space for secure file processing
        </p>
      </div>

      <div className="bg-blue-50 rounded-lg p-6 space-y-4">
        <h3 className="font-semibold text-blue-900">Your workspace will include:</h3>
        <ul className="space-y-2 text-blue-800">
          <li className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4" />
            Isolated file storage (5GB quota)
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Secure processing environment
          </li>
          <li className="flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            Automatic file organization
          </li>
        </ul>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {initialized ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>Workspace initialized successfully! Proceeding to next step...</span>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={onBack}
            disabled={loading}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Back
          </button>
          
          <button
            onClick={initializeWorkspace}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Initializing...
              </>
            ) : (
              'Initialize Workspace'
            )}
          </button>
        </div>
      )}

      <div className="text-sm text-gray-500 text-center">
        This process is secure and only creates storage for your account
      </div>
    </div>
  )
}

export default WorkspaceStep