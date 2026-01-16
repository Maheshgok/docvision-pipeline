import { doc, updateDoc, Timestamp, increment, arrayUnion } from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import { userService } from './userService'

export interface UserChange {
  field_path: string
  field_name: string
  original_value: any
  new_value: any
  change_timestamp: string
  user_email: string
  change_type: 'edit' | 'add' | 'delete'
  table_context?: {
    row_id: string
    column_name: string
    table_type: 'journal_entries' | 'items' | 'extracted_data'
  }
}

export interface UserModifications {
  total_changes: number
  last_modified: string
  last_modified_by: string
  changes: UserChange[]
}

class ChangeTrackingService {
  
  /**
   * Track a user modification to an invoice result
   */
  async trackChange(
    invoiceId: string,
    fieldPath: string,
    fieldName: string,
    originalValue: any,
    newValue: any,
    changeType: 'edit' | 'add' | 'delete' = 'edit',
    tableContext?: {
      rowId: string
      columnName: string
      tableType: 'journal_entries' | 'items' | 'extracted_data'
    }
  ): Promise<void> {
    try {
      const user = authService.getCurrentUser()
      if (!user) {
        console.error('No authenticated user for change tracking')
        return
      }

      console.log('📝 Tracking user change:', {
        invoiceId,
        fieldPath,
        fieldName,
        originalValue,
        newValue,
        changeType,
        tableContext
      })

      const change: UserChange = {
        field_path: fieldPath,
        field_name: fieldName,
        original_value: originalValue,
        new_value: newValue,
        change_timestamp: new Date().toISOString(),
        user_email: user.email || '',
        change_type: changeType,
        table_context: tableContext ? {
          row_id: tableContext.rowId,
          column_name: tableContext.columnName,
          table_type: tableContext.tableType
        } : undefined
      }

      // Get user's collection path
      const collectionPath = userService.getUserDataPath('invoice_results')
      const docRef = doc(db, collectionPath, invoiceId)

      // Update the document with the change tracking
      await updateDoc(docRef, {
        'user_modifications.total_changes': increment(1),
        'user_modifications.last_modified': change.change_timestamp,
        'user_modifications.last_modified_by': user.email,
        'user_modifications.changes': arrayUnion(change),
        updatedAt: Timestamp.now()
      })

      console.log('✅ Change tracked successfully for invoice:', invoiceId)

    } catch (error) {
      console.error('❌ Error tracking change:', error)
      throw error
    }
  }

  /**
   * Track multiple changes in a batch
   */
  async trackBatchChanges(
    invoiceId: string,
    changes: Omit<UserChange, 'change_timestamp' | 'user_email'>[]
  ): Promise<void> {
    try {
      const user = authService.getCurrentUser()
      if (!user || changes.length === 0) return

      console.log('📝 Tracking batch changes:', { invoiceId, changeCount: changes.length })

      const timestamp = new Date().toISOString()
      const userChanges: UserChange[] = changes.map(change => ({
        ...change,
        change_timestamp: timestamp,
        user_email: user.email || ''
      }))

      // Get user's collection path
      const collectionPath = userService.getUserDataPath('invoice_results')
      const docRef = doc(db, collectionPath, invoiceId)

      // Update with batch changes
      await updateDoc(docRef, {
        'user_modifications.total_changes': increment(changes.length),
        'user_modifications.last_modified': timestamp,
        'user_modifications.last_modified_by': user.email,
        'user_modifications.changes': arrayUnion(...userChanges),
        updatedAt: Timestamp.now()
      })

      console.log('✅ Batch changes tracked successfully for invoice:', invoiceId)

    } catch (error) {
      console.error('❌ Error tracking batch changes:', error)
      throw error
    }
  }

  /**
   * Get change summary for an invoice
   */
  getChangeSummary(userModifications?: UserModifications): string {
    if (!userModifications || userModifications.total_changes === 0) {
      return 'No user modifications'
    }

    const changeTypes = userModifications.changes.reduce((acc, change) => {
      acc[change.change_type] = (acc[change.change_type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const summary = Object.entries(changeTypes)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ')

    return `${userModifications.total_changes} changes (${summary})`
  }

  /**
   * Get change history for display
   */
  formatChangeHistory(userModifications?: UserModifications): string[] {
    if (!userModifications || userModifications.changes.length === 0) {
      return ['No changes made by users']
    }

    return userModifications.changes.map(change => {
      const timestamp = new Date(change.change_timestamp).toLocaleString()
      const context = change.table_context 
        ? ` in ${change.table_context.table_type} table (${change.table_context.column_name})` 
        : ''
      
      return `${timestamp}: ${change.user_email} ${change.change_type}d ${change.field_name}${context} from "${change.original_value}" to "${change.new_value}"`
    })
  }

  /**
   * Check if an invoice has user modifications
   */
  hasUserModifications(userModifications?: UserModifications): boolean {
    return (userModifications?.total_changes || 0) > 0
  }


}

export const changeTrackingService = new ChangeTrackingService()