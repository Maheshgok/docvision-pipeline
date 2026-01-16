import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { userService, type Organization } from '../../services/userService'
import { Building2, MapPin, Users, Settings, Mail, Globe, Calendar, Crown } from 'lucide-react'
import toast from 'react-hot-toast'

export const OrganizationManagement: React.FC = () => {
  const { userProfile, hasPermission } = useAuth()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'overview' | 'settings' | 'members'>('overview')

  const isAdmin = hasPermission('canManageOrgUsers')
  const canViewOrgData = hasPermission('canViewOrgData')

  useEffect(() => {
    loadOrganizationData()
  }, [])

  const loadOrganizationData = async () => {
    try {
      setLoading(true)
      const org = await userService.getOrganization()
      setOrganization(org)
    } catch (error) {
      console.error('❌ Error loading organization:', error)
      toast.error('Failed to load organization details')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString()
  }

  const getSizeLabel = (size?: string) => {
    const sizeLabels: Record<string, string> = {
      'startup': 'Startup (1-10 employees)',
      'small': 'Small Business (11-50 employees)', 
      'medium': 'Medium Business (51-200 employees)',
      'large': 'Large Business (201-1000 employees)',
      'enterprise': 'Enterprise (1000+ employees)'
    }
    return sizeLabels[size || 'small'] || 'Small Business'
  }

  const getPlanBadgeColor = (plan?: string) => {
    switch (plan) {
      case 'enterprise': return 'bg-purple-100 text-purple-800'
      case 'pro': return 'bg-blue-100 text-blue-800' 
      case 'basic': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading organization details...</p>
        </div>
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="text-center py-12">
        <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Organization Not Found</h3>
        <p className="text-gray-600 mb-6">
          There seems to be an issue loading your organization details.
        </p>
        <button
          onClick={loadOrganizationData}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Organization Header */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{organization.name}</h1>
                <p className="text-sm text-gray-500">
                  {getSizeLabel(organization.size)} • {organization.industry || 'General Business'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPlanBadgeColor(organization.subscription?.plan)}`}>
                {organization.subscription?.plan || 'Free'} Plan
              </span>
              {userProfile?.organizationRole === 'admin' && (
                <div className="flex items-center space-x-1 bg-amber-100 text-amber-800 px-2 py-1 rounded-full text-xs font-medium">
                  <Crown className="w-3 h-3" />
                  <span>Admin</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {[
              { id: 'overview', name: 'Overview', icon: Building2 },
              { id: 'settings', name: 'Settings', icon: Settings, adminOnly: true },
              { id: 'members', name: 'Members', icon: Users, requiresViewAccess: true }
            ].filter(tab => {
              if (tab.adminOnly) return isAdmin
              if (tab.requiresViewAccess) return canViewOrgData || isAdmin
              return true
            }).map((tab) => {
              const IconComponent = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id as any)}
                  className={`
                    flex items-center py-2 px-1 border-b-2 font-medium text-sm
                    ${activeSection === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <IconComponent className="h-4 w-4 mr-2" />
                  {tab.name}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-6">
        {activeSection === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Organization Details */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Organization Details</h3>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Organization ID</dt>
                  <dd className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded">
                    {organization.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Domain</dt>
                  <dd className="mt-1 text-sm text-gray-900 flex items-center">
                    <Globe className="w-4 h-4 mr-2 text-gray-400" />
                    {organization.domain || 'No domain set'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Description</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {organization.description || 'No description provided'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900 flex items-center">
                    <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                    {formatDate(organization.createdAt)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Address & Contact */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-gray-400" />
                Address & Contact
              </h3>
              {organization.address ? (
                <div className="space-y-2 text-sm text-gray-900">
                  <div>{organization.address.street}</div>
                  <div>{organization.address.city}, {organization.address.state} {organization.address.zipCode}</div>
                  <div>{organization.address.country}</div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No address information available</p>
              )}
            </div>

            {/* Subscription Details */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Subscription & Usage</h3>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Current Plan</dt>
                  <dd className="mt-1">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPlanBadgeColor(organization.subscription?.plan)}`}>
                      {organization.subscription?.plan || 'Free'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Members</dt>
                  <dd className="mt-1 text-sm text-gray-900 flex items-center">
                    <Users className="w-4 h-4 mr-2 text-gray-400" />
                    {organization.memberCount} of {organization.subscription?.limits?.maxUsers || 'unlimited'} users
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Monthly Upload Limit</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {organization.subscription?.limits?.maxUploadsPerMonth || 'Unlimited'} uploads
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Storage Limit</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {organization.subscription?.limits?.maxStorageGB || 'Unlimited'} GB
                  </dd>
                </div>
              </dl>
            </div>

            {/* Quick Actions */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                {isAdmin && (
                  <>
                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md border border-gray-200 flex items-center">
                      <Mail className="w-4 h-4 mr-3 text-gray-400" />
                      Invite Team Members
                    </button>
                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md border border-gray-200 flex items-center">
                      <Settings className="w-4 h-4 mr-3 text-gray-400" />
                      Manage Settings
                    </button>
                  </>
                )}
                <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md border border-gray-200 flex items-center">
                  <Users className="w-4 h-4 mr-3 text-gray-400" />
                  View Team Members
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'settings' && isAdmin && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Organization Settings</h3>
            <p className="text-gray-600 mb-4">
              Organization settings management will be available in a future update.
              For now, please contact support for any configuration changes.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Coming Soon:</strong> Organization name updates, domain management, 
                subscription changes, and advanced security settings.
              </p>
            </div>
          </div>
        )}

        {activeSection === 'members' && (canViewOrgData || isAdmin) && (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Team Members</h3>
            <p className="text-gray-600 mb-4">
              Team member management is available through the Admin Dashboard.
            </p>
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500 mb-4">
                Use the Admin Dashboard to view and manage team members, send invitations, and configure user permissions.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default OrganizationManagement