/**
 * Modern Invoice Processing Dashboard
 * Uses new tenant-isolated, job-driven architecture with real-time progress tracking
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Upload, 
  Download, 
  FileText, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  X, 
  LogOut, 
  Eye,
  RefreshCw,
  Activity
} from 'lucide-react';
import toast from 'react-hot-toast';
import { orchestratorApiService, ProcessInvoiceResponse } from '../services/orchestratorApiService';

interface UploadedFile {
  id: string;
  file: File;
  jobId?: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
  uploadedAt: string;
}

const ModernInvoiceProcessingDashboard: React.FC = () => {
  const { user, userProfile, logout, checkUsageLimits, validateFileSize } = useAuth();
  
  // State management
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  
  // Progress monitoring - use ReturnType to get correct interval type
  const progressMonitorsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Cleanup progress monitors on unmount
  useEffect(() => {
    return () => {
      progressMonitorsRef.current.forEach(timeout => clearInterval(timeout));
      progressMonitorsRef.current.clear();
    };
  }, []);

  /**
   * Handle file upload and processing
   */
  const handleFileUpload = useCallback(async (selectedFiles: FileList) => {
    if (!user) {
      toast.error('Please log in to upload files');
      return;
    }

    // Validate usage limits
    try {
      await checkUsageLimits?.();
    } catch (error: any) {
      toast.error(error.message || 'Usage limit exceeded');
      return;
    }

    const newFiles: UploadedFile[] = [];

    // Process each file
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Validate file size
      try {
        await validateFileSize?.(file.size);
      } catch (error: any) {
        toast.error(`${file.name}: ${error.message}`);
        continue;
      }

      // Create file entry
      const fileId = `file_${Date.now()}_${i}`;
      const uploadedFile: UploadedFile = {
        id: fileId,
        file,
        status: 'uploading',
        progress: 0,
        uploadedAt: new Date().toISOString()
      };

      newFiles.push(uploadedFile);
    }

    // Update state with new files
    setFiles(prev => [...prev, ...newFiles]);

    // Process each file
    for (const uploadedFile of newFiles) {
      try {
        await processFile(uploadedFile);
      } catch (error) {
        console.error('❌ File processing error:', error);
        updateFileStatus(uploadedFile.id, 'failed', 0, undefined, error instanceof Error ? error.message : 'Processing failed');
      }
    }
  }, [user, checkUsageLimits, validateFileSize]);

  /**
   * Process individual file through new pipeline
   */
  const processFile = async (uploadedFile: UploadedFile) => {
    try {
      // Simulate file upload to GCS (in real implementation, this would upload to GCS first)
      const gcsPath = `gs://invoice-processing-bucket/tenant_${user?.uid}/uploads/${uploadedFile.file.name}`;
      
      updateFileStatus(uploadedFile.id, 'processing', 5);

      // Initiate processing through orchestrator
      const processResponse: ProcessInvoiceResponse = await orchestratorApiService.processInvoice({
        gcs_input_path: gcsPath,
        original_filename: uploadedFile.file.name,
        file_size_bytes: uploadedFile.file.size
      });

      // Update file with job ID
      setFiles(prev => prev.map(f => 
        f.id === uploadedFile.id 
          ? { ...f, jobId: processResponse.job_id }
          : f
      ));

      // Start progress monitoring
      startProgressMonitoring(uploadedFile.id, processResponse.job_id);

      toast.success(`Processing started: ${processResponse.job_id.substring(0, 12)}...`);

    } catch (error) {
      console.error('❌ Process file error:', error);
      throw error;
    }
  };

  /**
   * Start monitoring job progress
   */
  const startProgressMonitoring = (fileId: string, jobId: string) => {
    // Clear any existing monitor
    const existingMonitor = progressMonitorsRef.current.get(fileId);
    if (existingMonitor) {
      clearInterval(existingMonitor);
    }

    // Start new progress monitor
    const monitor = setInterval(async () => {
      try {
        const progress = await orchestratorApiService.getJobProgress(jobId);
        
        updateFileStatus(fileId, 'processing', progress.percentage);

        // Check if completed
        if (progress.percentage >= 100 || progress.current_phase === 'COMPLETED') {
          // Get final results
          try {
            const standardizedResult = await orchestratorApiService.getStandardizedResult(jobId);
            updateFileStatus(fileId, 'completed', 100, standardizedResult);
          } catch {
            // Fallback to extraction result if standardized not available yet
            try {
              const extractionResult = await orchestratorApiService.getExtractionResult(jobId);
              updateFileStatus(fileId, 'completed', 100, extractionResult);
            } catch {
              updateFileStatus(fileId, 'completed', 100, { job_id: jobId, status: 'completed' });
            }
          }

          // Clear monitor
          clearInterval(monitor);
          progressMonitorsRef.current.delete(fileId);
          
          toast.success('Processing completed!');
        }

        // Check if failed
        if (progress.current_phase.includes('FAILED')) {
          updateFileStatus(fileId, 'failed', progress.percentage, undefined, `Processing failed at ${progress.current_phase}`);
          clearInterval(monitor);
          progressMonitorsRef.current.delete(fileId);
          toast.error('Processing failed');
        }

      } catch (error) {
        console.error('❌ Progress monitoring error:', error);
        // Don't clear monitor immediately - might be temporary network issue
      }
    }, 3000); // Poll every 3 seconds

    progressMonitorsRef.current.set(fileId, monitor);
  };

  /**
   * Update file status
   */
  const updateFileStatus = (fileId: string, status: UploadedFile['status'], progress: number, result?: any, error?: string) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status, progress, result, error }
        : f
    ));
  };

  /**
   * Handle drag and drop
   */
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  /**
   * Handle file input change
   */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
    }
  }, [handleFileUpload]);

  /**
   * View processing result
   */
  const viewResult = (file: UploadedFile) => {
    if (file.result) {
      setSelectedResult(file.result);
      setShowResultModal(true);
    }
  };

  /**
   * Download result as JSON
   */
  const downloadResult = (file: UploadedFile) => {
    if (!file.result) return;
    
    const dataStr = JSON.stringify(file.result, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `${file.file.name}_result.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  /**
   * Remove file from list
   */
  const removeFile = (fileId: string) => {
    // Clear any progress monitor
    const monitor = progressMonitorsRef.current.get(fileId);
    if (monitor) {
      clearInterval(monitor);
      progressMonitorsRef.current.delete(fileId);
    }

    // Remove file from state
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  /**
   * Get status icon
   */
  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
        return <Upload className="w-4 h-4 text-blue-500" />;
      case 'processing':
        return <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  /**
   * Get status color
   */
  const getStatusColor = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
        return 'bg-blue-500';
      case 'processing':
        return 'bg-yellow-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Please log in</h2>
          <p className="text-gray-600">You need to be logged in to access this dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Activity className="w-8 h-8 text-indigo-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Modern Invoice Processing</h1>
                <p className="text-sm text-gray-500">Tenant-isolated, job-driven pipeline</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{userProfile?.displayName || user.email}</p>
                <p className="text-xs text-gray-500">Tenant: {user.uid.substring(0, 8)}...</p>
              </div>
              <button
                onClick={logout}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Upload Section */}
        <div className="mb-8">
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-indigo-500 bg-indigo-50' 
                : 'border-gray-300 bg-white hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <div className="mt-4">
              <label htmlFor="file-upload" className="cursor-pointer">
                <span className="mt-2 block text-sm font-medium text-gray-900">
                  Drop files here or click to upload
                </span>
                <span className="mt-1 block text-sm text-gray-500">
                  PDF, PNG, JPG up to 20MB
                </span>
              </label>
              <input
                id="file-upload"
                name="file-upload"
                type="file"
                className="sr-only"
                multiple
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <div className="bg-white shadow-sm rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Processing Queue</h3>
              <p className="text-sm text-gray-500">Real-time progress tracking</p>
            </div>
            
            <div className="divide-y divide-gray-200">
              {files.map((file) => (
                <div key={file.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(file.status)}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{file.file.name}</p>
                        <p className="text-xs text-gray-500">
                          {(file.file.size / 1024 / 1024).toFixed(2)} MB
                          {file.jobId && ` • Job: ${file.jobId.substring(0, 12)}...`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      {/* Progress */}
                      <div className="w-32">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${getStatusColor(file.status)}`}
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-8">{file.progress}%</span>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center space-x-2">
                        {file.status === 'completed' && file.result && (
                          <>
                            <button
                              onClick={() => viewResult(file)}
                              className="p-1 text-indigo-600 hover:text-indigo-900"
                              title="View Result"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => downloadResult(file)}
                              className="p-1 text-green-600 hover:text-green-900"
                              title="Download Result"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        
                        <button
                          onClick={() => removeFile(file.id)}
                          className="p-1 text-red-600 hover:text-red-900"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Error message */}
                  {file.error && (
                    <div className="mt-2">
                      <p className="text-sm text-red-600">{file.error}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        {files.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <FileText className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Files</dt>
                      <dd className="text-lg font-medium text-gray-900">{files.length}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <RefreshCw className="h-6 w-6 text-yellow-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Processing</dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {files.filter(f => f.status === 'processing' || f.status === 'uploading').length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CheckCircle className="h-6 w-6 text-green-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {files.filter(f => f.status === 'completed').length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-6 w-6 text-red-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Failed</dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {files.filter(f => f.status === 'failed').length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Result Modal */}
      {showResultModal && selectedResult && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Processing Result</h3>
              <button
                onClick={() => setShowResultModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              <pre className="bg-gray-100 p-4 rounded text-xs overflow-x-auto">
                {JSON.stringify(selectedResult, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModernInvoiceProcessingDashboard;