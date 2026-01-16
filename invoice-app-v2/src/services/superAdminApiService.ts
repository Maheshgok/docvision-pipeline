// API client for SuperAdmin service operations

import { createSuperAdminServiceClient } from '../../../services/shared/api-client'
import { SERVICE_URLS } from '../config/services'

export interface SuperAdminUser {
  id: string
  email: string
  displayName?: string
  role: string
  organizationId?: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
  createdAt: Date
  approvedAt?: Date
}

export interface UserApprovalRequest {
  uid: string
  approved: boolean
  role?: 'user' | 'admin'
  organizationId?: string
}

export interface PaginatedUsers {
  users: SuperAdminUser[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

class SuperAdminApiService {
  private client = createSuperAdminServiceClient(SERVICE_URLS.superadmin)

  constructor() {
    // Client will handle auth via the authTokenManager when making requests
  }

  // User Management
  async getAllUsers(page: number = 1, limit: number = 20, status?: string): Promise<PaginatedUsers> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    })
    
    if (status && status !== 'all') {
      params.append('status', status)
    }
    
    return this.client.get<PaginatedUsers>(`/api/users?${params}`)
  }

  async getPendingUsers(): Promise<SuperAdminUser[]> {
    const response = await this.client.get<{ data: SuperAdminUser[] }>('/api/users/pending')
    return response.data
  }

  async approveUser(request: UserApprovalRequest): Promise<void> {
    await this.client.post(`/api/users/${request.uid}/approve`, request)
  }

  async updateUser(uid: string, updates: {
    role?: string
    organizationId?: string
    packageId?: string
  }): Promise<void> {
    await this.client.put(`/api/users/${uid}`, updates)
  }

  async deleteUser(uid: string): Promise<void> {
    await this.client.delete(`/api/users/${uid}`)
  }

  // Package Management
  async getPackages(): Promise<any[]> {
    const response = await this.client.get<{ data: any[] }>('/api/packages')
    return response.data
  }

  async createPackage(packageData: any): Promise<any> {
    return this.client.post('/api/packages', packageData)
  }

  async updatePackage(packageId: string, updates: any): Promise<void> {
    await this.client.put(`/api/packages/${packageId}`, updates)
  }

  async deletePackage(packageId: string): Promise<void> {
    await this.client.delete(`/api/packages/${packageId}`)
  }

  // System Analytics
  async getSystemAnalytics(): Promise<any> {
    const response = await this.client.get<{ data: any }>('/api/analytics')
    return response.data
  }

  async getSystemStats(): Promise<any> {
    const response = await this.client.get<{ data: any }>('/api/system/stats')
    return response.data
  }
}

export const superAdminApiService = new SuperAdminApiService()