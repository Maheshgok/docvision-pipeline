/**
 * Secure Datastore Service
 * All-in-one service for secure, consistent datastore operations
 * Replaces direct Firestore calls with permission-validated operations
 */

import { 
  collection, 
  doc,
  query,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  Unsubscribe,
  QueryConstraint
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { datastoreConfigManager, DatastoreOperation } from './datastoreConfigManager'

// Define the interface locally to avoid dependencies
export interface InvoiceProcessingResult {
  id: string
  jobId?: string
  status: 'queued' | 'processing' | 'completed' | 'error'
  extractedData?: any
  [key: string]: any
}

export interface SecureQueryOptions {
  collection: 'active' | 'archive' | 'backup'
  constraints?: QueryConstraint[]
  realtime?: boolean
}

export interface SecureDocumentOperation {
  collection: 'active' | 'archive' | 'backup'
  documentId?: string
  data?: any
}

class SecureDatastoreService {
  private static instance: SecureDatastoreService
  private activeListeners: Map<string, Unsubscribe> = new Map()

  private constructor() {}

  static getInstance(): SecureDatastoreService {
    if (!SecureDatastoreService.instance) {
      SecureDatastoreService.instance = new SecureDatastoreService()
    }
    return SecureDatastoreService.instance
  }

  /**
   * Initialize service with user configuration
   */
  async initialize(): Promise<void> {
    try {
      await datastoreConfigManager.initializeConfig()
      console.log('🔐 Secure datastore service initialized')
    } catch (error) {
      console.error('❌ Failed to initialize secure datastore:', error)
      throw error
    }
  }

  /**
   * Secure query with automatic permission validation
   */
  async query(options: SecureQueryOptions): Promise<InvoiceProcessingResult[]> {
    const operation: DatastoreOperation = {
      operation: 'read',
      collection: options.collection
    }

    return await datastoreConfigManager.executeSecureOperation(operation, async (collectionPath) => {
      const collectionRef = collection(db, collectionPath)
      let queryRef = query(collectionRef)

      // Apply constraints if provided
      if (options.constraints && options.constraints.length > 0) {
        queryRef = query(collectionRef, ...options.constraints)
      }

      const snapshot = await getDocs(queryRef)
      const results: InvoiceProcessingResult[] = []

      snapshot.forEach((doc) => {
        const data = doc.data()
        results.push({
          id: doc.id,
          ...data
        } as InvoiceProcessingResult)
      })

      console.log(`📊 Query returned ${results.length} results from ${collectionPath}`)
      return results
    })
  }

  /**
   * Secure real-time listener with automatic cleanup
   */
  async setupRealtimeListener(
    options: SecureQueryOptions,
    onUpdate: (results: InvoiceProcessingResult[]) => void,
    onError?: (error: Error) => void
  ): Promise<string> {
    const operation: DatastoreOperation = {
      operation: 'read',
      collection: options.collection
    }

    const collectionPath = await datastoreConfigManager.getCollectionPath(operation)
    const listenerId = `${options.collection}_${Date.now()}`

    try {
      const collectionRef = collection(db, collectionPath)
      let queryRef = query(collectionRef)

      // Apply constraints if provided
      if (options.constraints && options.constraints.length > 0) {
        queryRef = query(collectionRef, ...options.constraints)
      }

      const unsubscribe = onSnapshot(
        queryRef,
        (snapshot) => {
          const results: InvoiceProcessingResult[] = []
          snapshot.forEach((doc) => {
            const data = doc.data()
            results.push({
              id: doc.id,
              ...data
            } as InvoiceProcessingResult)
          })

          console.log(`🔄 Real-time update: ${results.length} results`)
          onUpdate(results)
        },
        (error) => {
          console.error('❌ Real-time listener error:', error)
          if (onError) {
            onError(error)
          }
        }
      )

      // Store listener for cleanup
      this.activeListeners.set(listenerId, unsubscribe)
      console.log(`👂 Real-time listener setup for ${collectionPath}`)

      return listenerId

    } catch (error) {
      console.error('❌ Failed to setup real-time listener:', error)
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
      throw error
    }
  }

  /**
   * Secure document creation
   */
  async createDocument(options: SecureDocumentOperation): Promise<string> {
    const operation: DatastoreOperation = {
      operation: 'write',
      collection: options.collection,
      data: options.data
    }

    return await datastoreConfigManager.executeSecureOperation(operation, async (collectionPath) => {
      if (!options.data) {
        throw new Error('Data is required for document creation')
      }

      const collectionRef = collection(db, collectionPath)
      const docRef = await addDoc(collectionRef, {
        ...options.data,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      console.log(`📄 Document created: ${docRef.id}`)
      return docRef.id
    })
  }

  /**
   * Secure document update
   */
  async updateDocument(options: SecureDocumentOperation): Promise<void> {
    const operation: DatastoreOperation = {
      operation: 'write',
      collection: options.collection,
      documentId: options.documentId,
      data: options.data
    }

    return await datastoreConfigManager.executeSecureOperation(operation, async (collectionPath) => {
      if (!options.documentId || !options.data) {
        throw new Error('Document ID and data are required for update')
      }

      const docRef = doc(db, collectionPath, options.documentId)
      await updateDoc(docRef, {
        ...options.data,
        updatedAt: new Date()
      })

      console.log(`📝 Document updated: ${options.documentId}`)
    })
  }

  /**
   * Secure document archival (move from active to archive)
   * Creates archive collection if it doesn't exist
   */
  async archiveDocument(documentId: string, data: any): Promise<void> {
    try {
      console.log(`📦 Starting archive process for document: ${documentId}`)
      
      // Get paths for both collections
      const activePath = await datastoreConfigManager.getCollectionPath({
        operation: 'read',
        collection: 'active'
      })

      const archivePath = await datastoreConfigManager.getCollectionPath({
        operation: 'write',
        collection: 'archive'
      })

      console.log(`📂 Archive paths - Active: ${activePath}, Archive: ${archivePath}`)

      // Start batch operation
      const batch = writeBatch(db)

      // Create archive document (collection will be created automatically)
      const archiveCollectionRef = collection(db, archivePath)
      const archiveDocRef = doc(archiveCollectionRef) // Auto-generated ID
      
      // Prepare archive data with metadata
      const archiveData = {
        ...data,
        originalId: documentId,
        originalCollection: activePath,
        archivedAt: new Date(),
        archivedBy: datastoreConfigManager.getCurrentConfig()?.userId || 'system',
        updatedAt: new Date(),
        archiveVersion: '2.0' // Track archive format version
      }

      batch.set(archiveDocRef, archiveData)

      // Remove from active collection
      const activeRef = doc(db, activePath, documentId)
      batch.delete(activeRef)

      // Execute batch operation
      await batch.commit()

      console.log(`✅ Document archived successfully:`)
      console.log(`   Original: ${activePath}/${documentId}`)
      console.log(`   Archive: ${archivePath}/${archiveDocRef.id}`)

    } catch (error) {
      console.error('❌ Archive operation failed:', error)
      console.error('   Document ID:', documentId)
      console.error('   Error details:', error)
      throw new Error(`Failed to archive document: ${error}`)
    }
  }

  /**
   * Batch archive multiple documents (more efficient for bulk operations)
   */
  async batchArchiveDocuments(documentsToArchive: Array<{id: string, data: any}>): Promise<void> {
    if (documentsToArchive.length === 0) {
      console.log('📦 No documents to archive')
      return
    }

    try {
      console.log(`📦 Starting batch archive of ${documentsToArchive.length} documents`)
      
      // Get paths for both collections
      const activePath = await datastoreConfigManager.getCollectionPath({
        operation: 'read',
        collection: 'active'
      })

      const archivePath = await datastoreConfigManager.getCollectionPath({
        operation: 'write',
        collection: 'archive'
      })

      const currentUserId = datastoreConfigManager.getCurrentConfig()?.userId || 'system'
      
      // Process documents in smaller batches to avoid Firestore limits
      const batchSize = 100 // Conservative limit (2 operations per document = 200 total)
      const totalBatches = Math.ceil(documentsToArchive.length / batchSize)
      let totalProcessed = 0

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * batchSize
        const endIdx = Math.min(startIdx + batchSize, documentsToArchive.length)
        const currentBatchDocs = documentsToArchive.slice(startIdx, endIdx)

        console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches} (${currentBatchDocs.length} documents)`)

        // Start new batch operation for this chunk
        const batch = writeBatch(db)
        const archiveCollectionRef = collection(db, archivePath)

        for (const docToArchive of currentBatchDocs) {
          try {
            // Create archive document
            const archiveDocRef = doc(archiveCollectionRef)
            const archiveData = {
              ...docToArchive.data,
              // Archive metadata
              originalId: docToArchive.id,
              originalCollection: activePath,
              archivedAt: new Date(),
              archivedBy: currentUserId,
              updatedAt: new Date(),
              archiveVersion: '2.0',
              batchIndex: batchIndex,
              batchTimestamp: Date.now()
            }

            batch.set(archiveDocRef, archiveData)

            // Remove from active collection
            const activeRef = doc(db, activePath, docToArchive.id)
            batch.delete(activeRef)
          } catch (docError) {
            console.error(`❌ Error preparing document ${docToArchive.id} for archive:`, docError)
            // Continue with other documents in the batch
          }
        }

        // Execute this batch
        try {
          await batch.commit()
          totalProcessed += currentBatchDocs.length
          console.log(`✅ Batch ${batchIndex + 1} completed: ${currentBatchDocs.length} documents archived`)
        } catch (batchError) {
          console.error(`❌ Batch ${batchIndex + 1} failed:`, batchError)
          throw batchError // Stop processing if a batch fails
        }
      }

      console.log(`✅ Batch archive completed: ${totalProcessed} documents archived successfully`)

    } catch (error) {
      console.error('❌ Batch archive operation failed:', error)
      throw new Error(`Failed to batch archive documents: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Secure document deletion
   */
  async deleteDocument(options: SecureDocumentOperation): Promise<void> {
    const operation: DatastoreOperation = {
      operation: 'delete',
      collection: options.collection,
      documentId: options.documentId
    }

    return await datastoreConfigManager.executeSecureOperation(operation, async (collectionPath) => {
      if (!options.documentId) {
        throw new Error('Document ID is required for deletion')
      }

      const docRef = doc(db, collectionPath, options.documentId)
      await deleteDoc(docRef)

      console.log(`🗑️ Document deleted: ${options.documentId}`)
    })
  }

  /**
   * Get single document securely
   */
  async getDocument(options: SecureDocumentOperation): Promise<InvoiceProcessingResult | null> {
    const operation: DatastoreOperation = {
      operation: 'read',
      collection: options.collection,
      documentId: options.documentId
    }

    return await datastoreConfigManager.executeSecureOperation(operation, async (collectionPath) => {
      if (!options.documentId) {
        throw new Error('Document ID is required')
      }

      const docRef = doc(db, collectionPath, options.documentId)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        return null
      }

      return {
        id: docSnap.id,
        ...docSnap.data()
      } as InvoiceProcessingResult
    })
  }

  /**
   * Remove specific real-time listener
   */
  removeListener(listenerId: string): void {
    const unsubscribe = this.activeListeners.get(listenerId)
    if (unsubscribe) {
      unsubscribe()
      this.activeListeners.delete(listenerId)
      console.log(`👋 Removed listener: ${listenerId}`)
    }
  }

  /**
   * Remove all real-time listeners (cleanup)
   */
  removeAllListeners(): void {
    this.activeListeners.forEach((unsubscribe, listenerId) => {
      unsubscribe()
      console.log(`👋 Removed listener: ${listenerId}`)
    })
    this.activeListeners.clear()
    console.log('🧹 All listeners removed')
  }

  /**
   * Get service statistics
   */
  getServiceStats(): {
    activeListeners: number
    configStats: any
  } {
    return {
      activeListeners: this.activeListeners.size,
      configStats: datastoreConfigManager.getConfigStats()
    }
  }

  /**
   * Refresh configuration and reinitialize
   */
  async refreshConfiguration(): Promise<void> {
    // Clean up existing listeners
    this.removeAllListeners()
    
    // Refresh datastore configuration
    await datastoreConfigManager.refreshConfig()
    
    console.log('🔄 Service configuration refreshed')
  }

  /**
   * Cleanup on logout
   */
  cleanup(): void {
    this.removeAllListeners()
    datastoreConfigManager.clearConfig()
    console.log('🧹 Secure datastore service cleaned up')
  }
}

// Export singleton instance
export const secureDatastoreService = SecureDatastoreService.getInstance()
export default secureDatastoreService