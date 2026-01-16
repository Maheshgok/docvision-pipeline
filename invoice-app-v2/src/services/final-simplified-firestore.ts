import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  limit,
  DocumentData,
  QuerySnapshot
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import { userService } from './userService'

/**
 * FINAL SIMPLIFIED: Uses existing perfect journal entries from backend
 */
export class FinalSimplifiedFirestoreService {
  private unsubscribers: Array<() => void> = []

  listenToUserResults(onUpdate: (entries: any[]) => void, onError: (error: Error) => void) {
    const user = authService.getCurrentUser()
    if (!user?.uid) {
      onError(new Error('User not authenticated'))
      return
    }

    console.log('🔥 FINAL SIMPLIFIED: Setting up listener for UID:', user.uid)

    const userQuery = query(
      collection(db, userService.getUserDataPath('invoice_results')),
      where('userUID', '==', user.uid),
      limit(50)
    )

    const unsubscribe = onSnapshot(
      userQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        console.log('📡 FINAL SIMPLIFIED: Snapshot received:', snapshot.docs.length, 'documents')
        
        const results = snapshot.docs.map(doc => {
          const data = doc.data()
          return {
            id: doc.id,
            jobId: data.job_id || doc.id,
            userEmail: data.user_email || '',
            createdAt: data.created_at || data.updated_at || new Date(),
            // Support both old (data.result) and new (direct fields) structure
            extractedData: data.result || {
              journal_entries: data.journal_entries || [],
              invoice_details: data.invoice_header || data.invoice_details || {},
              vendor_details: data.vendor_details || {
                name: data.invoice_header?.vendor_name || '',
                gstin: data.invoice_header?.vendor_gstin || ''
              },
              balance_validation: data.balance_validation || {}
            }
          }
        })
        
        const journalEntries = this.extractFromBackendJournalEntries(results)
        onUpdate(journalEntries)
      },
      onError
    )

    this.unsubscribers.push(unsubscribe)
  }

  /**
   * Use the perfect journal entries that backend already created!
   */
  private extractFromBackendJournalEntries(results: any[]): any[] {
    const entries: any[] = []
    
    console.log('🎯 FINAL SIMPLIFIED: Processing', results.length, 'results')
    
    results.forEach((result) => {
      if (!result.extractedData) {
        console.log('⚠️ No extractedData for', result.jobId)
        return
      }

      const data = result.extractedData
      
      console.log(`📋 Processing ${result.jobId}:`, {
        hasJournalEntries: !!(data.journal_entries && Array.isArray(data.journal_entries)),
        journalCount: data.journal_entries?.length || 0
      })

      // Use existing perfect journal entries from backend!
      if (data.journal_entries && Array.isArray(data.journal_entries)) {
        data.journal_entries.forEach((entry: any, entryIndex: number) => {
          const mappedEntry = {
            id: `${result.jobId}_${entryIndex}`,
            invoiceId: result.id,
            invoiceNumber: data.invoice_details?.invoice_number || entry.reference_number || 'N/A',
            vendor: data.vendor_details?.name || entry.vendor_name || 'Unknown',
            entryIndex: entryIndex,
            date: data.invoice_details?.invoice_date || entry.invoice_date || '',
            accountName: entry.account_name || '',
            accountCode: entry.account_code || (entry.account_type === 'Expense' ? '5000' : '2000'),
            accountType: entry.account_type || '',
            debitAmount: entry.debit_amount || 0,
            creditAmount: entry.credit_amount || 0,
            description: entry.narration || entry.item_description || '',
            narration: entry.narration || '',
            reference: entry.reference_number || data.invoice_details?.invoice_number || '',
            // HSN from backend
            hsnCode: entry.hsn_code || '',
            itemDescription: entry.item_description || '',
            quantity: entry.quantity || 0,
            unitPrice: entry.unit_price || 0,
            // GST data still available for exports, just not displayed in table
            gstAmount: entry.gst_amount || 0,
            cgstAmount: entry.cgst_amount || 0,
            sgstAmount: entry.sgst_amount || 0,
            igstAmount: entry.igst_amount || 0,
            taxableAmount: entry.taxable_amount || 0,
            lineTotal: entry.line_total || 0,
            isGstApplicable: entry.is_gst_applicable || false,
            placeOfSupply: entry.place_of_supply || '',
            isBalanced: entry.entry_balanced || true,
            userId: result.userEmail,
            createdAt: result.createdAt
          }
          
          console.log(`✅ Mapped entry ${entryIndex}:`, {
            id: mappedEntry.id,
            accountName: mappedEntry.accountName,
            hsnCode: mappedEntry.hsnCode
          })
          
          entries.push(mappedEntry)
        })
      } else {
        console.log('⚠️ No journal_entries array found in data')
      }
    })

    console.log('🎉 FINAL: Created', entries.length, 'entries from backend journal entries')
    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  cleanup() {
    this.unsubscribers.forEach(unsub => unsub())
    this.unsubscribers = []
    console.log('🧹 FINAL SIMPLIFIED: Cleaned up listeners')
  }
}

export const finalSimplifiedFirestoreService = new FinalSimplifiedFirestoreService()