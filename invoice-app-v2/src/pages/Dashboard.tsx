import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Upload, FileText, User, LogOut, Trash2, Eye, AlertTriangle, Settings } from 'lucide-react'
import FileUpload from '../components/FileUpload'
import InvoiceViewer from '../components/invoice/InvoiceViewer'
import DataEditor from '../components/invoice/DataEditor'
import UsageIndicator from '../components/dashboard/UsageIndicator'
import SecureAnalysisGuard from '../components/security/SecureAnalysisGuard'
import SessionStatus from '../components/security/SessionStatus'
import { analysisService } from '../services/analysisService'
import { InvoiceData, UploadedFile } from '../types'
import toast from 'react-hot-toast'

const Dashboard: React.FC = () => {
  const { user, logout, userProfile } = useAuth()
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null)
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const handleFileUpload = (uploadedFiles: UploadedFile[]) => {
    setUploadedFiles(prev => [...prev, ...uploadedFiles])
    toast.success(`${uploadedFiles.length} file(s) uploaded successfully`)
  }

  const handleFileSelect = (file: UploadedFile) => {
    setSelectedFile(file)
    setInvoiceData(null) // Reset invoice data when switching files
  }

    const processFile = async (file: UploadedFile) => {
    if (isProcessing) return
    
    setIsProcessing(true)
    setSelectedFile(file)

    try {
      // Process through analysis service (includes security and usage checks)
      const result = await analysisService.processInvoiceAnalysis(file.file)
      
      // Update file status and set processed data
      setUploadedFiles(prev =>
        prev.map(f => f.id === file.id ? { ...f, status: 'completed', invoiceData: result } : f)
      )
      setInvoiceData(result)
      toast.success('Invoice processed successfully!')
      
    } catch (error: any) {
      console.error('Processing error:', error)
      setUploadedFiles(prev =>
        prev.map(f => f.id === file.id ? { ...f, status: 'error' } : f)
      )
      
      if (error.message === 'Security restriction: Analysis blocked') {
        // Security error already handled by analysisService
        return
      }
      
      toast.error(error.message || 'Failed to process invoice')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeleteFile = (file: UploadedFile) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== file.id))
    if (selectedFile?.id === file.id) {
      setSelectedFile(null)
      setInvoiceData(null)
    }
    if (file.url) {
      URL.revokeObjectURL(file.url)
    }
    toast.success('File deleted successfully')
  }

  const handleLogout = async () => {
    try {
      await logout()
      toast.success('Signed out successfully')
    } catch (error) {
      toast.error('Failed to sign out')
    }
  }

  const handleDataUpdate = (updatedData: InvoiceData) => {
    setInvoiceData(updatedData)
    if (selectedFile) {
      setUploadedFiles(prev =>
        prev.map(f => 
          f.id === selectedFile.id 
            ? { ...f, invoiceData: updatedData }
            : f
        )
      )
    }
    toast.success('Invoice data updated')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={`bg-white shadow-lg transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-80'}`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {!sidebarCollapsed && (
              <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center">
                  <FileText className="h-6 w-6 mr-2 text-primary" />
                  Invoice Processor
                </h1>
                <p className="text-sm text-gray-600 mt-1">Process and manage invoices</p>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-md hover:bg-gray-100 transition-colors"
            >
              <FileText className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>

        {!sidebarCollapsed && (
          <>
            {/* User Info */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.displayName || user?.email || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user?.email}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1 rounded-md hover:bg-gray-200 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Usage Indicator */}
            {userProfile && (
              <div className="p-4 border-b border-gray-200">
                <UsageIndicator userProfile={userProfile} />
              </div>
            )}

            {/* Session Status */}
            {/* Session Status */}
            <div className="p-4 border-b border-gray-200">
              <SessionStatus />
            </div>

            {/* Demo Analysis Button */}
            {userProfile && userProfile.role !== 'super_admin' && (
              <SecureAnalysisGuard>
                <div className="p-4 border-b border-gray-200">
                  <button
                    onClick={async () => {
                      try {
                        const mockFile = new File(['test'], 'test-invoice.pdf', { type: 'application/pdf' })
                        await analysisService.processInvoiceAnalysis(mockFile)
                        toast.success('Demo analysis completed!')
                        // Refresh user profile to show updated usage
                        window.location.reload()
                      } catch (error: any) {
                        toast.error(error.message || 'Analysis failed')
                      }
                    }}
                    className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    🧪 Demo Analysis (Test Credits)
                  </button>
                </div>
              </SecureAnalysisGuard>
            )}

            {/* File Upload */}
            <SecureAnalysisGuard>
              <div className="p-4 border-b border-gray-200">
                <FileUpload onFilesAdded={handleFileUpload} />
              </div>
            </SecureAnalysisGuard>

            {/* Files List */}
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Uploaded Files ({uploadedFiles.length})
              </h3>
              
              <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                {uploadedFiles.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No files uploaded yet
                  </p>
                ) : (
                  uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                        selectedFile?.id === file.id
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 bg-white'
                      }`}
                      onClick={() => handleFileSelect(file)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          <div className="flex items-center space-x-2 mt-2">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              file.status === 'completed' 
                                ? 'bg-green-100 text-green-800'
                                : file.status === 'processing'
                                ? 'bg-yellow-100 text-yellow-800'
                                : file.status === 'error'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {file.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1 ml-2">
                          {file.status === 'pending' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                processFile(file)
                              }}
                              disabled={isProcessing}
                              className="p-1 text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
                              title="Process file"
                            >
                              <Upload className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleFileSelect(file)
                            }}
                            className="p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="View file"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteFile(file)
                            }}
                            className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                            title="Delete file"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Workspace Initialization Warning */}
        {!userProfile?.workspace_initialized && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 m-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800">
                  Workspace Setup Required
                </h3>
                <p className="text-sm text-amber-700 mt-1">
                  Complete your workspace setup to start uploading invoices.
                </p>
                <div className="mt-3">
                  <button
                    onClick={() => window.location.href = '/workspace-setup'}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-amber-700 bg-amber-100 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Setup Workspace
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex-1 flex">
        {/* Left Panel - Invoice Preview */}
        <div className="flex-1 flex flex-col">
          {selectedFile ? (
            <InvoiceViewer 
              file={selectedFile.file}
              invoiceData={invoiceData}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-100">
              <div className="text-center">
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No file selected
                </h3>
                <p className="text-gray-600">
                  Select a file from the sidebar to view and process it
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Data Editor */}
        {(invoiceData || (selectedFile && selectedFile.status === 'completed')) && (
          <div className="w-96 bg-white shadow-lg border-l border-gray-200">
            <DataEditor
              invoiceData={invoiceData || selectedFile?.invoiceData || null}
              onSave={handleDataUpdate}
            />
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard