/**
 * Session Recovery Service
 * Recovers unarchived results from previous sessions on login
 * Uses one-time fetch (not listeners) to avoid disturbing listener management
 */

import { 
  collection, 
  getDocs, 
  query, 
  where, 
  limit
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import { userService } from './userService'
import type { JournalEntry } from './firestore-sync-manager'

export interface RecoveredSession {
  hasRecoveredData: boolean
  journalEntries: JournalEntry[]
  resultCount: number
  oldestResultDate: Date | null
}

class SessionRecoveryService {
  private hasCheckedForRecovery = false
  private recoveredData: RecoveredSession | null = null

  /**
   * Check for and recover any unarchived results from previous sessions
   * This is called once on login, not on every page load
   */
  async checkForRecoverableResults(): Promise<RecoveredSession> {
    const user = authService.getCurrentUser()
    if (!user?.uid) {
      console.log('🔄 Session recovery: No user authenticated')
      return this.emptyResult()
    }

    // Only check once per session
    if (this.hasCheckedForRecovery && this.recoveredData) {
      console.log('🔄 Session recovery: Already checked this session')
      return this.recoveredData
    }

    try {
      console.log('🔄 Session recovery: Checking for unarchived results for UID:', user.uid)
      
      const userCollectionPath = userService.getUserDataPath('invoice_results')
      
      // One-time fetch - NOT a listener
      // Note: No orderBy to avoid requiring a composite index
      const recoveryQuery = query(
        collection(db, userCollectionPath),
        where('userUID', '==', user.uid),
        limit(100) // Reasonable limit for recovery
      )

      const snapshot = await getDocs(recoveryQuery)
      
      if (snapshot.empty) {
        console.log('✅ Session recovery: No unarchived results found (clean slate)')
        this.recoveredData = this.emptyResult()
        this.hasCheckedForRecovery = true
        return this.recoveredData
      }

      console.log(`🔔 Session recovery: Found ${snapshot.docs.length} unarchived results from previous session!`)

      // Extract journal entries from the recovered results
      const journalEntries = this.extractJournalEntries(snapshot.docs)
      
      // Find oldest result date
      let oldestDate: Date | null = null
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        const createdAt = data.created_at?.toDate?.() || data.created_at
        if (createdAt && (!oldestDate || createdAt < oldestDate)) {
          oldestDate = createdAt
        }
      })

      this.recoveredData = {
        hasRecoveredData: journalEntries.length > 0,
        journalEntries,
        resultCount: snapshot.docs.length,
        oldestResultDate: oldestDate
      }
      
      this.hasCheckedForRecovery = true
      
      console.log(`✅ Session recovery complete: ${journalEntries.length} journal entries recovered`)
      
      return this.recoveredData

    } catch (error) {
      console.error('❌ Session recovery failed:', error)
      this.hasCheckedForRecovery = true
      this.recoveredData = this.emptyResult()
      return this.recoveredData
    }
  }

  /**
   * Extract journal entries from recovered Firestore documents
   * Same logic as final-simplified-firestore but for one-time fetch
   */
  private extractJournalEntries(docs: any[]): JournalEntry[] {
    const entries: JournalEntry[] = []

    docs.forEach((docSnapshot) => {
      const data = docSnapshot.data()
      const docId = docSnapshot.id
      
      // Support both old (data.result) and new (direct fields) structure
      const extractedData = data.result || {
        journal_entries: data.journal_entries || [],
        invoice_details: data.invoice_header || data.invoice_details || {},
        vendor_details: data.vendor_details || {
          name: data.invoice_header?.vendor_name || '',
          gstin: data.invoice_header?.vendor_gstin || ''
        }
      }

      if (!extractedData.journal_entries || !Array.isArray(extractedData.journal_entries)) {
        return
      }

      extractedData.journal_entries.forEach((entry: any, entryIndex: number) => {
        const mappedEntry: JournalEntry = {
          id: `${data.job_id || docId}_${entryIndex}`,
          invoiceId: docId,
          date: extractedData.invoice_details?.invoice_date || entry.invoice_date || '',
          accountName: entry.account_name || '',
          accountCode: entry.account_code || (entry.account_type === 'Expense' ? '5000' : '2000'),
          description: entry.narration || entry.item_description || '',
          debitAmount: entry.debit_amount || 0,
          creditAmount: entry.credit_amount || 0,
          reference: entry.reference_number || extractedData.invoice_details?.invoice_number || '',
          vendor: extractedData.vendor_details?.name || entry.vendor_name || 'Unknown',
          totalAmount: entry.line_total || 0,
          taxableAmount: entry.taxable_amount || 0,
          gstAmount: entry.gst_amount || 0,
          cgstAmount: entry.cgst_amount || 0,
          sgstAmount: entry.sgst_amount || 0,
          igstAmount: entry.igst_amount || 0,
          isBalanced: entry.entry_balanced ?? true,
          hsnCode: entry.hsn_code || '',
          itemDescription: entry.item_description || '',
          quantity: entry.quantity || 0,
          unitPrice: entry.unit_price || 0
        }
        
        entries.push(mappedEntry)
      })
    })

    // Sort by date descending (newest first)
    return entries.sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime()
      const dateB = new Date(b.date || 0).getTime()
      return dateB - dateA
    })
  }

  /**
   * Clear recovery state (call on logout or after successful archive)
   */
  clearRecoveryState(): void {
    this.hasCheckedForRecovery = false
    this.recoveredData = null
    console.log('🧹 Session recovery state cleared')
  }

  /**
   * Get currently recovered data without re-fetching
   */
  getRecoveredData(): RecoveredSession | null {
    return this.recoveredData
  }

  /**
   * Check if recovery has been performed this session
   */
  hasCheckedThisSession(): boolean {
    return this.hasCheckedForRecovery
  }

  private emptyResult(): RecoveredSession {
    return {
      hasRecoveredData: false,
      journalEntries: [],
      resultCount: 0,
      oldestResultDate: null
    }
  }
}

export const sessionRecoveryService = new SessionRecoveryService()
