// API client for Admin service operations

import { createAdminServiceClient } from '../../../services/shared/api-client'
import { SERVICE_URLS } from '../config/services'

export interface AdminOrganization {
  id: string
  name: string
  domain?: string
  industry?: string
  address: {
    street: string
    city: string
    state: string
    country: string
    zipCode: string
  }
  adminUserId: string
  packageId?: string
  settings: {
    allowSelfSignup: boolean
    requireApproval: boolean
    maxUsers?: number
  }
  createdAt: Date
  updatedAt: Date
}

export interface OrganizationStats {
  users: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
  invoices: {
    total: number
    thisMonth: number
    completed: number
    pending: number
  }
}

export interface AdminUser {
  id: string
  email: string
  displayName?: string
  role: string
  organizationId?: string
  packageId?: string
  createdAt: Date
  lastLoginAt?: Date
}

class AdminApiService {
  private client = createAdminServiceClient(SERVICE_URLS.admin)

  constructor() {
    // Client will handle auth via the authTokenManager when making requests
  }

  // Organization Management
  async getOrganization(): Promise<AdminOrganization> {
    const response = await this.client.get<{ data: AdminOrganization }>('/api/organizations')
    return response.data
  }

  async createOrganization(orgData: {
    name: string
    domain?: string
    industry?: string
    address: {
      street: string
      city: string
      state: string
      country: string
      zipCode: string
    }
    settings?: {
      allowSelfSignup?: boolean
      requireApproval?: boolean
      maxUsers?: number
    }
  }): Promise<AdminOrganization> {
    const response = await this.client.post<{ data: AdminOrganization }>('/api/organizations', orgData)
    return response.data
  }

  async updateOrganization(updates: Partial<AdminOrganization>): Promise<void> {
    await this.client.put('/api/organizations', updates)
  }

  async getOrganizationStats(): Promise<OrganizationStats> {
    const response = await this.client.get<{ data: OrganizationStats }>('/api/organizations/stats')
    return response.data
  }

  // User Management within Organization
  async getOrganizationUsers(page: number = 1, limit: number = 20): Promise<{
    users: AdminUser[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    })
    
    return this.client.get<any>(`/api/users?${params}`)
  }

  async inviteUser(email: string, role: 'user' | 'admin' = 'user'): Promise<void> {
    await this.client.post('/api/invites', { email, role })
  }

  async updateOrganizationUser(uid: string, updates: {
    role?: 'user' | 'admin'
    packageId?: string
  }): Promise<void> {
    await this.client.put(`/api/users/${uid}`, updates)
  }

  async removeOrganizationUser(uid: string): Promise<void> {
    await this.client.delete(`/api/users/${uid}`)
  }

  // Package Management
  async getAvailablePackages(): Promise<any[]> {
    const response = await this.client.get<{ data: any[] }>('/api/packages')
    return response.data
  }

  async assignPackageToUser(uid: string, packageId: string): Promise<void> {
    await this.client.post(`/api/users/${uid}/package`, { packageId })
  }

  // Billing
  async getBillingInfo(): Promise<any> {
    const response = await this.client.get<{ data: any }>('/api/billing')
    return response.data
  }

  async updateBilling(billingData: any): Promise<void> {
    await this.client.put('/api/billing', billingData)
  }

  async getBillingHistory(): Promise<any[]> {
    const response = await this.client.get<{ data: any[] }>('/api/billing/history')
    return response.data
  }
}

export const adminApiService = new AdminApiService()