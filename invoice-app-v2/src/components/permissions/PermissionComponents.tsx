import { ReactNode } from 'react'
import { usePermissions } from '../../contexts/PermissionContext'

interface CanAccessProps {
  action: string
  subject: string
  resource?: any
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Conditional rendering component based on permissions
 */
export const CanAccess: React.FC<CanAccessProps> = ({
  action,
  subject,
  resource,
  children,
  fallback = null
}) => {
  const { can } = usePermissions()
  
  if (can(action, subject, resource)) {
    return <>{children}</>
  }
  
  return <>{fallback}</>
}

interface RestrictedProps {
  permissions: Array<{
    action: string
    subject: string
    resource?: any
  }>
  requireAll?: boolean
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Component for multiple permission checks
 */
export const Restricted: React.FC<RestrictedProps> = ({
  permissions,
  requireAll = false,
  children,
  fallback = null
}) => {
  const { can } = usePermissions()
  
  const hasPermission = requireAll
    ? permissions.every(p => can(p.action, p.subject, p.resource))
    : permissions.some(p => can(p.action, p.subject, p.resource))
  
  if (hasPermission) {
    return <>{children}</>
  }
  
  return <>{fallback}</>
}

interface SubscriptionGateProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Gate for subscription-required features
 */
export const SubscriptionGate: React.FC<SubscriptionGateProps> = ({
  children,
  fallback = (
    <div className="text-center p-6 bg-amber-50 border border-amber-200 rounded-lg">
      <h3 className="text-lg font-medium text-amber-800 mb-2">Subscription Required</h3>
      <p className="text-amber-700 mb-4">This feature requires an active subscription.</p>
      <button
        onClick={() => window.location.href = '/onboarding'}
        className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors"
      >
        Upgrade Now
      </button>
    </div>
  )
}) => {
  const { can } = usePermissions()
  
  // Check if user can upload (requires subscription)
  if (can('upload', 'Invoice')) {
    return <>{children}</>
  }
  
  return <>{fallback}</>
}

interface AdminOnlyProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Component for admin-only features
 */
export const AdminOnly: React.FC<AdminOnlyProps> = ({
  children,
  fallback = (
    <div className="text-center p-6">
      <p className="text-gray-600">Admin access required.</p>
    </div>
  )
}) => {
  const { can } = usePermissions()
  
  if (can('read', 'AdminDashboard')) {
    return <>{children}</>
  }
  
  return <>{fallback}</>
}