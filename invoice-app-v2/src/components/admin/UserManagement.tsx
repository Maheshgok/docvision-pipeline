import React, { useState, useEffect } from 'react'
import { 
  Users, 
  Search, 
  UserX, 
  UserCheck, 
  Clock,
  Mail, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw,
  Download,
  Eye,
  ChevronDown
} from 'lucide-react'
import { packageService, type PackageDefinition } from '../../services/packageService'
import { userService, UserProfile } from '../../services/userService'
import toast from 'react-hot-toast'

interface UserManagementProps {}

interface UserStats {
  total: number
  active: number
  suspended: number
  expired: number
  expiringIn7Days: number
}


// Utility function to safely convert Firestore Timestamp to Date
const toDate = (timestamp: any): Date => {
  if (!timestamp) return new Date(0)
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate()
  }
  return new Date(timestamp)
}

const UserManagement: React.FC<UserManagementProps> = () => {
  const [users, setUsers] = useState<(UserProfile & { id: string })[]>([])
  const [filteredUsers, setFilteredUsers] = useState<(UserProfile & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'suspended' | 'expiring'>('all')
  const [selectedUser, setSelectedUser] = useState<(UserProfile & { id: string }) | null>(null)
  const [showUserModal, setShowUserModal] = useState(false)
  const [packages, setPackages] = useState<PackageDefinition[]>([])
  const [stats, setStats] = useState<UserStats>({
    total: 0,
    active: 0,
    suspended: 0,
    expired: 0,
    expiringIn7Days: 0
  })

  useEffect(() => {
    loadUsers()
    loadPackages()
  }, [])

  useEffect(() => {
    filterUsers()
  }, [users, searchTerm, filterStatus])

  const loadPackages = async () => {
    try {
      const packagesData = await packageService.getActivePackages()
      setPackages(packagesData)
    } catch (error) {
      console.error('Error loading packages:', error)
    }
  }

  const loadUsers = async () => {
    try {
      setLoading(true)
      const allUsers = await userService.getAllUsersForAdmin()
      setUsers(allUsers)
      calculateStats(allUsers)
    } catch (error) {
      console.error('Error loading users:', error)
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (userList: (UserProfile & { id: string })[]) => {
    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    
    const stats = userList.reduce(
      (acc, user) => {
        acc.total++
        
        if (user.isActive === false) {
          acc.suspended++
        } else if (user.paymentStatus?.expiresAt) {
          const expiryDate = toDate(user.paymentStatus.expiresAt)
          
          if (expiryDate <= now) {
            acc.expired++
          } else if (expiryDate <= sevenDaysFromNow) {
            acc.expiringIn7Days++
            acc.active++
          } else {
            acc.active++
          }
        }
        
        return acc
      },
      { total: 0, active: 0, suspended: 0, expired: 0, expiringIn7Days: 0 }
    )
    
    setStats(stats)
  }

  const filterUsers = () => {
    let filtered = users

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(user => 
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Status filter
    if (filterStatus !== 'all') {
      const now = new Date()
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      
      filtered = filtered.filter(user => {
        switch (filterStatus) {
          case 'active':
            if (user.isActive === false) return false
            if (!user.paymentStatus?.expiresAt) return false
            const expiryDate = toDate(user.paymentStatus.expiresAt)
            return expiryDate > now
            
          case 'expired':
            if (!user.paymentStatus?.expiresAt) return true
            const expDate = toDate(user.paymentStatus.expiresAt)
            return expDate <= now
            
          case 'suspended':
            return user.isActive === false
            
          case 'expiring':
            if (!user.paymentStatus?.expiresAt) return false
            const expireDate = toDate(user.paymentStatus.expiresAt)
            return expireDate > now && expireDate <= sevenDaysFromNow
            
          default:
            return true
        }
      })
    }

    setFilteredUsers(filtered)
  }

  const getUserStatus = (user: UserProfile & { id: string }) => {
    if (user.isActive === false) {
      return { status: 'suspended', color: 'text-red-600', bgColor: 'bg-red-50', text: 'Suspended' }
    }
    
    if (!user.paymentStatus?.expiresAt) {
      return { status: 'no_payment', color: 'text-gray-600', bgColor: 'bg-gray-50', text: 'No Payment' }
    }
    
    const expiryDate = toDate(user.paymentStatus.expiresAt)
    const now = new Date()
    
    if (expiryDate <= now) {
      return { status: 'expired', color: 'text-red-600', bgColor: 'bg-red-50', text: 'Expired' }
    }
    
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysLeft <= 7) {
      return { status: 'expiring', color: 'text-amber-600', bgColor: 'bg-amber-50', text: `${daysLeft}d left` }
    }
    
    return { status: 'active', color: 'text-green-600', bgColor: 'bg-green-50', text: `${daysLeft}d left` }
  }

  const handleSuspendUser = async (userUid: string) => {
    try {
      await userService.suspendUserService(userUid)
      toast.success('User suspended successfully')
      loadUsers()
    } catch (error: any) {
      toast.error(error.message || 'Failed to suspend user')
    }
  }

  const handleActivateUser = async (userUid: string) => {
    try {
      await userService.activateUserService(userUid)
      toast.success('User activated successfully')
      loadUsers()
    } catch (error: any) {
      toast.error(error.message || 'Failed to activate user')
    }
  }

  const handleExtendSubscription = async (userUid: string, packageData: any) => {
    try {
      // Use the new assignPackageToUser method for better tracking
      await userService.assignPackageToUser(userUid, {
        packageId: packageData.id,
        packageName: packageData.name,
        packageType: packageData.type || 'time_based',
        duration: packageData.duration,
        analysisLimit: packageData.analysisLimit
      })
      toast.success(`Package "${packageData.name}" assigned successfully`)
      loadUsers()
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign package')
    }
  }

  const handleExtendSubscriptionLegacy = async (userUid: string, days: number) => {
    try {
      await userService.extendSubscription(userUid, days)
      toast.success(`Subscription extended by ${days} days`)
      loadUsers()
    } catch (error: any) {
      toast.error(error.message || 'Failed to extend subscription')
    }
  }

  const handleSendReminder = async (userUid: string) => {
    try {
      await userService.sendPaymentReminder(userUid)
      toast.success('Payment reminder sent')
      loadUsers()
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reminder')
    }
  }

  const StatCard: React.FC<{ title: string; value: number; color: string; icon: React.ReactNode }> = 
    ({ title, value, color, icon }) => (
    <div className={`${color} p-6 rounded-lg`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-75">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
        <div className="opacity-75">
          {icon}
        </div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading users...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          title="Total Users"
          value={stats.total}
          color="bg-blue-50 text-blue-900"
          icon={<Users size={24} />}
        />
        <StatCard
          title="Active"
          value={stats.active}
          color="bg-green-50 text-green-900"
          icon={<CheckCircle size={24} />}
        />
        <StatCard
          title="Expiring Soon"
          value={stats.expiringIn7Days}
          color="bg-amber-50 text-amber-900"
          icon={<Clock size={24} />}
        />
        <StatCard
          title="Expired"
          value={stats.expired}
          color="bg-red-50 text-red-900"
          icon={<AlertTriangle size={24} />}
        />
        <StatCard
          title="Suspended"
          value={stats.suspended}
          color="bg-gray-50 text-gray-900"
          icon={<UserX size={24} />}
        />
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Users</option>
              <option value="active">Active</option>
              <option value="expiring">Expiring Soon</option>
              <option value="expired">Expired</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadUsers}
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>
            
            <button className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              <Download size={16} />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Users ({filteredUsers.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subscription
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Active
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => {
                const status = getUserStatus(user)
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          {user.photoURL ? (
                            <img className="h-10 w-10 rounded-full" src={user.photoURL} alt="" />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                              <span className="text-sm font-medium text-gray-700">
                                {user.displayName?.[0] || user.email?.[0]?.toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.displayName || 'No Name'}
                          </div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${status.bgColor} ${status.color}`}>
                        {status.text}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.paymentStatus?.expiresAt ? (
                        <div>
                          <div>
                            {toDate(user.paymentStatus.expiresAt).toLocaleDateString()}
                          </div>
                          {(user.paymentStatus as any).plan && (
                            <div className="text-xs text-gray-500">{(user.paymentStatus as any).plan}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500">No subscription</span>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.lastLoginAt ? (
                        toDate(user.lastLoginAt).toLocaleDateString()
                      ) : 'Never'}
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => { setSelectedUser(user); setShowUserModal(true) }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Eye size={16} />
                      </button>
                      
                      {user.isActive === false ? (
                        <button
                          onClick={() => handleActivateUser(user.id)}
                          className="text-green-600 hover:text-green-900"
                          title="Activate User"
                        >
                          <UserCheck size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSuspendUser(user.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Suspend User"
                        >
                          <UserX size={16} />
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleSendReminder(user.id)}
                        className="text-amber-600 hover:text-amber-900"
                        title="Send Reminder"
                      >
                        <Mail size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Details Modal */}
      {showUserModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">User Details</h3>
                <button
                  onClick={() => setShowUserModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* User Info */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">User Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Name</label>
                    <p className="font-medium">{selectedUser.displayName || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Email</label>
                    <p className="font-medium">{selectedUser.email}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Role</label>
                    <p className="font-medium">{selectedUser.role || 'user'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Status</label>
                    <p className="font-medium">{selectedUser.isActive ? 'Active' : 'Suspended'}</p>
                  </div>
                </div>
              </div>

              {/* Usage Tracking */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Usage Statistics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Package Type</label>
                    <p className="font-medium capitalize">
                      {selectedUser.currentPackageValidity?.packageType?.replace('_', ' ') || 'Not Set'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Package Consumption</label>
                    <p className="font-medium">{selectedUser.packageConsumption || 0}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Total Consumption</label>
                    <p className="font-medium">{selectedUser.totalConsumption || 0}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Remaining Credits</label>
                    <p className="font-medium text-green-600">{selectedUser.currentPackageValidity?.analysisRemaining || 0}</p>
                  </div>
                </div>
                
                {/* Usage Progress Bar */}
                {selectedUser.currentPackageValidity && selectedUser.currentPackageValidity.analysisLimit > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Package Usage Progress</span>
                      <span>
                        {Math.round(((selectedUser.packageConsumption || 0) / selectedUser.currentPackageValidity.analysisLimit) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${Math.min(100, ((selectedUser.packageConsumption || 0) / selectedUser.currentPackageValidity.analysisLimit) * 100)}%` 
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>{selectedUser.packageConsumption || 0} used</span>
                      <span>{selectedUser.currentPackageValidity.analysisLimit} total</span>
                    </div>
                  </div>
                )}

                {/* Package Status */}
                {selectedUser.currentPackageValidity && (
                  <div className="mt-3 p-2 bg-gray-50 rounded-lg">
                    <div className="text-sm">
                      <span className="text-gray-500">Current Package: </span>
                      <span className="font-medium">{selectedUser.currentPackageValidity.packageName}</span>
                      <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                        selectedUser.currentPackageValidity.status === 'active' ? 'bg-green-100 text-green-800' :
                        selectedUser.currentPackageValidity.status === 'expired' ? 'bg-red-100 text-red-800' :
                        selectedUser.currentPackageValidity.status === 'depleted' ? 'bg-amber-100 text-amber-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedUser.currentPackageValidity.status}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Subscription Management */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Subscription Management</h4>
                <div className="space-y-3">
                  <div className="text-sm text-gray-600">
                    Select a package to extend this user's subscription:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {packages.map((pkg) => (
                      <button
                        key={pkg.id}
                        onClick={() => handleExtendSubscription(selectedUser.id, pkg)}
                        className="p-3 border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 text-left transition-colors"
                      >
                        <div className="font-medium text-sm text-gray-900">{pkg.name}</div>
                        <div className="text-xs text-gray-500">
                          {pkg.type?.replace('_', ' ') || 'Time based'} - {pkg.duration} days - ₹{pkg.price}
                        </div>
                        {(pkg.type === 'consumption_based' || pkg.type === 'hybrid') && pkg.analysisLimit && (
                          <div className="text-xs text-blue-600">{pkg.analysisLimit} analysis credits</div>
                        )}
                      </button>
                    ))}
                  </div>
                  
                  {packages.length === 0 && (
                    <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                      No active packages available. Please configure packages in the Package Management section.
                    </div>
                  )}
                  
                  {/* Custom Extension */}
                  <details className="mt-4">
                    <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                      <span className="flex items-center">
                        <ChevronDown size={16} className="mr-1" />
                        Custom Extension
                      </span>
                    </summary>
                    <div className="mt-3 flex items-center space-x-2">
                      <input
                        type="number"
                        placeholder="Days"
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const days = parseInt((e.target as HTMLInputElement).value)
                            if (days > 0) {
                              handleExtendSubscriptionLegacy(selectedUser.id, days);
                              (e.target as HTMLInputElement).value = ''
                            }
                          }
                        }}
                      />
                      <span className="text-sm text-gray-500">days (press Enter)</span>
                    </div>
                  </details>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Quick Actions</h4>
                <div className="flex space-x-2">
                  {selectedUser.isActive ? (
                    <button
                      onClick={() => {
                        handleSuspendUser(selectedUser.id)
                        setShowUserModal(false)
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                    >
                      Suspend User
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        handleActivateUser(selectedUser.id)
                        setShowUserModal(false)
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      Activate User
                    </button>
                  )}
                  
                  <button
                    onClick={() => {
                      handleSendReminder(selectedUser.id)
                      setShowUserModal(false)
                    }}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
                  >
                    Send Reminder
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagement