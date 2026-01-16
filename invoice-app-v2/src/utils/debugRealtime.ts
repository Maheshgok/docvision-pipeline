import { authService } from '../services/auth'
import { finalSimplifiedFirestoreService } from '../services/final-simplified-firestore'
import toast from 'react-hot-toast'

export const debugRealtimeConnection = () => {
  console.log('🔍 DEBUG: Testing real-time connection...')
  
  // Check authentication
  const user = authService.getCurrentUser()
  if (!user) {
    console.log('❌ DEBUG: No authenticated user')
    toast.error('Please log in first')
    return
  }
  
  console.log('✅ DEBUG: User authenticated:', user.email)
  
  // Set up a test listener
  try {
    console.log('🔥 DEBUG: Setting up test listener...')
    
    finalSimplifiedFirestoreService.listenToUserResults(
      (results) => {
        console.log('📡 DEBUG: Received active results:', results)
        toast.success(`Real-time working! Found ${results.length} active results`)
      },
      (error) => {
        console.error('❌ DEBUG: Active listener error:', error)
        toast.error(`Real-time error: ${error.message}`)
      }
    )
    
    console.log('✅ DEBUG: Test listener set up successfully')
    toast.success('Real-time listener test started - check console')
    
  } catch (error) {
    console.error('❌ DEBUG: Failed to set up listener:', error)
    toast.error('Failed to test real-time connection')
  }
}

// Add to window for easy testing
if (typeof window !== 'undefined') {
  (window as any).debugRealtimeConnection = debugRealtimeConnection
}