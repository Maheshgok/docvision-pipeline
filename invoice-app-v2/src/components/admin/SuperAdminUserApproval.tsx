/**
 * Super Admin User Approval Management Component
 */

import React, { useState, useEffect } from 'react'
import { Check, X, Clock, Search, Filter, Eye, Mail, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { userService, type UserProfile } from '../../services/userService'
import { pricingService, type PricingPlan } from '../../services/pricingService'
import toast from 'react-hot-toast'

interface PendingUser extends UserProfile {
  planName?: string
  planAmount?: number
  requestedAt?: Date
}

const SuperAdminUserApproval: React.FC = () => {
  const { userProfile } = useAuth()
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [rejectedUsers, setRejectedUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'pending' | 'rejected' | 'all'>('pending')
  // const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null)
  const [plans, setPlans] = useState<PricingPlan[]>([])

  // Check if user is super admin
  const isSuperAdmin = userProfile?.role === 'super_admin'

  useEffect(() => {
    if (isSuperAdmin) {
      loadPendingUsers()
      loadPricingPlans()
    }
  }, [isSuperAdmin])

  const loadPendingUsers = async () => {
    try {
      setLoading(true)
      // Mock data for demonstration - replace with actual userService methods when implemented
      const pending: PendingUser[] = []
      const rejected: PendingUser[] = []
      
      // TODO: Implement getUsersByApprovalStatus in userService
      // const pending = await userService.getUsersByApprovalStatus('pending')
      // const rejected = await userService.getUsersByApprovalStatus('rejected')
      
      setPendingUsers(pending as PendingUser[])
      setRejectedUsers(rejected as PendingUser[])
    } catch (error) {
      console.error('Error loading pending users:', error)
      toast.error('Failed to load pending users')
    } finally {
      setLoading(false)
    }
  }

  const loadPricingPlans = async () => {
    try {
      const pricingPlans = await pricingService.getActivePlans()
      setPlans(pricingPlans)
    } catch (error) {
      console.error('Error loading pricing plans:', error)
    }
  }

  const approveUser = async (userId: string, userEmail: string) => {
    try {
      // TODO: Implement updateUserApprovalStatus in userService
      // await userService.updateUserApprovalStatus(userId, 'approved')
      console.log('Approving user:', userId, userEmail)
      toast.success(`User ${userEmail} approved successfully`)
      loadPendingUsers()
      
      // Send approval email
      await sendApprovalEmail(userEmail, 'approved')
    } catch (error) {
      console.error('Error approving user:', error)
      toast.error('Failed to approve user')
    }
  }

  const rejectUser = async (userId: string, userEmail: string, reason?: string) => {
    try {
      // TODO: Implement updateUserApprovalStatus in userService
      // await userService.updateUserApprovalStatus(userId, 'rejected', reason)
      console.log('Rejecting user:', userId, userEmail, reason)
      toast.success(`User ${userEmail} rejected`)
      loadPendingUsers()
      
      // Send rejection email
      await sendApprovalEmail(userEmail, 'rejected', reason)
    } catch (error) {
      console.error('Error rejecting user:', error)
      toast.error('Failed to reject user')
    }
  }

  const sendApprovalEmail = async (userEmail: string, status: 'approved' | 'rejected', reason?: string) => {
    try {
      // This would integrate with your email service
      console.log(`Sending ${status} email to ${userEmail}`, { reason })
      // await emailService.sendApprovalNotification(userEmail, status, reason)
    } catch (error) {
      console.error('Error sending approval email:', error)
    }
  }

  const getPlanInfo = (planId?: string) => {
    if (!planId) return null
    return plans.find(plan => plan.id === planId)
  }

  const filteredUsers = (() => {
    const users = filterStatus === 'rejected' ? rejectedUsers : 
                 filterStatus === 'all' ? [...pendingUsers, ...rejectedUsers] :
                 pendingUsers
    
    if (!searchTerm) return users
    
    return users.filter(user => 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.organizationId?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })()

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
          <div className="text-red-500 text-5xl mb-4">🚫</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">
            Super admin access required to view user approval management.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">User Approval Management</h1>
          <p className="mt-2 text-gray-600">
            Review and approve new user registrations
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <Clock className="w-8 h-8 text-yellow-500 mr-3" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{pendingUsers.length}</h3>
                <p className="text-gray-600">Pending Approval</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <X className="w-8 h-8 text-red-500 mr-3" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{rejectedUsers.length}</h3>
                <p className="text-gray-600">Rejected</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <Check className="w-8 h-8 text-green-500 mr-3" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">-</h3>
                <p className="text-gray-600">Approved Today</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by email, name, or organization..."
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
              >
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
              
              <button
                onClick={loadPendingUsers}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Filter className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Users List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No users found matching your criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((user) => {
                    const plan = getPlanInfo(user.paymentStatus?.subscriptionType)
                    return (
                      <tr key={user.uid} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              {user.photoURL ? (
                                <img className="h-10 w-10 rounded-full" src={user.photoURL} alt="" />
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                  <span className="text-sm font-medium text-gray-700">
                                    {user.email.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{user.displayName || 'N/A'}</div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {user.organizationId || 'Personal'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {plan ? (
                            <div>
                              <div className="font-medium">{plan.displayName}</div>
                              <div className="text-gray-500">{pricingService.formatPrice(plan.price)}</div>
                            </div>
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.approvalStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            user.approvalStatus === 'approved' ? 'bg-green-100 text-green-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {user.approvalStatus || 'pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.createdAt?.toDate().toLocaleDateString() || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex gap-2">
                            {user.approvalStatus === 'pending' && (
                              <>
                                <button
                                  onClick={() => approveUser(user.uid, user.email)}
                                  className="text-green-600 hover:text-green-900 flex items-center gap-1"
                                >
                                  <Check className="w-4 h-4" />
                                  Approve
                                </button>
                                <button
                                  onClick={() => rejectUser(user.uid, user.email)}
                                  className="text-red-600 hover:text-red-900 flex items-center gap-1"
                                >
                                  <X className="w-4 h-4" />
                                  Reject
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => console.log('View user:', user.uid)}
                              className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
                            <button
                              onClick={() => window.open(`mailto:${user.email}`)}
                              className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
                            >
                              <Mail className="w-4 h-4" />
                              Email
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SuperAdminUserApproval