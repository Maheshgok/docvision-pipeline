import { AbilityBuilder, Ability } from '@casl/ability'
import type { UserProfile } from '../services/userService'

// Define action types
export type Actions = 
  | 'read' 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'manage'
  | 'upload'
  | 'export'
  | 'verify'
  | 'use'

// Define subject types  
export type Subjects = 
  | 'Invoice' 
  | 'User' 
  | 'Organization' 
  | 'Payment' 
  | 'AdminDashboard'
  | 'invoice_analysis'
  | 'payments'
  | 'all'

export type AppAbility = Ability<[Actions, Subjects]>

/**
 * Define user abilities based on their profile and payment status
 */
export const defineAbilitiesFor = (user: UserProfile | null): AppAbility => {
  const { can, build } = new AbilityBuilder<AppAbility>(Ability)

  if (!user) {
    // Guest users - no permissions
    return build()
  }

  // Check if user has valid subscription
  const hasValidSubscription = user.paymentStatus?.status === 'verified' || 
                               user.paymentStatus?.status === 'free_trial'

  const isSubscriptionExpired = user.paymentStatus?.expiresAt && 
                               new Date(user.paymentStatus.expiresAt.seconds * 1000) < new Date()

  // Base permissions for authenticated users (even without subscription)
  can('read', 'User')

  // Subscription-based permissions
  if (hasValidSubscription && !isSubscriptionExpired) {
    // Invoice permissions
    can('read', 'Invoice')
    can('upload', 'Invoice')
    
    if (user.permissions?.canEdit) {
      can('create', 'Invoice')
      can('update', 'Invoice')
    }
    
    if (user.permissions?.canDelete) {
      can('delete', 'Invoice')
    }

    if (user.permissions?.canExportData) {
      can('export', 'Invoice')
    }

    // Organization-level permissions
    if (user.permissions?.canViewOrgData) {
      can('read', 'Invoice')
      can('read', 'Organization')
    }

    // User management permissions
    if (user.permissions?.canManageOrgUsers) {
      can('read', 'User')
      can('update', 'User')
      can('create', 'User')
    }
  }

  // Admin permissions
  if (user.role === 'super_admin') {
    can('manage', 'all')
    can('verify', 'Payment')
    can('read', 'AdminDashboard')
    can('manage', 'payments') // For admin payment management
  } else if (user.role === 'org_admin' && hasValidSubscription) {
    can('manage', 'User')
    can('manage', 'Invoice')
    can('read', 'Organization')
    can('update', 'Organization')
  }

  // Add invoice analysis permission for subscription users
  if (hasValidSubscription && !isSubscriptionExpired) {
    can('use', 'invoice_analysis')
  }

  return build()
}

/**
 * Create ability with error handling
 */
export const createAbility = (user: UserProfile | null): AppAbility => {
  try {
    return defineAbilitiesFor(user)
  } catch (error) {
    console.error('Error creating user abilities:', error)
    // Return empty ability on error
    const { build } = new AbilityBuilder<AppAbility>(Ability)
    return build()
  }
}

/**
 * Check if user can perform action
 */
export const checkPermission = (
  ability: AppAbility, 
  action: Actions, 
  subject: Subjects, 
  resource?: any
): boolean => {
  try {
    return ability.can(action, subject, resource)
  } catch (error) {
    console.error('Error checking permission:', error)
    return false
  }
}

/**
 * Get user role display name
 */
export const getRoleDisplayName = (user: UserProfile | null): string => {
  if (!user) return 'Guest'
  
  switch (user.role) {
    case 'super_admin': return 'Super Admin'
    case 'org_admin': return 'Organization Admin'
    case 'user': return 'User'
    case 'viewer': return 'Viewer'
    default: return 'Unknown'
  }
}

/**
 * Get subscription status display
 */
export const getSubscriptionStatusDisplay = (user: UserProfile | null): string => {
  if (!user?.paymentStatus) return 'No Subscription'
  
  const status = user.paymentStatus.status
  const expiresAt = user.paymentStatus.expiresAt
  
  switch (status) {
    case 'verified': 
      if (expiresAt && new Date(expiresAt.seconds * 1000) < new Date()) {
        return 'Expired'
      }
      return 'Active'
    case 'free_trial': return 'Trial'
    case 'pending': return 'Pending Payment'
    case 'paid': return 'Payment Verification Pending'
    case 'expired': return 'Expired'
    default: return 'Unknown'
  }
}