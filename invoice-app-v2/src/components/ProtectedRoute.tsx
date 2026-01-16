import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { UserProfile } from '../services/userService'

// Utility function to safely convert Firestore Timestamp to Date
const toDate = (timestamp: any): Date => {
  if (!timestamp) return new Date(0)
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate()
  }
  return new Date(timestamp)
}

interface ProtectedRouteProps {
  children: React.ReactNode
  requiresSubscription?: boolean
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiresSubscription = true 
}) => {
  const { user, userProfile, loading } = useAuth()

  // Show loading while auth is being determined
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Allow super admins to bypass all subscription checks completely
  if (userProfile?.role === 'super_admin') {
    return <>{children}</>
  }

  // Check subscription requirements
  if (requiresSubscription && userProfile?.paymentStatus) {
    const expiresAt = userProfile.paymentStatus.expiresAt
    
    if (expiresAt) {
      const expiryDate = toDate(expiresAt)
      const now = new Date()
      const fifteenDaysFromNow = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
      
      // Only redirect to renewal if subscription expires within 15 days
      if (expiryDate <= fifteenDaysFromNow && expiryDate > now) {
        return <Navigate to="/payment/renewal" replace />
      }
      // If already expired, also redirect to renewal
      if (expiryDate <= now) {
        return <Navigate to="/payment/renewal" replace />
      }
    }
  } else if (requiresSubscription && !(userProfile?.paymentStatus as any)?.isPaid && 
             userProfile?.role && userProfile.role !== ('super_admin' as UserProfile['role'])) {
    // If no payment status or not paid, redirect to payment renewal (but not for super admins)
    return <Navigate to="/payment/renewal" replace />
  }

  // Check if user service is suspended
  if (userProfile?.isActive === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-white rounded-lg shadow-sm">
          <div className="text-red-500 mb-4">
            <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Service Suspended</h2>
          <p className="text-gray-600 mb-6">
            Your account has been temporarily suspended. Please contact support for assistance.
          </p>
          <a
            href="mailto:support@invoiceprocessor.com"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Contact Support
          </a>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default ProtectedRoute