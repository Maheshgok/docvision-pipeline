import React, { useState } from 'react'
import { Settings, Users, Shield, CreditCard, Home, Package, Database } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SuperAdminSettings } from './SuperAdminSettings'
import UserManagement from './UserManagement'
import PackageManagement from './PackageManagement'
import { useAuth } from '../../contexts/AuthContext'
import { packageService } from '../../services/packageService'
import toast from 'react-hot-toast'

interface AdminDashboardProps {}

type TabType = 'settings' | 'users' | 'packages' | 'payments' | 'reports'

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const { userProfile } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('packages')

  const handleInitializePackages = async () => {
    try {
      await packageService.initializeDefaultPackages()
    } catch (error) {
      console.error('Error initializing packages:', error)
    }
  }

  // Redirect non-admins
  if (userProfile?.role !== 'super_admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-white rounded-lg shadow-sm">
          <div className="text-red-500 mb-4">
            <Shield className="mx-auto h-16 w-16" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
          <p className="text-gray-600">
            You need super admin privileges to access this section.
          </p>
        </div>
      </div>
    )
  }

  const tabs = [
    {
      id: 'settings' as TabType,
      label: 'System Settings',
      icon: Settings,
      description: 'Configure system-wide settings and payment details'
    },
    {
      id: 'users' as TabType,
      label: 'User Management',
      icon: Users,
      description: 'Manage users, subscriptions, and service access'
    },
    {
      id: 'packages' as TabType,
      label: 'Package Management',
      icon: Package,
      description: 'Configure subscription packages and pricing'
    },
    {
      id: 'payments' as TabType,
      label: 'Payment Overview',
      icon: CreditCard,
      description: 'View payment analytics and revenue reports'
    },
    {
      id: 'reports' as TabType,
      label: 'System Reports',
      icon: Shield,
      description: 'System health and usage analytics'
    }
  ]

  const renderTabContent = () => {
    switch (activeTab) {
      case 'settings':
        return <SuperAdminSettings />
      case 'users':
        return <UserManagement />
      case 'packages':
        return <PackageManagement />
      case 'payments':
        return <PaymentOverview />
      case 'reports':
        return <SystemReports />
      default:
        return <PackageManagement />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Shield className="w-8 h-8 text-red-600" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
                  <p className="text-gray-600">Comprehensive system management</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleInitializePackages}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors"
                >
                  <Database className="w-5 h-5" />
                  <span className="font-medium">Initialize Packages</span>
                </button>
                <Link 
                  to="/dashboard" 
                  className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Home className="w-5 h-5" />
                  <span className="font-medium">Dashboard</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <p className="text-gray-600">
            {tabs.find(tab => tab.id === activeTab)?.description}
          </p>
        </div>
        
        {renderTabContent()}
      </div>
    </div>
  )
}

// Placeholder components for other tabs
const PaymentOverview: React.FC = () => (
  <div className="bg-white rounded-lg border border-gray-200 p-8">
    <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Analytics</h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-green-50 p-6 rounded-lg">
        <h3 className="text-lg font-medium text-green-800">Total Revenue</h3>
        <p className="text-3xl font-bold text-green-900 mt-2">₹45,000</p>
        <p className="text-green-600 text-sm mt-1">This month</p>
      </div>
      <div className="bg-blue-50 p-6 rounded-lg">
        <h3 className="text-lg font-medium text-blue-800">Active Subscriptions</h3>
        <p className="text-3xl font-bold text-blue-900 mt-2">12</p>
        <p className="text-blue-600 text-sm mt-1">Paying users</p>
      </div>
      <div className="bg-amber-50 p-6 rounded-lg">
        <h3 className="text-lg font-medium text-amber-800">Pending Renewals</h3>
        <p className="text-3xl font-bold text-amber-900 mt-2">3</p>
        <p className="text-amber-600 text-sm mt-1">Expire this week</p>
      </div>
    </div>
    <div className="mt-8">
      <p className="text-gray-500">Detailed payment analytics coming soon...</p>
    </div>
  </div>
)

const SystemReports: React.FC = () => (
  <div className="bg-white rounded-lg border border-gray-200 p-8">
    <h2 className="text-xl font-semibold text-gray-900 mb-4">System Health & Reports</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-gray-50 p-6 rounded-lg">
        <h3 className="text-lg font-medium text-gray-800">System Status</h3>
        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">API Health</span>
            <span className="text-green-600 font-medium">✓ Healthy</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Database</span>
            <span className="text-green-600 font-medium">✓ Connected</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Storage</span>
            <span className="text-green-600 font-medium">✓ Available</span>
          </div>
        </div>
      </div>
      <div className="bg-gray-50 p-6 rounded-lg">
        <h3 className="text-lg font-medium text-gray-800">Usage Statistics</h3>
        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Total Files Processed</span>
            <span className="font-medium">1,234</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Active Users Today</span>
            <span className="font-medium">8</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Storage Used</span>
            <span className="font-medium">2.3 GB</span>
          </div>
        </div>
      </div>
    </div>
    <div className="mt-8">
      <p className="text-gray-500">Detailed system reports and analytics coming soon...</p>
    </div>
  </div>
)

export default AdminDashboard