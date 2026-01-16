/**
 * Test Component for Queue-Based Chunked Processing
 * Add this to your app to test the new chunked processing endpoint
 */

import React, { useState } from 'react'
import { getApiUrl } from '../config/api'
import { authService } from '../services/auth'

const ChunkedProcessingTest: React.FC = () => {
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const testChunkedProcessing = async () => {
    try {
      setProcessing(true)
      setError(null)
      setResult(null)

      // Mock data for testing (simulate a large invoice with 8 line items)
      const testData = {
        image_content: "Sample invoice content with 8 line items...", // This would be base64 image
        invoice_metadata: {
          filename: "test-8-line-items.pdf",
          fileSize: 156789,
          uploadTimestamp: new Date().toISOString()
        },
        user_uid: "test-user-123"
      }

      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      console.log('🚀 Testing queue-based chunked processing...')
      
      const response = await fetch(getApiUrl.processFileChunked(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(testData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `API Error: ${response.status}`)
      }

      const responseData = await response.json()
      console.log('✅ Chunked processing result:', responseData)
      setResult(responseData)

    } catch (err: any) {
      console.error('❌ Chunked processing test failed:', err)
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-center">
        Queue-Based Chunked Processing Test
      </h2>
      
      <div className="mb-4 text-center">
        <button
          onClick={testChunkedProcessing}
          disabled={processing}
          className={`px-6 py-3 rounded-lg font-semibold ${
            processing 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {processing ? '🔄 Processing...' : '🚀 Test Chunked Processing'}
        </button>
      </div>

      {processing && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            <span className="text-blue-800">Testing queue-based chunked processing...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 rounded-lg border-l-4 border-red-500">
          <h3 className="text-red-800 font-semibold">Error:</h3>
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mb-4 p-4 bg-green-50 rounded-lg border-l-4 border-green-500">
          <h3 className="text-green-800 font-semibold mb-2">✅ Success!</h3>
          <div className="text-sm text-green-700 space-y-1">
            <p><strong>Status:</strong> {result.status}</p>
            {result.pipeline_stats && (
              <div className="mt-2">
                <p><strong>Pipeline Stats:</strong></p>
                <ul className="list-disc list-inside ml-4">
                  <li>Line Items: {result.pipeline_stats.total_line_items}</li>
                  <li>Chunks Processed: {result.pipeline_stats.chunks_processed}</li>
                  <li>Journal Entries: {result.pipeline_stats.total_journal_entries}</li>
                  <li>Stages: {result.pipeline_stats.processing_stages}</li>
                </ul>
              </div>
            )}
          </div>
          
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold text-green-800">
              View Full Response
            </summary>
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-2">📋 How it works:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
          <li><strong>Stage 1A:</strong> Extract header data (vendor, dates, totals)</li>
          <li><strong>Stage 1B:</strong> Extract line items table</li>
          <li><strong>Stage 2:</strong> Process line items in chunks of 4-or-less</li>
          <li><strong>Stage 2.5:</strong> Combine journal chunks via data-combiner service</li>
          <li><strong>Stage 3A:</strong> Standardize header nomenclature</li>
          <li><strong>Stage 3B:</strong> Standardize journal entries nomenclature</li>
        </ol>
      </div>
    </div>
  )
}

export default ChunkedProcessingTest