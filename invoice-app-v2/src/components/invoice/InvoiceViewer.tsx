import { useState, useRef, useEffect } from 'react'
import { InvoiceData } from '../../types'
import { ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react'
import { sessionSecurityService } from '../../services/sessionSecurityService'

interface InvoiceViewerProps {
  file: File | null
  invoiceData?: InvoiceData | null
  className?: string
}

const InvoiceViewer = ({ file, invoiceData: _invoiceData, className = '' }: InvoiceViewerProps) => {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file)
      setImageUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setImageUrl(null)
    }
  }, [file])

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3))
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.25))
  const handleRotate = () => setRotation(prev => (prev + 90) % 360)

  const handleDownload = () => {
    if (file) {
      // Update session activity for download
      sessionSecurityService.updateActivity()
      
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  if (!file) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-50 rounded-lg ${className}`}>
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No file selected</h3>
          <p className="mt-1 text-sm text-gray-500">Upload an invoice to preview it here</p>
        </div>
      </div>
    )
  }

  const isImage = file.type.startsWith('image/')
  const isPDF = file.type === 'application/pdf'

  return (
    <div className={`flex flex-col h-full bg-white rounded-lg border ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <div className="flex items-center space-x-2">
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {file.name}
          </h3>
          <span className="text-xs text-gray-500">
            ({(file.size / 1024 / 1024).toFixed(1)} MB)
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          {isImage && (
            <>
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4 text-gray-600" />
              </button>
              <span className="text-sm text-gray-600 min-w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4 text-gray-600" />
              </button>
              <button
                onClick={handleRotate}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                title="Rotate"
              >
                <RotateCw className="h-4 w-4 text-gray-600" />
              </button>
            </>
          )}
          <button
            onClick={handleDownload}
            className="p-1.5 rounded hover:bg-gray-200 transition-colors"
            title="Download"
          >
            <Download className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-100 p-4"
      >
        {isImage && imageUrl && (
          <div className="flex items-center justify-center min-h-full">
            <img
              src={imageUrl}
              alt={file.name}
              className="max-w-none transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center',
              }}
            />
          </div>
        )}
        
        {isPDF && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="mx-auto h-16 w-16 text-red-500 mb-4">
                <svg fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">PDF Document</h3>
              <p className="mt-1 text-sm text-gray-500">
                PDF preview not available. Click download to view the file.
              </p>
              <button
                onClick={handleDownload}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
              >
                Download PDF
              </button>
            </div>
          </div>
        )}
        
        {!isImage && !isPDF && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="mx-auto h-16 w-16 text-gray-400 mb-4">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">Unsupported File Type</h3>
              <p className="mt-1 text-sm text-gray-500">
                This file type cannot be previewed. Click download to view the file.
              </p>
              <button
                onClick={handleDownload}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
              >
                Download File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default InvoiceViewer