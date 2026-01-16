import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionContext'
import { Loader2, AlertTriangle } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requirePayment?: boolean
  requiredPermission?: {
    action: string
    subject: string
    resource?: any
  }
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requirePayment = true,
  requiredPermission
}) => {
  const { user, userProfile, loading } = useAuth()
  const location = useLocation()

  // Try to get permissions, but handle case where provider isn't available yet
  let permissions: { can: (action: string, subject: string, resource?: any) => boolean } | null = null
  try {
    permissions = usePermissions()
  } catch (error) {
    // Permission context not available yet, will check permissions later
    console.log('🔒 Permission context not available yet, will check later')
  }

  // Show loading while auth state is being determined
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Show loading while user profile is being loaded
  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-gray-600">Loading user profile...</p>
        </div>
      </div>
    )
  }

  // Check approval status for manual approval flow
  if (userProfile.approvalStatus === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
          <div className="text-yellow-500 text-5xl mb-4">⏳</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Account Pending Approval</h2>
          <p className="text-gray-600 mb-4">
            Your account is currently under review. You will receive an email notification once approved.
          </p>
          <p className="text-sm text-gray-500">
            If you have questions, please contact support.
          </p>
          <button
            onClick={() => window.location.href = '/login'}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // Handle rejected users
  if (userProfile.approvalStatus === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
          <div className="text-red-500 text-5xl mb-4">❌</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Account Access Denied</h2>
          <p className="text-gray-600 mb-4">
            Your account application has been declined. Please contact support for more information.
          </p>
          <button
            onClick={() => window.location.href = '/login'}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition"
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // Check payment status if payment is required
  if (requirePayment) {
    // Super admins and users with verified status bypass payment checks
    if (userProfile.role === 'super_admin' || userProfile.paymentStatus?.status === 'verified') {
      // Skip payment checks for super admins and verified users
    } else {
      const paymentStatus = userProfile.paymentStatus?.status
      
      // Handle expired trials
      if (paymentStatus === 'expired' || 
          (paymentStatus === 'pending' && userProfile.paymentStatus?.expiresAt && 
           new Date() > userProfile.paymentStatus.expiresAt.toDate())) {
        return <Navigate to="/onboarding" replace />
      }
      
      // Redirect to onboarding if payment not completed or verified
      if (!paymentStatus || 
          !['paid', 'verified', 'free_trial'].includes(paymentStatus)) {
        return <Navigate to="/onboarding" replace />
      }
      
      // Users with 'paid' status need admin verification before full access
      if (paymentStatus === 'paid' && userProfile.approvalStatus !== 'approved') {
        return <Navigate to="/onboarding" replace />
      }
    }
  }

  // Check required permission if specified and user is approved
  if (requiredPermission && permissions && userProfile.approvalStatus === 'approved') {
    const { action, subject, resource } = requiredPermission
    if (!permissions.can(action, subject, resource)) {
      // If it's the invoice analysis permission and user doesn't have access,
      // redirect to onboarding instead of showing access denied
      if (action === 'use' && subject === 'invoice_analysis') {
        return <Navigate to="/onboarding" replace />
      }
      
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
            <div className="text-red-500 text-5xl mb-4">🚫</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">
              You don't have permission to access this feature.
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => window.history.back()}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition"
              >
                Go Back
              </button>
              <button
                onClick={() => window.location.href = '/onboarding'}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                Get Access
              </button>
            </div>
          </div>
        </div>
      )
    }
  }

  // If payment is not required (like for admin pages), allow access
  if (!requirePayment) {
    return <>{children}</>
  }

  // If user profile is still loading, show loading
  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  // Handle different payment statuses
  const paymentStatus = userProfile.paymentStatus?.status

  // TEMPORARY: Allow existing users without payment status to access the app
  // TODO: Remove this after all users have been migrated to the new payment system
  if (!userProfile.paymentStatus) {
    console.warn('User without payment status detected, allowing access temporarily:', user.email)
    return <>{children}</>
  }

  switch (paymentStatus) {
    case 'pending':
    case 'paid':
      // Only redirect to onboarding if we're not already there
      if (location.pathname !== '/onboarding') {
        return <Navigate to="/onboarding" replace />
      }
      // If already on onboarding, show the page
      return <>{children}</>
    
    case 'verified':
    case 'free_trial':
      // Check if subscription has expired
      const expiresAt = userProfile.paymentStatus?.expiresAt
      if (expiresAt && expiresAt.toDate() < new Date()) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md mx-auto text-center p-6 bg-white rounded-lg shadow-sm border border-red-200">
              <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Subscription Expired</h2>
              <p className="text-gray-600 mb-6">
                Your subscription has expired. Please renew to continue using the service.
              </p>
              <button
                onClick={() => window.location.href = '/onboarding'}
                className="bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Renew Subscription
              </button>
            </div>
          </div>
        )
      }
      // Allow access if verified and not expired
      return <>{children}</>
    
    case 'expired':
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md mx-auto text-center p-6 bg-white rounded-lg shadow-sm border border-red-200">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Expired</h2>
            <p className="text-gray-600 mb-6">
              Your payment period has expired. Please make a new payment to continue.
            </p>
            <button
              onClick={() => window.location.href = '/onboarding'}
              className="bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              Make Payment
            </button>
          </div>
        </div>
      )

    default:
      // If no payment status is found, redirect to onboarding (only if not already there)
      if (location.pathname !== '/onboarding') {
        return <Navigate to="/onboarding" replace />
      }
      // If already on onboarding, allow access
      return <>{children}</>
  }
}

export default ProtectedRoute