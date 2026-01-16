import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload } from 'lucide-react'

interface FileUploadProps {
  onFilesUploaded: (files: File[]) => void
}

const FileUpload = ({ onFilesUploaded }: FileUploadProps) => {
  const [dragActive, setDragActive] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFilesUploaded(acceptedFiles)
    }
  }, [onFilesUploaded])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 10,
    onDragEnter: () => setDragActive(true),
    onDragLeave: () => setDragActive(false),
    onDropAccepted: () => setDragActive(false),
    onDropRejected: () => setDragActive(false)
  })

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-900 mb-3">Upload Invoices</h3>
      
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
          isDragActive || dragActive
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        
        <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
        
        {isDragActive ? (
          <div>
            <p className="text-sm font-medium text-primary">Drop files here...</p>
            <p className="text-xs text-gray-600 mt-1">
              Release to upload
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-gray-900">
              Drop files here or click to browse
            </p>
            <p className="text-xs text-gray-600 mt-1">
              PNG, JPG, PDF up to 10 files
            </p>
          </div>
        )}
      </div>

      <div className="mt-3">
        <p className="text-xs text-gray-500">
          Supported formats: Images (PNG, JPG, JPEG, GIF, BMP, WebP) and PDF files
        </p>
      </div>
    </div>
  )
}

export default FileUpload