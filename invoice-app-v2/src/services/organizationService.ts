/**
 * Organization Service
 * Handles organization creation, management, and user invitation
 */

import { 
  doc, 
  collection, 
  setDoc, 
  updateDoc, 
  getDoc, 
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
  runTransaction
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import { userService } from './userService'
import type { 
  Organization, 
  UserProfile, 
  UserInvite,
  OrganizationSettings,
  SubscriptionDetails 
} from './userService'

interface OrganizationFormData {
  name: string
  domain: string
  description?: string
  industry?: string
  size: 'startup' | 'small' | 'medium' | 'large' | 'enterprise'
  address: {
    street: string
    city: string
    state: string
    country: string
    zipCode: string
  }
  settings: Partial<OrganizationSettings>
}

interface AdminUserData {
  firstName: string
  lastName: string
  email: string
  phone?: string
  department: string
  role: 'ceo' | 'cfo' | 'admin' | 'manager' | 'accountant'
}

const SIZE_LIMITS = {
  startup: { maxUsers: 10, maxUploadsPerMonth: 100, maxStorageGB: 1 },
  small: { maxUsers: 50, maxUploadsPerMonth: 500, maxStorageGB: 5 },
  medium: { maxUsers: 200, maxUploadsPerMonth: 2000, maxStorageGB: 20 },
  large: { maxUsers: 1000, maxUploadsPerMonth: 10000, maxStorageGB: 100 },
  enterprise: { maxUsers: 5000, maxUploadsPerMonth: 50000, maxStorageGB: 500 }
}

export class OrganizationService {
  
  /**
   * Create a new organization with admin user
   */
  async createOrganization(
    organizationData: OrganizationFormData, 
    adminUserData: AdminUserData
  ): Promise<string> {
    const currentUser = authService.getCurrentUser()
    if (!currentUser) {
      throw new Error('User must be authenticated to create organization')
    }

    if (currentUser.email !== adminUserData.email) {
      throw new Error('Admin email must match current user email')
    }

    try {
      return await runTransaction(db, async (transaction) => {
        // Check if user already has an organization
        const userRef = doc(db, 'users', currentUser.uid)
        const userDoc = await transaction.get(userRef)
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserProfile
          if (userData.organizationId && userData.organizationId !== '') {
            throw new Error('User is already associated with an organization')
          }
        }

        // Check if domain is already taken
        const orgsRef = collection(db, 'organizations')
        const domainQuery = query(orgsRef, where('domain', '==', organizationData.domain))
        const domainSnapshot = await getDocs(domainQuery)
        
        if (!domainSnapshot.empty) {
          throw new Error(`Domain ${organizationData.domain} is already registered by another organization`)
        }

        // Create organization
        const orgRef = doc(collection(db, 'organizations'))
        const sizeLimits = SIZE_LIMITS[organizationData.size]
        
        const organization: Organization = {
          id: orgRef.id,
          name: organizationData.name,
          domain: organizationData.domain,
          description: organizationData.description || '',
          industry: organizationData.industry,
          size: organizationData.size,
          address: organizationData.address,
          settings: {
            allowSelfSignup: organizationData.settings.allowSelfSignup ?? false,
            requireAdminApproval: organizationData.settings.requireAdminApproval ?? true,
            dataRetentionDays: organizationData.settings.dataRetentionDays ?? 365,
            maxUsersAllowed: sizeLimits.maxUsers,
            enableDepartments: organizationData.settings.enableDepartments ?? true,
            allowedDomains: [
              organizationData.domain,
              ...(organizationData.settings.allowedDomains || [])
            ]
          },
          subscription: {
            plan: organizationData.size === 'startup' ? 'free' : 'basic',
            status: 'trial',
            startDate: serverTimestamp() as Timestamp,
            features: [
              'basic_processing',
              'document_viewer',
              'user_management',
              ...(organizationData.size !== 'startup' ? ['advanced_analytics'] : [])
            ],
            limits: {
              maxUsers: sizeLimits.maxUsers,
              maxUploadsPerMonth: sizeLimits.maxUploadsPerMonth,
              maxStorageGB: sizeLimits.maxStorageGB,
              apiCallsPerMonth: sizeLimits.maxUploadsPerMonth * 2
            }
          },
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
          ownerId: currentUser.uid,
          isActive: true,
          memberCount: 1,
          adminIds: [currentUser.uid]
        }

        // Create or update user profile
        const userProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email!,
          displayName: `${adminUserData.firstName} ${adminUserData.lastName}`,
          firstName: adminUserData.firstName,
          lastName: adminUserData.lastName,
          photoURL: currentUser.photoURL,
          phone: adminUserData.phone,
          role: 'org_admin',
          organizationId: orgRef.id,
          organizationRole: 'admin',
          department: adminUserData.department,
          jobTitle: this.getRoleTitle(adminUserData.role),
          permissions: this.getAdminPermissions(),
          preferences: {
            theme: 'auto',
            language: 'en',
            timezone: 'Asia/Kolkata',
            emailNotifications: true,
            autoSave: true,
            defaultCurrency: 'INR'
          },
          usageStats: {
            totalUploads: 0,
            totalProcessed: 0,
            storageUsed: 0,
            uploadsToday: 0,
            uploadsThisMonth: 0
          },
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
          lastLoginAt: serverTimestamp() as Timestamp,
          isActive: true,
          inviteStatus: 'accepted'  // Admin user is self-created/accepted
        }

        // Execute transactions
        transaction.set(orgRef, organization)
        transaction.set(userRef, userProfile)

        console.log('✅ Organization created successfully:', {
          organizationId: orgRef.id,
          organizationName: organization.name,
          adminUser: userProfile.email
        })

        return orgRef.id
      })
    } catch (error) {
      console.error('❌ Error creating organization:', error)
      throw error
    }
  }

  /**
   * Get organization by ID
   */
  async getOrganization(organizationId: string): Promise<Organization | null> {
    try {
      const orgRef = doc(db, 'organizations', organizationId)
      const orgDoc = await getDoc(orgRef)
      
      return orgDoc.exists() ? orgDoc.data() as Organization : null
    } catch (error) {
      console.error('❌ Error fetching organization:', error)
      return null
    }
  }

  /**
   * Update organization
   */
  async updateOrganization(
    organizationId: string, 
    updates: Partial<Organization>
  ): Promise<void> {
    try {
      const orgRef = doc(db, 'organizations', organizationId)
      await updateDoc(orgRef, {
        ...updates,
        updatedAt: serverTimestamp()
      })
      
      console.log('✅ Organization updated successfully:', organizationId)
    } catch (error) {
      console.error('❌ Error updating organization:', error)
      throw error
    }
  }

  /**
   * Invite user to organization
   */
  async inviteUser(
    email: string, 
    role: 'org_admin' | 'user' | 'viewer',
    organizationId: string,
    message?: string
  ): Promise<string> {
    const currentUser = authService.getCurrentUser()
    if (!currentUser) {
      throw new Error('Must be authenticated to invite users')
    }

    try {
      // Verify current user has permission to invite
      const hasPermission = await userService.hasPermission('canInviteUsers')
      if (!hasPermission) {
        throw new Error('Insufficient permissions to invite users')
      }

      // Check if user is already in organization
      const existingProfile = await this.getUserByEmail(email)
      if (existingProfile && existingProfile.organizationId === organizationId) {
        throw new Error('User is already a member of this organization')
      }

      // Create invitation
      const inviteRef = doc(collection(db, 'user_invites'))
      const expirationDate = new Date()
      expirationDate.setDate(expirationDate.getDate() + 7) // 7 days expiration

      const invitation: UserInvite = {
        id: inviteRef.id,
        organizationId,
        email,
        role,
        invitedBy: currentUser.uid,
        invitedAt: serverTimestamp() as Timestamp,
        expiresAt: Timestamp.fromDate(expirationDate),
        status: 'pending',
        message
      }

      await setDoc(inviteRef, invitation)
      
      console.log('✅ User invitation created:', invitation)
      return inviteRef.id

    } catch (error) {
      console.error('❌ Error inviting user:', error)
      throw error
    }
  }

  /**
   * Accept user invitation
   */
  async acceptInvitation(inviteId: string): Promise<void> {
    const currentUser = authService.getCurrentUser()
    if (!currentUser) {
      throw new Error('Must be authenticated to accept invitation')
    }

    try {
      await runTransaction(db, async (transaction) => {
        const inviteRef = doc(db, 'user_invites', inviteId)
        const inviteDoc = await transaction.get(inviteRef)
        
        if (!inviteDoc.exists()) {
          throw new Error('Invitation not found')
        }

        const invite = inviteDoc.data() as UserInvite
        
        if (invite.email !== currentUser.email) {
          throw new Error('This invitation is not for your email address')
        }

        if (invite.status !== 'pending') {
          throw new Error('This invitation is no longer valid')
        }

        if (invite.expiresAt.toDate() < new Date()) {
          throw new Error('This invitation has expired')
        }

        // Update user profile with organization
        const userRef = doc(db, 'users', currentUser.uid)
        const updates: Partial<UserProfile> = {
          organizationId: invite.organizationId,
          organizationRole: invite.role === 'org_admin' ? 'admin' : 'member',
          permissions: this.getPermissionsForRole(invite.role),
          updatedAt: serverTimestamp() as Timestamp
        }

        // Update invitation status
        transaction.update(inviteRef, { status: 'accepted' })
        transaction.update(userRef, updates)

        // Update organization member count
        const orgRef = doc(db, 'organizations', invite.organizationId)
        const orgDoc = await transaction.get(orgRef)
        if (orgDoc.exists()) {
          const org = orgDoc.data() as Organization
          transaction.update(orgRef, { 
            memberCount: org.memberCount + 1,
            updatedAt: serverTimestamp()
          })
        }
      })

      console.log('✅ Invitation accepted successfully')
    } catch (error) {
      console.error('❌ Error accepting invitation:', error)
      throw error
    }
  }

  /**
   * Get user by email
   */
  private async getUserByEmail(email: string): Promise<UserProfile | null> {
    try {
      const usersRef = collection(db, 'users')
      const userQuery = query(usersRef, where('email', '==', email))
      const userSnapshot = await getDocs(userQuery)
      
      if (userSnapshot.empty) {
        return null
      }

      return userSnapshot.docs[0].data() as UserProfile
    } catch (error) {
      console.error('❌ Error finding user by email:', error)
      return null
    }
  }

  /**
   * Get role title from role value
   */
  private getRoleTitle(role: string): string {
    const roleTitles: Record<string, string> = {
      'ceo': 'Chief Executive Officer',
      'cfo': 'Chief Financial Officer',
      'admin': 'Administrator',
      'manager': 'Manager',
      'accountant': 'Accountant'
    }
    return roleTitles[role] || 'Administrator'
  }

  /**
   * Get admin permissions
   */
  private getAdminPermissions() {
    return {
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
  }

  /**
   * Get permissions for specific role
   */
  private getPermissionsForRole(role: 'org_admin' | 'user' | 'viewer') {
    switch (role) {
      case 'org_admin':
        return this.getAdminPermissions()
      case 'viewer':
        return {
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
      case 'user':
      default:
        return {
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
    }
  }
}

// Export singleton instance
export const organizationService = new OrganizationService()