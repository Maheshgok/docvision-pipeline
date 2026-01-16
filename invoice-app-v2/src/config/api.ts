/**
 * Centralized API Configuration
 * Manages all external service URLs and endpoints
 * 
 * Project: watch-mail-trial
 * URL Pattern: https://{service}-812016027146.asia-south1.run.app
 */

export const API_CONFIG = {
  // Cloud Run Services - watch-mail-trial project (812016027146)
  INITIAL_API_URL: import.meta.env.VITE_INITIAL_API_URL || 'https://initial-api-812016027146.asia-south1.run.app',
  ARCHIVE_API_URL: import.meta.env.VITE_ARCHIVE_API_URL || 'https://archive-manager-812016027146.asia-south1.run.app',
  QUEUE_API_URL: import.meta.env.VITE_QUEUE_API_URL || 'https://queue-processor-812016027146.asia-south1.run.app',
  
  // New Orchestrator Service (status coordination only - job creation is in initial-api)
  ORCHESTRATOR_URL: import.meta.env.VITE_ORCHESTRATOR_URL || 'https://orchestrator-service-812016027146.asia-south1.run.app',
  
  // Pipeline Services
  DATA_EXTRACTOR_URL: import.meta.env.VITE_DATA_EXTRACTOR_URL || 'https://data-extractor-v2-812016027146.asia-south1.run.app',
  FIELD_STANDARDIZER_URL: import.meta.env.VITE_FIELD_STANDARDIZER_URL || 'https://field-standardizer-v2-812016027146.asia-south1.run.app',
  ENRICHMENT_WORKER_URL: import.meta.env.VITE_ENRICHMENT_WORKER_URL || 'https://enrichment-worker-812016027146.asia-south1.run.app',
  
  // Legacy URLs (deprecated - kept for backward compatibility)
  PIPELINE_ORCHESTRATOR_URL: import.meta.env.VITE_PIPELINE_ORCHESTRATOR_URL || 'https://pipeline-orchestrator-812016027146.asia-south1.run.app',
  DATA_COMBINER_URL: import.meta.env.VITE_DATA_COMBINER_URL || 'https://data-combiner-812016027146.asia-south1.run.app',
  
  // Endpoints
  ENDPOINTS: {
    // Initial API
    UPLOAD_INVOICE: '/upload_invoice',
    HEALTH: '/health',
    POLL_RESULT: '/poll-result',
    TRIGGER_PROCESSING: '/trigger-processing',
    CLOUD_TASKS_STATUS: '/cloud-tasks/status',
    CLOUD_TASKS_QUEUE_STATS: '/cloud-tasks/queue-stats',
    SIGNED_URL: '/signed-url',
    INITIALIZE_WORKSPACE: '/initialize-workspace',
    WORKSPACE_STATUS: '/workspace-status',
    
    // Archive API
    ARCHIVE_COMPLETED: '/archive-completed',
    ARCHIVE_DISPLAYED: '/archive-displayed', 
    ARCHIVE_ALL_OLD: '/archive-all-old',
    GET_ARCHIVED: '/get-archived',
    
    // Queue API
    PROCESS_FILE: '/process-file',
    PROCESS_FILE_CHUNKED: '/process-invoice-chunked',
    GET_RESULTS: '/get-results',
    JOB_STATUS: '/job-status',
    QUEUE_STATUS: '/queue-status',
    
    // Orchestrated Pipeline Services
    PROCESS_INVOICE: '/process-invoice',
    STANDARDIZE: '/standardize',
    COMBINE_DATA: '/combine-data'
  }
} as const

// Helper function to build full URLs
export const buildApiUrl = (service: keyof typeof API_CONFIG, endpoint?: string) => {
  const baseUrl = API_CONFIG[service]
  if (typeof baseUrl === 'string' && endpoint) {
    return `${baseUrl}${endpoint}`
  }
  return baseUrl
}

// Type-safe endpoint builders
export const getApiUrl = {
  // Initial API endpoints
  uploadInvoice: () => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.UPLOAD_INVOICE}`,
  health: () => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.HEALTH}`,
  pollResult: (requestId: string) => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.POLL_RESULT}/${requestId}`,
  triggerProcessing: (requestId: string) => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.TRIGGER_PROCESSING}/${requestId}`,
  cloudTasksStatus: (jobId: string) => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.CLOUD_TASKS_STATUS}/${jobId}`,
  cloudTasksQueueStats: () => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.CLOUD_TASKS_QUEUE_STATS}`,
  signedUrl: (path?: string) => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.SIGNED_URL}${path ? `?path=${path}` : ''}`,
  initializeWorkspace: () => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.INITIALIZE_WORKSPACE}`,
  workspaceStatus: () => `${API_CONFIG.INITIAL_API_URL}${API_CONFIG.ENDPOINTS.WORKSPACE_STATUS}`,
  
  // Archive API endpoints  
  archiveCompleted: () => `${API_CONFIG.ARCHIVE_API_URL}${API_CONFIG.ENDPOINTS.ARCHIVE_COMPLETED}`,
  archiveDisplayed: () => `${API_CONFIG.ARCHIVE_API_URL}${API_CONFIG.ENDPOINTS.ARCHIVE_DISPLAYED}`,
  archiveAllOld: () => `${API_CONFIG.ARCHIVE_API_URL}${API_CONFIG.ENDPOINTS.ARCHIVE_ALL_OLD}`,
  getArchived: () => `${API_CONFIG.ARCHIVE_API_URL}${API_CONFIG.ENDPOINTS.GET_ARCHIVED}`,
  archiveHealth: () => `${API_CONFIG.ARCHIVE_API_URL}${API_CONFIG.ENDPOINTS.HEALTH}`,
  
  // Queue API endpoints
  processFile: () => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.PROCESS_FILE}`,
  processFileChunked: () => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.PROCESS_FILE_CHUNKED}`,
  getResults: (userEmail: string) => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.GET_RESULTS}/${userEmail}`,
  jobStatus: (jobId: string) => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.JOB_STATUS}/${jobId}`,
  queueStatus: () => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.QUEUE_STATUS}`,
  queueHealth: () => `${API_CONFIG.QUEUE_API_URL}${API_CONFIG.ENDPOINTS.HEALTH}`,
  
  // Orchestrated Pipeline endpoints  
  processInvoice: () => `${API_CONFIG.PIPELINE_ORCHESTRATOR_URL}${API_CONFIG.ENDPOINTS.PROCESS_INVOICE}`,
  standardizeData: () => `${API_CONFIG.FIELD_STANDARDIZER_URL}${API_CONFIG.ENDPOINTS.STANDARDIZE}`,
  combineData: () => `${API_CONFIG.DATA_COMBINER_URL}${API_CONFIG.ENDPOINTS.COMBINE_DATA}`,
  orchestratorHealth: () => `${API_CONFIG.PIPELINE_ORCHESTRATOR_URL}${API_CONFIG.ENDPOINTS.HEALTH}`,
  standardizerHealth: () => `${API_CONFIG.FIELD_STANDARDIZER_URL}${API_CONFIG.ENDPOINTS.HEALTH}`,
  combinerHealth: () => `${API_CONFIG.DATA_COMBINER_URL}${API_CONFIG.ENDPOINTS.HEALTH}`
}

export default API_CONFIG