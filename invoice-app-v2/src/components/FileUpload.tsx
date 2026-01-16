import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, AlertCircle } from 'lucide-react'
import { UploadedFile } from '../types'

interface FileUploadProps {
  onFilesAdded: (files: UploadedFile[]) => void
  disabled?: boolean
}

const FileUpload = ({ onFilesAdded, disabled = false }: FileUploadProps) => {
  const [dragActive, setDragActive] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = acceptedFiles.map(file => ({
      id: `${file.name}-${Date.now()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      file,
      status: 'pending',
      uploadedAt: new Date(),
    }))
    
    onFilesAdded(uploadedFiles)
  }, [onFilesAdded])

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
      'application/pdf': ['.pdf'],
    },
    disabled,
    maxSize: 10 * 1024 * 1024, // 10MB
    onDragEnter: () => setDragActive(true),
    onDragLeave: () => setDragActive(false),
  })

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200
          ${isDragActive || dragActive
            ? 'border-primary bg-primary/5 scale-[1.02]'
            : 'border-gray-300 hover:border-gray-400'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}
        `}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center space-y-4">
          <div className={`p-4 rounded-full ${isDragActive ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
            <Upload className="h-8 w-8" />
          </div>
          
          <div>
            <p className="text-lg font-medium text-gray-900">
              {isDragActive ? 'Drop files here' : 'Upload invoice files'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Drag & drop or click to browse (PDF, JPG, PNG)
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Maximum file size: 10MB
            </p>
          </div>
        </div>
      </div>

      {fileRejections.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                File upload errors
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <ul className="list-disc space-y-1 pl-5">
                  {fileRejections.map((rejection, index) => (
                    <li key={index}>
                      <span className="font-medium">{rejection.file.name}</span>
                      {rejection.errors.map((error) => (
                        <span key={error.code} className="ml-2">
                          - {error.message}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FileUpload