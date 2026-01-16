import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  Timestamp,
  writeBatch,
  orderBy,
  limit
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import type { User } from '../types/auth'

// Session interface for security tracking
export interface UserSession {
  sessionId: string
  userUid: string
  deviceFingerprint: string
  browserInfo: string
  ipAddress: string
  location?: string
  createdAt: Timestamp
  lastActivity: Timestamp
  isActive: boolean
  tabId?: string
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string | null
  firstName?: string
  lastName?: string
  photoURL: string | null
  phone?: string
  role: 'super_admin' | 'org_admin' | 'user' | 'viewer'
  organizationId: string
  organizationRole: 'admin' | 'member' | 'viewer'
  permissions: UserPermissions
  department?: string
  jobTitle?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  lastLoginAt: Timestamp
  isActive: boolean
  preferences: UserPreferences
  usageStats: UserUsageStats
  invitedBy?: string  // UID of admin who invited this user
  inviteStatus: 'pending' | 'accepted' | 'rejected'
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'suspended'  // Manual approval by super admin
  approvedBy?: string  // Super admin UID who approved the user
  approvedAt?: Timestamp  // When the user was approved
  paymentStatus: PaymentStatus
  workspace_initialized?: boolean  // Whether user workspace is set up
  // Consumption tracking fields
  packageConsumption: number  // Analysis completed in current package
  totalConsumption: number    // Lifetime analysis completed by user
  currentPackageValidity: PackageValidity  // Current package limits and remaining
  packageUsageHistory?: UsageRecord[]  // History of package usage
}

export interface PaymentStatus {
  status: 'pending' | 'paid' | 'verified' | 'expired' | 'free_trial'
  amount: number
  currency: string
  paymentId?: string
  transactionRef?: string
  paymentMethod: 'upi' | 'card' | 'bank_transfer' | 'admin_override' | 'trial'
  paidAt?: Timestamp
  verifiedAt?: Timestamp
  verifiedBy?: string  // Admin UID who verified payment
  expiresAt?: Timestamp
  subscriptionType: 'monthly' | 'yearly' | 'lifetime' | 'trial'
  autoRenew: boolean
  paymentHistory: PaymentRecord[]
}

export interface PaymentRecord {
  id: string
  amount: number
  currency: string
  paymentMethod: string
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  transactionRef?: string
  paidAt: Timestamp
  verifiedBy?: string
  notes?: string
}

export interface UsageRecord {
  id: string
  packageId: string
  packageName: string
  packageType: 'time_based' | 'consumption_based' | 'hybrid'
  activatedAt: Timestamp
  expiresAt?: Timestamp
  analysisUsed?: number
  analysisLimit?: number
  remainingCredits?: number
  status: 'active' | 'expired' | 'depleted'
}

export interface PackageValidity {
  packageId: string
  packageName: string
  packageType: 'time_based' | 'consumption_based' | 'hybrid'
  analysisLimit: number      // For time-based unlimited: 10000, else as per package
  analysisRemaining: number  // Remaining analysis count
  activatedAt: Timestamp
  expiresAt?: Timestamp     // For time-based packages
  timeRemaining?: number    // Days remaining for time-based packages
  status: 'active' | 'expired' | 'depleted' | 'suspended'
}

export interface PackageDefinition {
  id: string
  name: string
  type: 'time_based' | 'consumption_based' | 'hybrid'
  duration: number          // Days for time-based packages
  analysisLimit: number     // Number of analysis allowed (10000 for unlimited)
  price: number
  currency: string
  features: string[]
  isActive: boolean
  isUnlimited: boolean      // True for unlimited time-based packages
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string         // Admin who created the package
}

export interface Organization {
  id: string
  name: string
  domain?: string  // Email domain for auto-assignment
  description?: string
  industry?: string
  size?: 'startup' | 'small' | 'medium' | 'large' | 'enterprise'
  address?: {
    street: string
    city: string
    state: string
    country: string
    zipCode: string
  }
  settings: OrganizationSettings
  subscription: SubscriptionDetails
  createdAt: Timestamp
  updatedAt: Timestamp
  ownerId: string
  isActive: boolean
  memberCount: number
  adminIds: string[]
}

export interface OrganizationSettings {
  allowSelfSignup: boolean
  requireAdminApproval: boolean
  dataRetentionDays: number
  maxUsersAllowed: number
  enableDepartments: boolean
  allowedDomains: string[]
}

export interface SubscriptionDetails {
  plan: 'free' | 'basic' | 'pro' | 'enterprise'
  status: 'active' | 'trial' | 'expired' | 'cancelled'
  startDate: Timestamp
  endDate?: Timestamp
  features: string[]
  limits: {
    maxUsers: number
    maxUploadsPerMonth: number
    maxStorageGB: number
    apiCallsPerMonth: number
  }
}

export interface UserInvite {
  id: string
  organizationId: string
  email: string
  role: 'org_admin' | 'user' | 'viewer'
  invitedBy: string
  invitedAt: Timestamp
  expiresAt: Timestamp
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  message?: string
}

export interface UserPermissions {
  canUpload: boolean
  canEdit: boolean
  canDelete: boolean
  canDownload: boolean
  canViewOwnData: boolean
  canViewOrgData: boolean  // Organization-wide data access
  canManageOrgUsers: boolean  // Manage users within organization
  canInviteUsers: boolean
  canConfigureOrg: boolean  // Organization settings
  maxFilesPerDay: number
  maxFileSize: number // in MB
  canAccessApi: boolean
  canExportData: boolean
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: string
  timezone: string
  emailNotifications: boolean
  autoSave: boolean
  defaultCurrency: string
}

export interface UserUsageStats {
  totalUploads: number
  totalProcessed: number
  storageUsed: number // in MB
  lastUpload?: Timestamp
  uploadsToday: number
  uploadsThisMonth: number
}

// Default permissions for different organization roles
const ORG_ADMIN_PERMISSIONS: UserPermissions = {
  canUpload: true,
  canEdit: true,
  canDelete: true,
  canDownload: true,
  canViewOwnData: true,
  canViewOrgData: true,
  canManageOrgUsers: true,
  canInviteUsers: true,
  canConfigureOrg: true,
  maxFilesPerDay: 500,
  maxFileSize: 50,
  canAccessApi: true,
  canExportData: true
}

const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  canUpload: true,
  canEdit: true,
  canDelete: true,
  canDownload: true,
  canViewOwnData: true,
  canViewOrgData: false,
  canManageOrgUsers: false,
  canInviteUsers: false,
  canConfigureOrg: false,
  maxFilesPerDay: 100,
  maxFileSize: 10,
  canAccessApi: false,
  canExportData: true
}

const VIEWER_PERMISSIONS: UserPermissions = {
  canUpload: false,
  canEdit: false,
  canDelete: false,
  canDownload: true,
  canViewOwnData: true,
  canViewOrgData: false,
  canManageOrgUsers: false,
  canInviteUsers: false,
  canConfigureOrg: false,
  maxFilesPerDay: 0,
  maxFileSize: 0,
  canAccessApi: false,
  canExportData: false
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'auto',
  language: 'en',
  timezone: 'UTC',
  emailNotifications: true,
  autoSave: true,
  defaultCurrency: 'INR'
}

const DEFAULT_USAGE: UserUsageStats = {
  totalUploads: 0,
  totalProcessed: 0,
  storageUsed: 0,
  uploadsToday: 0,
  uploadsThisMonth: 0
}

const DEFAULT_PAYMENT_STATUS: PaymentStatus = {
  status: 'pending',
  amount: 0,
  currency: 'INR',
  paymentMethod: 'upi',
  subscriptionType: 'trial',
  autoRenew: false,
  paymentHistory: [],
  expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) // 7 days trial
}

export class UserService {
  /**
   * Get permissions for a specific role
   */
  getPermissionsForRole(role: UserProfile['organizationRole']): UserPermissions {
    switch (role) {
      case 'admin':
        return ORG_ADMIN_PERMISSIONS
      case 'viewer':
        return VIEWER_PERMISSIONS
      case 'member':
      default:
        return DEFAULT_USER_PERMISSIONS
    }
  }

  /**
   * Determine organization ID for a user based on email domain or invite
   */
  async determineOrganizationId(email: string): Promise<string> {
    try {
      // First check for pending invites
      const invitesRef = collection(db, 'user_invites')
      const inviteQuery = query(invitesRef, 
        where('email', '==', email),
        where('status', '==', 'pending')
      )
      const inviteSnapshot = await getDocs(inviteQuery)
      
      if (!inviteSnapshot.empty) {
        const invite = inviteSnapshot.docs[0].data() as UserInvite
        return invite.organizationId
      }

      // Check for domain-based auto-assignment
      const domain = email.split('@')[1]
      const orgsRef = collection(db, 'organizations')
      const orgQuery = query(orgsRef, 
        where('settings.allowedDomains', 'array-contains', domain)
      )
      const orgSnapshot = await getDocs(orgQuery)
      
      if (!orgSnapshot.empty) {
        return orgSnapshot.docs[0].id
      }

      // Create default organization for new user
      return await this.createDefaultOrganization(email)
    } catch (error) {
      console.error('❌ Error determining organization:', error)
      // Fallback: Create a simple organization ID based on email domain
      const domain = email.split('@')[1].replace(/\./g, '-')
      const fallbackOrgId = `org-${domain}-${Date.now()}`
      console.log(`🔄 Using fallback organization ID: ${fallbackOrgId}`)
      
      try {
        // Try to create the fallback organization
        return await this.createDefaultOrganization(email)
      } catch (createError) {
        console.error('❌ Failed to create organization, using fallback ID:', createError)
        return fallbackOrgId
      }
    }
  }

  /**
   * Create an organization with a custom name (for onboarding)
   */
  async createOrganizationWithName(organizationName: string, ownerEmail?: string): Promise<string> {
    const orgRef = doc(collection(db, 'organizations'))
    
    const organization: Organization = {
      id: orgRef.id,
      name: organizationName,
      domain: 'custom', // Generic domain for manually created orgs
      description: `Custom organization: ${organizationName}`,
      settings: {
        allowSelfSignup: false,
        requireAdminApproval: true,
        dataRetentionDays: 90,
        maxUsersAllowed: 25,
        enableDepartments: false,
        allowedDomains: [] // No domain restrictions for custom orgs
      },
      subscription: {
        plan: 'free',
        status: 'trial',
        startDate: serverTimestamp() as Timestamp,
        features: ['basic_processing', 'document_viewer'],
        limits: {
          maxUsers: 10,
          maxUploadsPerMonth: 500,
          maxStorageGB: 5,
          apiCallsPerMonth: 2000
        }
      },
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      ownerId: '', // Will be updated when user is assigned
      isActive: true,
      memberCount: 1,
      adminIds: []
    }

    await setDoc(orgRef, organization)
    console.log(`✅ Created custom organization: ${organizationName} with ID: ${orgRef.id}`)
    return orgRef.id
  }
  async createDefaultOrganization(ownerEmail: string): Promise<string> {
    const orgRef = doc(collection(db, 'organizations'))
    const domain = ownerEmail.split('@')[1]
    
    const organization: Organization = {
      id: orgRef.id,
      name: `${domain} Organization`,
      domain,
      description: 'Auto-created organization',
      settings: {
        allowSelfSignup: false,
        requireAdminApproval: false,
        dataRetentionDays: 90,
        maxUsersAllowed: 10,
        enableDepartments: false,
        allowedDomains: [domain]
      },
      subscription: {
        plan: 'free',
        status: 'trial',
        startDate: serverTimestamp() as Timestamp,
        features: ['basic_processing', 'document_viewer'],
        limits: {
          maxUsers: 5,
          maxUploadsPerMonth: 100,
          maxStorageGB: 1,
          apiCallsPerMonth: 1000
        }
      },
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      ownerId: '', // Will be updated when user is created
      isActive: true,
      memberCount: 1,
      adminIds: []
    }

    await setDoc(orgRef, organization)
    return orgRef.id
  }
  /**
   * Get current user's UID for data isolation
   */
  getCurrentUserUID(): string | null {
    const user = authService.getCurrentUser()
    return user?.uid || null
  }

  /**
   * Get current user's email for legacy compatibility
   */
  getCurrentUserEmail(): string | null {
    const user = authService.getCurrentUser()
    return user?.email || null
  }

  /**
   * Create or update user profile on login
   */
  async createOrUpdateUserProfile(user: User, organizationId?: string): Promise<UserProfile> {
    try {
      const userRef = doc(db, 'users', user.uid)
      const userDoc = await getDoc(userRef)
      
      if (userDoc.exists()) {
        // Update existing user
        const existingProfile = userDoc.data() as UserProfile
        
        // Auto-assign super_admin role to specific email
        const isAdminEmail = user.email === 'maheshgok@gmail.com'
        const updatedRole = isAdminEmail ? 'super_admin' : existingProfile.role
        
        const updatedProfile: Partial<UserProfile> = {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: updatedRole,
          lastLoginAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp
        }
        
        console.log(`🔑 Updating user ${user.email} with role: ${updatedRole}`)
        
        // MIGRATION: Update existing user with payment status if missing
        if (!existingProfile.paymentStatus || isAdminEmail) {
          console.log('🔄 Migrating existing user to new payment system:', user.email)
          const migrationUpdate = {
            ...updatedProfile,
            paymentStatus: isAdminEmail ? {
              status: 'verified',
              amount: 0,
              currency: 'INR',
              paymentMethod: 'admin_override',
              subscriptionType: 'lifetime',
              createdAt: serverTimestamp() as Timestamp,
              verifiedAt: serverTimestamp() as Timestamp,
              verifiedBy: 'system',
              expiresAt: Timestamp.fromDate(new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)),
              paymentHistory: []
            } : DEFAULT_PAYMENT_STATUS,
            updatedAt: serverTimestamp() as Timestamp
          }
          await updateDoc(userRef, migrationUpdate)
          
          return {
            ...existingProfile,
            ...migrationUpdate,
            lastLoginAt: new Date() as any,
            updatedAt: new Date() as any
          }
        }

        await updateDoc(userRef, updatedProfile)
        
        return {
          ...existingProfile,
          ...updatedProfile,
          lastLoginAt: new Date() as any,
          updatedAt: new Date() as any
        }
      } else {
        // Create new user profile
        const finalOrganizationId = organizationId || await this.determineOrganizationId(user.email)
        
        // Auto-assign super_admin role to specific email
        const isAdminEmail = user.email === 'maheshgok@gmail.com'
        const userRole = isAdminEmail ? 'super_admin' : 'user'
        const orgRole = isAdminEmail ? 'admin' : 'member'
        
        console.log(`🔑 Creating new user ${user.email} with role: ${userRole}`)
        
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: userRole,
          organizationId: finalOrganizationId,
          organizationRole: orgRole,
          permissions: this.getPermissionsForRole(orgRole),
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
          lastLoginAt: serverTimestamp() as Timestamp,
          isActive: true,
          preferences: DEFAULT_PREFERENCES,
          usage: DEFAULT_USAGE,
          inviteStatus: 'accepted',
          packageConsumption: 0,
          totalConsumption: 0,
          currentPackageValidity: this.getDefaultPackageValidity(),
          paymentStatus: isAdminEmail ? {
            status: 'verified',
            amount: 0,
            currency: 'INR',
            paymentMethod: 'admin_override',
            subscriptionType: 'lifetime',
            createdAt: serverTimestamp() as Timestamp,
            verifiedAt: serverTimestamp() as Timestamp,
            verifiedBy: 'system',
            expiresAt: Timestamp.fromDate(new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)), // 100 years
            paymentHistory: []
          } : DEFAULT_PAYMENT_STATUS
        }
        
        await setDoc(userRef, newProfile)
        
        return {
          ...newProfile,
          createdAt: new Date() as any,
          updatedAt: new Date() as any,
          lastLoginAt: new Date() as any
        }
      }
    } catch (error) {
      console.error('❌ Error creating/updating user profile:', error)
      throw error
    }
  }

  /**
   * Get user profile by UID
   */
  async getUserProfile(uid?: string): Promise<UserProfile | null> {
    try {
      const targetUID = uid || this.getCurrentUserUID()
      if (!targetUID) return null

      const userRef = doc(db, 'users', targetUID)
      const userDoc = await getDoc(userRef)
      
      return userDoc.exists() ? userDoc.data() as UserProfile : null
    } catch (error) {
      console.error('❌ Error fetching user profile:', error)
      return null
    }
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(permission: keyof UserPermissions): Promise<boolean> {
    try {
      const profile = await this.getUserProfile()
      if (!profile) return false
      
      const permissionValue = profile.permissions[permission]
      return typeof permissionValue === 'boolean' ? permissionValue : false
    } catch (error) {
      console.error('❌ Error checking permission:', error)
      return false
    }
  }

  /**
   * Check usage limits
   */
  async checkUsageLimits(): Promise<{
    canUpload: boolean
    reason?: string
    remainingUploads?: number
  }> {
    try {
      const profile = await this.getUserProfile()
      if (!profile) return { canUpload: false, reason: 'User profile not found' }

      const { permissions, usage } = profile
      
      // Check if user can upload
      if (!permissions.canUpload) {
        return { canUpload: false, reason: 'Upload permission denied' }
      }

      // Check daily limit
      if (usage.uploadsToday >= permissions.maxFilesPerDay) {
        return { 
          canUpload: false, 
          reason: `Daily upload limit reached (${permissions.maxFilesPerDay})` 
        }
      }

      return { 
        canUpload: true, 
        remainingUploads: permissions.maxFilesPerDay - usage.uploadsToday 
      }
    } catch (error) {
      console.error('❌ Error checking usage limits:', error)
      return { canUpload: false, reason: 'Error checking limits' }
    }
  }

  /**
   * Update usage statistics
   */
  async updateUsageStats(stats: Partial<UserUsageStats>): Promise<void> {
    try {
      const uid = this.getCurrentUserUID()
      if (!uid) return

      const userRef = doc(db, 'users', uid)
      await updateDoc(userRef, {
        usage: stats,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('❌ Error updating usage stats:', error)
    }
  }

  /**
   * Increment upload counter
   */
  async incrementUploadCount(): Promise<void> {
    try {
      const profile = await this.getUserProfile()
      if (!profile) return

      const updatedUsage: UserUsageStats = {
        ...profile.usage,
        totalUploads: profile.usage.totalUploads + 1,
        uploadsToday: profile.usage.uploadsToday + 1,
        uploadsThisMonth: profile.usage.uploadsThisMonth + 1,
        lastUpload: serverTimestamp() as Timestamp
      }

      await this.updateUsageStats(updatedUsage)
    } catch (error) {
      console.error('❌ Error incrementing upload count:', error)
    }
  }

  /**
   * Get default package validity for new users
   */
  private getDefaultPackageValidity(): PackageValidity {
    return {
      packageId: 'default-trial',
      packageName: 'Trial Package',
      packageType: 'consumption_based',
      analysisLimit: 5,
      analysisRemaining: 5,
      activatedAt: serverTimestamp() as Timestamp,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 days
      timeRemaining: 7,
      status: 'active'
    }
  }

  /**
   * Reset daily usage counters (called by scheduler)
   */
  async resetDailyUsage(): Promise<void> {
    try {
      const usersRef = collection(db, 'users')
      const snapshot = await getDocs(usersRef)
      
      const batch = writeBatch(db)

      snapshot.forEach((doc) => {
        const userRef = doc.ref
        batch.update(userRef, {
          'usage.uploadsToday': 0,
          updatedAt: serverTimestamp()
        })
      })

      await batch.commit()
    } catch (error) {
      console.error('❌ Error resetting daily usage:', error)
    }
  }

  /**
   * Get user's data namespace for Firestore collections
   */
  getUserDataPath(collectionName: string): string {
    const uid = this.getCurrentUserUID()
    if (!uid) throw new Error('User not authenticated')
    
    return `users/${uid}/${collectionName}`
  }

  /**
   * Check file size against user limits
   */
  async validateFileSize(fileSizeInMB: number): Promise<{
    isValid: boolean
    reason?: string
    maxAllowed?: number
  }> {
    try {
      const profile = await this.getUserProfile()
      if (!profile) return { isValid: false, reason: 'User profile not found' }

      const maxSize = profile.permissions.maxFileSize
      
      if (fileSizeInMB > maxSize) {
        return {
          isValid: false,
          reason: `File size exceeds limit of ${maxSize}MB`,
          maxAllowed: maxSize
        }
      }

      return { isValid: true }
    } catch (error) {
      console.error('❌ Error validating file size:', error)
      return { isValid: false, reason: 'Error validating file size' }
    }
  }

  /**
   * Admin function: Update user permissions
   */
  async updateUserPermissions(targetUID: string, permissions: Partial<UserPermissions>): Promise<void> {
    try {
      // Check if current user is admin
      const currentProfile = await this.getUserProfile()
      if (!currentProfile?.permissions.canManageOrgUsers) {
        throw new Error('Insufficient permissions to manage users')
      }

      const userRef = doc(db, 'users', targetUID)
      await updateDoc(userRef, {
        permissions: permissions,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('❌ Error updating user permissions:', error)
      throw error
    }
  }

  /**
   * Create user invitation
   */
  async inviteUser(email: string, role: 'org_admin' | 'user' | 'viewer', message?: string): Promise<string> {
    try {
      const currentProfile = await this.getUserProfile()
      if (!currentProfile?.permissions.canInviteUsers) {
        throw new Error('Insufficient permissions to invite users')
      }

      // Check if user already exists
      const usersRef = collection(db, 'users')
      const existingUserQuery = query(usersRef, where('email', '==', email))
      const existingUserSnapshot = await getDocs(existingUserQuery)
      
      if (!existingUserSnapshot.empty) {
        throw new Error('User already exists in the system')
      }

      // Create invitation
      const inviteRef = doc(collection(db, 'user_invites'))
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

      const invite: UserInvite = {
        id: inviteRef.id,
        organizationId: currentProfile.organizationId,
        email,
        role,
        invitedBy: currentProfile.uid,
        invitedAt: serverTimestamp() as Timestamp,
        expiresAt: expiresAt as any,
        status: 'pending',
        message
      }

      await setDoc(inviteRef, invite)
      
      // TODO: Send invitation email
      console.log(`📧 User invitation created for ${email} to organization ${currentProfile.organizationId}`)
      
      return inviteRef.id
    } catch (error) {
      console.error('❌ Error creating user invitation:', error)
      throw error
    }
  }

  /**
   * Accept user invitation
   */
  async acceptInvitation(inviteId: string): Promise<void> {
    try {
      const inviteRef = doc(db, 'user_invites', inviteId)
      const inviteDoc = await getDoc(inviteRef)
      
      if (!inviteDoc.exists()) {
        throw new Error('Invitation not found')
      }

      const invite = inviteDoc.data() as UserInvite
      
      if (invite.status !== 'pending') {
        throw new Error('Invitation is no longer valid')
      }

      if (invite.expiresAt.toDate() < new Date()) {
        throw new Error('Invitation has expired')
      }

      // Update invitation status
      await updateDoc(inviteRef, {
        status: 'accepted',
        updatedAt: serverTimestamp()
      })

    } catch (error) {
      console.error('❌ Error accepting invitation:', error)
      throw error
    }
  }

  /**
   * Get organization info
   */
  async getOrganization(orgId?: string): Promise<Organization | null> {
    try {
      const currentProfile = await this.getUserProfile()
      const targetOrgId = orgId || currentProfile?.organizationId
      
      if (!targetOrgId) return null

      const orgRef = doc(db, 'organizations', targetOrgId)
      const orgDoc = await getDoc(orgRef)
      
      return orgDoc.exists() ? orgDoc.data() as Organization : null
    } catch (error) {
      console.error('❌ Error fetching organization:', error)
      return null
    }
  }

  /**
   * Admin function: List all users in organization
   */
  async getOrganizationUsers(): Promise<UserProfile[]> {
    try {
      // Check if current user is admin
      const currentProfile = await this.getUserProfile()
      if (!currentProfile?.permissions.canManageOrgUsers) {
        throw new Error('Insufficient permissions to view organization users')
      }

      const usersRef = collection(db, 'users')
      const q = query(usersRef, where('organizationId', '==', currentProfile.organizationId))
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map(doc => doc.data() as UserProfile)
    } catch (error) {
      console.error('❌ Error fetching organization users:', error)
      throw error
    }
  }

  /**
   * Initialize payment for new user
   */
  async initializePayment(amount: number, subscriptionType: PaymentStatus['subscriptionType']): Promise<PaymentStatus> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('User not authenticated')

      const defaultPaymentStatus: PaymentStatus = {
        status: 'pending',
        amount: amount,
        currency: 'INR',
        paymentMethod: 'upi',
        subscriptionType: subscriptionType,
        autoRenew: false,
        paymentHistory: [],
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)) // 24 hours
      }

      // Update user profile with payment status
      const userRef = doc(db, 'users', currentUser.uid)
      await updateDoc(userRef, {
        paymentStatus: defaultPaymentStatus,
        updatedAt: serverTimestamp()
      })

      console.log('💳 Payment initialized for user:', currentUser.uid)
      return defaultPaymentStatus
    } catch (error) {
      console.error('❌ Error initializing payment:', error)
      throw error
    }
  }

  /**
   * Check if user has valid payment/subscription
   */
  async hasValidSubscription(): Promise<boolean> {
    try {
      const profile = await this.getUserProfile()
      if (!profile?.paymentStatus) return false

      const { status, expiresAt } = profile.paymentStatus
      
      // Check status
      if (['verified', 'free_trial'].includes(status)) {
        // Check expiration if applicable
        if (expiresAt && expiresAt.toDate() < new Date()) {
          return false
        }
        return true
      }

      return false
    } catch (error) {
      console.error('❌ Error checking subscription:', error)
      return false
    }
  }

  /**
   * Update payment status (user function)
   */
  async updatePaymentStatus(update: Partial<PaymentStatus>): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('User not authenticated')

      const userRef = doc(db, 'users', currentUser.uid)
      const userDoc = await getDoc(userRef)
      
      if (!userDoc.exists()) {
        throw new Error('User profile not found')
      }

      const userData = userDoc.data() as UserProfile
      const currentPaymentStatus = userData.paymentStatus

      if (!currentPaymentStatus) {
        throw new Error('No payment record found')
      }

      // Add paidAt timestamp if status is being set to 'paid'
      if (update.status === 'paid' && !update.paidAt) {
        update.paidAt = serverTimestamp() as Timestamp
      }

      const updatedPaymentStatus: PaymentStatus = {
        ...currentPaymentStatus,
        ...update
      }

      // Update user profile
      await updateDoc(userRef, {
        paymentStatus: updatedPaymentStatus,
        updatedAt: serverTimestamp()
      })

      console.log('💳 Payment status updated for user:', currentUser.uid)
    } catch (error) {
      console.error('❌ Error updating payment status:', error)
      throw error
    }
  }

  /**
   * Admin function: Verify user payment manually
   */
  async verifyUserPayment(userUid: string, transactionRef?: string, notes?: string): Promise<void> {
    try {
      console.log('🔥 PAYMENT VERIFICATION V2 - NEW CODE LOADED') // Debug marker to verify new code is loaded
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('Admin not authenticated')

      // Check admin permissions (could be enhanced to check specific admin role)
      const currentProfile = await this.getUserProfile()
      if (currentProfile?.role !== 'super_admin') {
        throw new Error('Only super admins can verify payments')
      }

      const userRef = doc(db, 'users', userUid)
      const userDoc = await getDoc(userRef)
      
      if (!userDoc.exists()) {
        throw new Error('User not found')
      }

      const userData = userDoc.data() as UserProfile
      const currentPaymentStatus = userData.paymentStatus

      if (!currentPaymentStatus) {
        throw new Error('No payment record found for user')
      }

      // Create payment record
      const paymentRecord: PaymentRecord = {
        id: `payment_${Date.now()}`,
        amount: currentPaymentStatus.amount,
        currency: currentPaymentStatus.currency,
        paymentMethod: currentPaymentStatus.paymentMethod,
        status: 'completed',
        transactionRef: transactionRef,
        paidAt: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for array elements
        verifiedBy: currentUser.uid,
        notes: notes
      }

      // Calculate expiration based on subscription type
      let expiresAt: Timestamp
      const now = new Date()
      switch (currentPaymentStatus.subscriptionType) {
        case 'monthly':
          expiresAt = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()))
          break
        case 'yearly':
          expiresAt = Timestamp.fromDate(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()))
          break
        case 'lifetime':
          expiresAt = Timestamp.fromDate(new Date(now.getFullYear() + 100, now.getMonth(), now.getDate()))
          break
        case 'trial':
          expiresAt = Timestamp.fromDate(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) // 7 days
          break
        default:
          expiresAt = Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()))
      }

      // Create clean payment history without any potential serverTimestamp objects
      const existingHistory = currentPaymentStatus.paymentHistory || []
      const cleanHistory = existingHistory.map(record => ({
        ...record,
        // Ensure timestamps are converted to proper Timestamp objects
        paidAt: record.paidAt instanceof Timestamp ? record.paidAt : Timestamp.now()
      }))

      // Update payment status - create new object to avoid serverTimestamp issues
      const updatedPaymentStatus: PaymentStatus = {
        status: 'verified',
        amount: currentPaymentStatus.amount,
        currency: currentPaymentStatus.currency,
        paymentMethod: currentPaymentStatus.paymentMethod,
        subscriptionType: currentPaymentStatus.subscriptionType,
        autoRenew: currentPaymentStatus.autoRenew || false,
        transactionRef: transactionRef,
        verifiedAt: Timestamp.now(),
        verifiedBy: currentUser.uid,
        expiresAt: expiresAt,
        // Ensure createdAt is a proper Timestamp, not serverTimestamp()
        createdAt: (currentPaymentStatus.createdAt && currentPaymentStatus.createdAt instanceof Timestamp) 
          ? currentPaymentStatus.createdAt 
          : Timestamp.now(),
        paymentHistory: [...cleanHistory, paymentRecord]
      }

      // Update user profile
      await updateDoc(userRef, {
        paymentStatus: updatedPaymentStatus,
        isActive: true,
        updatedAt: serverTimestamp()
      })

      console.log('✅ Payment verified for user:', userUid)
    } catch (error) {
      console.error('❌ Error verifying payment:', error)
      throw error
    }
  }

  /**
   * Verify user payment for subscription renewal (for user self-service)
   */
  async verifyUserSubscriptionPayment(transactionId: string, amount: string, periodDays: number): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('User not authenticated')

      const userRef = doc(db, 'users', currentUser.uid)
      const now = new Date()
      const expiryDate = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000)
      
      const paymentStatus = {
        isPaid: true,
        expiresAt: Timestamp.fromDate(expiryDate),
        lastPayment: {
          transactionId,
          amount: parseInt(amount),
          paidAt: Timestamp.now(),
          method: 'UPI'
        },
        plan: `${periodDays} days`,
        paymentHistory: [
          {
            transactionId,
            amount: parseInt(amount),
            paidAt: Timestamp.now(),
            method: 'UPI',
            periodDays
          }
        ]
      }

      await updateDoc(userRef, {
        paymentStatus,
        isActive: true,
        updatedAt: serverTimestamp()
      })

      console.log('✅ User subscription payment verified successfully')
    } catch (error) {
      console.error('❌ Error verifying subscription payment:', error)
      throw error
    }
  }

  /**
   * Get all pending payments (admin function)
   */
  async getPendingPayments(): Promise<Array<UserProfile & { id: string }>> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('Admin not authenticated')

      // Check admin permissions
      const currentProfile = await this.getUserProfile()
      if (currentProfile?.role !== 'super_admin') {
        throw new Error('Only super admins can view pending payments')
      }

      const usersRef = collection(db, 'users')
      const q = query(usersRef, where('paymentStatus.status', 'in', ['pending', 'paid']))
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as UserProfile
      }))
    } catch (error) {
      console.error('❌ Error fetching pending payments:', error)
      throw error
    }
  }

  /**
   * Get super admin configuration
   */
  async getSuperAdminConfig(): Promise<any> {
    try {
      const configRef = doc(db, 'system_config', 'super_admin')
      const configDoc = await getDoc(configRef)
      
      if (configDoc.exists()) {
        return configDoc.data()
      }
      
      // Return default config if none exists
      return {
        allowedEmails: ['maheshgok@gmail.com'],
        upiConfig: {
          vpa: 'maheshgok@paytm',
          name: 'Invoice Processor',
          businessName: 'Invoice Processing Services',
          qrCodeUrl: '',
          isActive: true
        },
        systemSettings: {
          maintenanceMode: false,
          newRegistrations: true,
          paymentVerificationAuto: false
        },
        updatedAt: serverTimestamp()
      }
    } catch (error) {
      console.error('❌ Error loading super admin config:', error)
      throw error
    }
  }

  /**
   * Save super admin configuration
   */
  async saveSuperAdminConfig(config: any): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('Admin not authenticated')

      const currentProfile = await this.getUserProfile()
      if (currentProfile?.role !== 'super_admin') {
        throw new Error('Only super admins can modify system configuration')
      }

      const configRef = doc(db, 'system_config', 'super_admin')
      const configData = {
        ...config,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      }
      
      await setDoc(configRef, configData)
      console.log('✅ Super admin config saved successfully')
    } catch (error) {
      console.error('❌ Error saving super admin config:', error)
      throw error
    }
  }

  /**
   * Check if email is super admin
   */
  async isSuperAdmin(email: string): Promise<boolean> {
    try {
      const config = await this.getSuperAdminConfig()
      return config.allowedEmails.includes(email.toLowerCase())
    } catch (error) {
      console.error('❌ Error checking super admin status:', error)
      return email === 'maheshgok@gmail.com' // Fallback to hardcoded admin
    }
  }

  /**
   * Get UPI configuration for payments
   */
  async getUPIConfig(): Promise<any> {
    try {
      const config = await this.getSuperAdminConfig()
      return config.upiConfig
    } catch (error) {
      console.error('❌ Error loading UPI config:', error)
      // Return default UPI config
      return {
        vpa: 'maheshgok@paytm',
        name: 'Invoice Processor',
        businessName: 'Invoice Processing Services',
        qrCodeUrl: '',
        isActive: true
      }
    }
  }

  /**
   * Get all users for admin management (super admin only)
   */
  async getAllUsersForAdmin(): Promise<Array<UserProfile & { id: string }>> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('Admin not authenticated')

      // Check admin permissions
      const currentProfile = await this.getUserProfile()
      if (currentProfile?.role !== 'super_admin') {
        throw new Error('Only super admins can view all users')
      }

      const usersRef = collection(db, 'users')
      const snapshot = await getDocs(usersRef)
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as UserProfile
      }))
    } catch (error) {
      console.error('❌ Error fetching all users:', error)
      throw error
    }
  }

  /**
   * Suspend user service (super admin only)
   */
  async suspendUserService(userUid: string): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('Admin not authenticated')

      const currentProfile = await this.getUserProfile()
      if (currentProfile?.role !== 'super_admin') {
        throw new Error('Only super admins can suspend users')
      }

      const userRef = doc(db, 'users', userUid)
      await updateDoc(userRef, {
        isActive: false,
        suspendedAt: serverTimestamp(),
        suspendedBy: currentUser.uid,
        updatedAt: serverTimestamp()
      })

      console.log('✅ User service suspended:', userUid)
    } catch (error) {
      console.error('❌ Error suspending user service:', error)
      throw error
    }
  }

  /**
   * Activate user service (super admin only)
   */
  async activateUserService(userUid: string): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('Admin not authenticated')

      const currentProfile = await this.getUserProfile()
      if (currentProfile?.role !== 'super_admin') {
        throw new Error('Only super admins can activate users')
      }

      const userRef = doc(db, 'users', userUid)
      await updateDoc(userRef, {
        isActive: true,
        suspendedAt: null,
        suspendedBy: null,
        reactivatedAt: serverTimestamp(),
        reactivatedBy: currentUser.uid,
        updatedAt: serverTimestamp()
      })

      console.log('✅ User service activated:', userUid)
    } catch (error) {
      console.error('❌ Error activating user service:', error)
      throw error
    }
  }

  /**
   * Extend user subscription (super admin only)
   */
  async extendSubscription(userUid: string, days: number): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('Admin not authenticated')

      const currentProfile = await this.getUserProfile()
      if (currentProfile?.role !== 'super_admin') {
        throw new Error('Only super admins can extend subscriptions')
      }

      const userRef = doc(db, 'users', userUid)
      const userDoc = await getDoc(userRef)
      
      if (!userDoc.exists()) {
        throw new Error('User not found')
      }

      const userData = userDoc.data() as UserProfile
      const currentExpiresAt = userData.paymentStatus?.expiresAt
      
      let newExpiresAt: Timestamp
      if (currentExpiresAt) {
        const currentExpiry = currentExpiresAt.toDate ? currentExpiresAt.toDate() : new Date(currentExpiresAt)
        const extendedDate = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000)
        newExpiresAt = Timestamp.fromDate(extendedDate)
      } else {
        const extendedDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        newExpiresAt = Timestamp.fromDate(extendedDate)
      }

      const updatedPaymentStatus = {
        ...userData.paymentStatus,
        expiresAt: newExpiresAt,
        extendedAt: serverTimestamp(),
        extendedBy: currentUser.uid,
        extendedDays: days
      }

      await updateDoc(userRef, {
        paymentStatus: updatedPaymentStatus,
        isActive: true,
        updatedAt: serverTimestamp()
      })

      console.log(`✅ Subscription extended by ${days} days for user:`, userUid)
    } catch (error) {
      console.error('❌ Error extending subscription:', error)
      throw error
    }
  }

  /**
   * Record successful analysis completion and update consumption
   */
  async recordAnalysisCompletion(userUid?: string): Promise<boolean> {
    try {
      const currentUserUid = userUid || this.getCurrentUserUID()
      if (!currentUserUid) throw new Error('User not authenticated')

      const userRef = doc(db, 'users', currentUserUid)
      const userDoc = await getDoc(userRef)
      
      if (!userDoc.exists()) {
        throw new Error('User profile not found')
      }

      const userData = userDoc.data() as UserProfile
      const currentValidity = userData.currentPackageValidity

      // Check if user has remaining analysis credits
      if (currentValidity.analysisRemaining <= 0) {
        console.log('❌ No analysis credits remaining')
        return false
      }

      // Check if package is expired
      if (currentValidity.status === 'expired' || currentValidity.status === 'depleted') {
        console.log('❌ Package is expired or depleted')
        return false
      }

      // Update consumption counters
      const newPackageConsumption = userData.packageConsumption + 1
      const newTotalConsumption = userData.totalConsumption + 1
      const newAnalysisRemaining = Math.max(0, currentValidity.analysisRemaining - 1)

      // Update package validity status
      const updatedValidity: PackageValidity = {
        ...currentValidity,
        analysisRemaining: newAnalysisRemaining,
        status: newAnalysisRemaining <= 0 ? 'depleted' : currentValidity.status
      }

      // Update user document
      await updateDoc(userRef, {
        packageConsumption: newPackageConsumption,
        totalConsumption: newTotalConsumption,
        currentPackageValidity: updatedValidity,
        updatedAt: serverTimestamp()
      })

      console.log(`✅ Analysis recorded for user ${currentUserUid}:`, {
        packageConsumption: newPackageConsumption,
        totalConsumption: newTotalConsumption,
        analysisRemaining: newAnalysisRemaining
      })

      return true
    } catch (error) {
      console.error('❌ Error recording analysis completion:', error)
      return false
    }
  }

  /**
   * Check if user can perform analysis based on current package validity
   */
  async canPerformAnalysis(userUid?: string): Promise<boolean> {
    try {
      const currentUserUid = userUid || this.getCurrentUserUID()
      if (!currentUserUid) return false

      const userProfile = await this.getUserProfile(currentUserUid)
      if (!userProfile) return false

      // Super admin bypass
      if (userProfile.role === 'super_admin') return true

      const validity = userProfile.currentPackageValidity
      
      // Check if package is active
      if (validity.status !== 'active') return false
      
      // Check analysis credits
      if (validity.analysisRemaining <= 0) return false
      
      // Check time expiry for time-based packages
      if (validity.expiresAt) {
        const now = new Date()
        const expiryDate = validity.expiresAt.toDate()
        if (expiryDate <= now) {
          // Update status to expired
          await this.updatePackageStatus(currentUserUid, 'expired')
          return false
        }
      }

      return true
    } catch (error) {
      console.error('❌ Error checking analysis permission:', error)
      return false
    }
  }

  /**
   * Update package validity status
   */
  private async updatePackageStatus(userUid: string, status: 'active' | 'expired' | 'depleted' | 'suspended'): Promise<void> {
    try {
      const userRef = doc(db, 'users', userUid)
      const userDoc = await getDoc(userRef)
      
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserProfile
        const updatedValidity = {
          ...userData.currentPackageValidity,
          status: status
        }
        
        await updateDoc(userRef, {
          currentPackageValidity: updatedValidity,
          updatedAt: serverTimestamp()
        })
      }
    } catch (error) {
      console.error('❌ Error updating package status:', error)
    }
  }

  /**
   * Assign package to user with consumption tracking
   */
  async assignPackageToUser(userUid: string, packageData: {
    packageId: string
    packageName: string
    packageType: 'time_based' | 'consumption_based' | 'hybrid'
    duration?: number
    analysisLimit?: number
    isUnlimited?: boolean
  }): Promise<void> {
    try {
      const userRef = doc(db, 'users', userUid)
      const userDoc = await getDoc(userRef)
      
      if (!userDoc.exists()) {
        throw new Error('User not found')
      }

      const userData = userDoc.data() as UserProfile
      
      // Calculate analysis limit (10000 for unlimited time-based packages)
      const analysisLimit = packageData.isUnlimited ? 10000 : (packageData.analysisLimit || 100)
      
      // Calculate expiry date for time-based packages
      let expiresAt: Timestamp | undefined
      let timeRemaining: number | undefined
      
      if (packageData.packageType === 'time_based' || packageData.packageType === 'hybrid') {
        const days = packageData.duration || 30
        expiresAt = Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000))
        timeRemaining = days
      }

      // Create new package validity
      const newPackageValidity: PackageValidity = {
        packageId: packageData.packageId,
        packageName: packageData.packageName,
        packageType: packageData.packageType,
        analysisLimit: analysisLimit,
        analysisRemaining: analysisLimit,
        activatedAt: serverTimestamp() as Timestamp,
        expiresAt: expiresAt,
        timeRemaining: timeRemaining,
        status: 'active'
      }

      // Update user profile
      await updateDoc(userRef, {
        packageConsumption: 0, // Reset package consumption for new package
        currentPackageValidity: newPackageValidity,
        paymentStatus: {
          ...userData.paymentStatus,
          status: 'verified',
          expiresAt: expiresAt
        },
        updatedAt: serverTimestamp()
      })

      console.log(`✅ Package assigned to user ${userUid}:`, newPackageValidity)
    } catch (error) {
      console.error('❌ Error assigning package to user:', error)
      throw error
    }
  }

  /**
   * Get user usage statistics
   */
  async getUserUsageStats(userUid?: string) {
    try {
      const currentUserUid = userUid || this.getCurrentUserUID()
      if (!currentUserUid) return null

      const userProfile = await this.getUserProfile(currentUserUid)
      if (!userProfile) return null

      const validity = userProfile.currentPackageValidity
      
      // Calculate time remaining
      let daysRemaining: number | undefined
      let subscriptionStatus: 'active' | 'expired' | 'expiring' = 'active'
      
      if (validity.expiresAt) {
        const now = new Date()
        const expiryDate = validity.expiresAt.toDate()
        daysRemaining = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        
        if (daysRemaining <= 0) {
          subscriptionStatus = 'expired'
        } else if (daysRemaining <= 15) {
          subscriptionStatus = 'expiring'
        }
      }

      return {
        packageConsumption: userProfile.packageConsumption,
        totalConsumption: userProfile.totalConsumption,
        packageType: validity.packageType,
        analysisLimit: validity.analysisLimit,
        analysisRemaining: validity.analysisRemaining,
        remainingCredits: validity.analysisRemaining,
        daysRemaining: daysRemaining,
        subscriptionStatus: subscriptionStatus,
        packageName: validity.packageName,
        packageStatus: validity.status
      }
    } catch (error) {
      console.error('❌ Error getting usage stats:', error)
      return null
    }
  }

  /**
   * Send payment reminder to user
   */
  async sendPaymentReminder(userUid: string): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) throw new Error('Admin not authenticated')

      const currentProfile = await this.getUserProfile()
      if (currentProfile?.role !== 'super_admin') {
        throw new Error('Only super admins can send payment reminders')
      }

      // TODO: Implement email service integration
      // For now, just log the action
      console.log('📧 Payment reminder sent to user:', userUid)
    } catch (error) {
      console.error('❌ Error sending payment reminder:', error)
      throw error
    }
  }

  /**
   * Track analysis completion for consumption-based packages
   */
  async incrementAnalysisCount(userUid?: string): Promise<boolean> {
    try {
      const targetUserUid = userUid || this.getCurrentUserUID()
      if (!targetUserUid) throw new Error('User not authenticated')

      const userRef = doc(this.db, 'users', targetUserUid)
      const userDoc = await getDoc(userRef)
      
      if (!userDoc.exists()) {
        throw new Error('User not found')
      }

      const userData = userDoc.data() as UserProfile
      const currentAnalysisCount = userData.analysisCount || 0
      const analysisLimit = userData.analysisLimit || 0
      const packageType = userData.currentPackageType

      // Check if user has consumption-based package and remaining credits
      if ((packageType === 'consumption_based' || packageType === 'hybrid') && analysisLimit > 0) {
        if (currentAnalysisCount >= analysisLimit) {
          console.log('⚠️ User has reached analysis limit:', targetUserUid)
          return false // Analysis limit reached
        }
      }

      // Increment analysis count and update remaining credits
      const newAnalysisCount = currentAnalysisCount + 1
      const newRemainingCredits = Math.max(0, analysisLimit - newAnalysisCount)

      await updateDoc(userRef, {
        analysisCount: newAnalysisCount,
        remainingCredits: newRemainingCredits,
        updatedAt: serverTimestamp()
      })

      console.log('📊 Analysis count incremented for user:', targetUserUid, 'New count:', newAnalysisCount)
      return true // Analysis allowed
    } catch (error) {
      console.error('❌ Error incrementing analysis count:', error)
      throw error
    }
  }







  /**
   * Create a new user session
   */
  async createUserSession(session: UserSession): Promise<void> {
    try {
      const sessionRef = doc(db, `users/${session.userUid}/sessions`, session.sessionId)
      await setDoc(sessionRef, {
        ...session,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      })
      console.log('✅ User session created:', session.sessionId)
    } catch (error) {
      console.error('❌ Error creating user session:', error)
      throw error
    }
  }

  /**
   * Get user's active sessions
   */
  async getUserActiveSessions(userUid: string): Promise<UserSession[]> {
    try {
      const sessionsRef = collection(db, `users/${userUid}/sessions`)
      const activeSessionsQuery = query(
        sessionsRef,
        where('isActive', '==', true),
        orderBy('lastActivity', 'desc')
      )
      
      const snapshot = await getDocs(activeSessionsQuery)
      return snapshot.docs.map(doc => ({ ...doc.data(), sessionId: doc.id } as UserSession))
    } catch (error) {
      console.error('❌ Error getting active sessions:', error)
      return []
    }
  }

  /**
   * Validate user session
   */
  async validateUserSession(sessionId: string): Promise<boolean> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return false

      const sessionRef = doc(db, `users/${currentUser.uid}/sessions`, sessionId)
      const sessionDoc = await getDoc(sessionRef)
      
      if (!sessionDoc.exists()) return false
      
      const session = sessionDoc.data() as UserSession
      
      // Check if session is active and not too old
      const now = new Date()
      const lastActivity = session.lastActivity.toDate()
      const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60)
      
      if (!session.isActive || hoursSinceActivity > 24) {
        await this.deactivateUserSession(sessionId)
        return false
      }
      
      return true
    } catch (error) {
      console.error('❌ Error validating session:', error)
      return false
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return

      const sessionRef = doc(db, `users/${currentUser.uid}/sessions`, sessionId)
      await updateDoc(sessionRef, {
        lastActivity: serverTimestamp()
      })
    } catch (error) {
      console.error('❌ Error updating session activity:', error)
    }
  }

  /**
   * Deactivate user session
   */
  async deactivateUserSession(sessionId: string): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return

      const sessionRef = doc(db, `users/${currentUser.uid}/sessions`, sessionId)
      await updateDoc(sessionRef, {
        isActive: false,
        deactivatedAt: serverTimestamp()
      })
      console.log('✅ Session deactivated:', sessionId)
    } catch (error) {
      console.error('❌ Error deactivating session:', error)
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(userUid: string): Promise<void> {
    try {
      const sessionsRef = collection(db, `users/${userUid}/sessions`)
      const sessionsQuery = query(
        sessionsRef,
        where('isActive', '==', true)
      )
      
      const snapshot = await getDocs(sessionsQuery)
      const batch = writeBatch(db)
      let expiredCount = 0
      
      const now = new Date()
      snapshot.docs.forEach(doc => {
        const session = doc.data() as UserSession
        const lastActivity = session.lastActivity.toDate()
        const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60)
        
        if (hoursSinceActivity > 24) {
          batch.update(doc.ref, {
            isActive: false,
            deactivatedAt: serverTimestamp()
          })
          expiredCount++
        }
      })
      
      if (expiredCount > 0) {
        await batch.commit()
        console.log(`✅ Cleaned up ${expiredCount} expired sessions`)
      }
    } catch (error) {
      console.error('❌ Error cleaning up expired sessions:', error)
    }
  }
}

export const userService = new UserService()