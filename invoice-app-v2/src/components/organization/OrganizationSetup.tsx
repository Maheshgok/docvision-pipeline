import React, { useState, useEffect } from 'react'
import { Building2, Users, MapPin, Shield, Check, ArrowRight, ArrowLeft, AlertCircle, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { organizationService } from '../../services/organizationService'
import { userService } from '../../services/userService'
import { authService } from '../../services/auth'
import { pricingService } from '../../services/pricingService'

interface OrganizationFormData {
  // Organization Details
  name: string
  domain: string
  description: string
  industry: string
  size: 'startup' | 'small' | 'medium' | 'large' | 'enterprise'
  
  // Address Information
  address: {
    street: string
    city: string
    state: string
    country: string
    zipCode: string
  }
  
  // Admin User Details
  adminUser: {
    firstName: string
    lastName: string
    email: string
    phone: string
    department: string
    role: 'ceo' | 'cfo' | 'admin' | 'manager' | 'accountant'
  }
  
  // Organization Settings
  settings: {
    allowSelfSignup: boolean
    requireAdminApproval: boolean
    dataRetentionDays: number
    maxUsersAllowed: number
    enableDepartments: boolean
    allowedDomains: string[]
  }
}

const STEPS = [
  { id: 'organization', title: 'Organization Details', icon: Building2 },
  { id: 'address', title: 'Address & Location', icon: MapPin },
  { id: 'admin', title: 'Admin User Setup', icon: Shield },
  { id: 'settings', title: 'Preferences', icon: Users },
  { id: 'pricing', title: 'Pricing Plan', icon: CreditCard },
  { id: 'review', title: 'Review & Create', icon: Check }
]

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
  'Retail', 'Real Estate', 'Consulting', 'Legal', 'Non-profit', 'Other'
]

const DEPARTMENTS = [
  'Accounting', 'Finance', 'Operations', 'HR', 'IT', 'Marketing', 
  'Sales', 'Legal', 'Executive', 'Other'
]

const USER_ROLES = [
  { value: 'ceo', label: 'Chief Executive Officer' },
  { value: 'cfo', label: 'Chief Financial Officer' },
  { value: 'admin', label: 'Administrator' },
  { value: 'manager', label: 'Manager' },
  { value: 'accountant', label: 'Accountant' }
]

const ORGANIZATION_SIZES = [
  { value: 'startup', label: 'Startup (1-10 employees)', maxUsers: 10 },
  { value: 'small', label: 'Small Business (11-50 employees)', maxUsers: 50 },
  { value: 'medium', label: 'Medium Business (51-200 employees)', maxUsers: 200 },
  { value: 'large', label: 'Large Business (201-1000 employees)', maxUsers: 1000 },
  { value: 'enterprise', label: 'Enterprise (1000+ employees)', maxUsers: 5000 }
]

const OrganizationSetup: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<OrganizationFormData>({
    name: '',
    domain: '',
    description: '',
    industry: '',
    size: 'small',
    
    address: {
      street: '',
      city: '',
      state: '',
      country: 'India',
      zipCode: ''
    },
    
    adminUser: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      department: 'Executive',
      role: 'admin'
    },
    
    settings: {
      allowSelfSignup: false,
      requireAdminApproval: true,
      dataRetentionDays: 365,
      maxUsersAllowed: 50,
      enableDepartments: true,
      allowedDomains: []
    }
  })

  // Auto-populate admin email from current user
  useEffect(() => {
    const currentUser = authService.getCurrentUser()
    if (currentUser?.email) {
      setFormData(prev => ({
        ...prev,
        adminUser: {
          ...prev.adminUser,
          email: currentUser.email || ''
        }
      }))
      
      // Auto-set domain from email
      const emailDomain = currentUser.email.split('@')[1]
      if (emailDomain && !formData.domain) {
        setFormData(prev => ({
          ...prev,
          domain: emailDomain,
          settings: {
            ...prev.settings,
            allowedDomains: [emailDomain]
          }
        }))
      }
    }
  }, [])

  const updateFormData = (section: keyof OrganizationFormData, data: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: typeof prev[section] === 'object' && !Array.isArray(prev[section])
        ? { ...prev[section], ...data }
        : data
    }))
  }

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      // Create organization
      const organizationData = {
        name: formData.name,
        domain: formData.domain,
        description: formData.description,
        industry: formData.industry,
        size: formData.size,
        address: formData.address,
        settings: {
          ...formData.settings,
          maxUsersAllowed: ORGANIZATION_SIZES.find(s => s.value === formData.size)?.maxUsers || 50
        }
      }

      const orgId = await organizationService.createOrganization(organizationData, formData.adminUser)
      setCreatedOrgId(orgId)
      
      toast.success('Organization created successfully!')
      
      // Move to success step
      setCurrentStep(STEPS.length)
      
    } catch (error) {
      console.error('❌ Error creating organization:', error)
      toast.error('Failed to create organization. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const renderStepContent = () => {
    switch (STEPS[currentStep]?.id) {
      case 'organization':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Organization Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Acme Corporation"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Primary Domain *
              </label>
              <input
                type="text"
                value={formData.domain}
                onChange={(e) => updateFormData('domain', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="acme.com"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Users with this email domain will be automatically associated with your organization
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Industry
              </label>
              <select
                value={formData.industry}
                onChange={(e) => updateFormData('industry', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Industry</option>
                {INDUSTRIES.map(industry => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Organization Size *
              </label>
              <div className="space-y-2">
                {ORGANIZATION_SIZES.map(size => (
                  <label key={size.value} className="flex items-center">
                    <input
                      type="radio"
                      name="size"
                      value={size.value}
                      checked={formData.size === size.value}
                      onChange={(e) => updateFormData('size', e.target.value)}
                      className="mr-3"
                    />
                    <span>{size.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateFormData('description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Brief description of your organization..."
              />
            </div>
          </div>
        )

      case 'address':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Street Address *
              </label>
              <input
                type="text"
                value={formData.address.street}
                onChange={(e) => updateFormData('address', { street: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="123 Business Street"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  City *
                </label>
                <input
                  type="text"
                  value={formData.address.city}
                  onChange={(e) => updateFormData('address', { city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Mumbai"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  State *
                </label>
                <input
                  type="text"
                  value={formData.address.state}
                  onChange={(e) => updateFormData('address', { state: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Maharashtra"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country *
                </label>
                <input
                  type="text"
                  value={formData.address.country}
                  onChange={(e) => updateFormData('address', { country: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="India"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ZIP Code *
                </label>
                <input
                  type="text"
                  value={formData.address.zipCode}
                  onChange={(e) => updateFormData('address', { zipCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="400001"
                  required
                />
              </div>
            </div>
          </div>
        )

      case 'admin':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name *
                </label>
                <input
                  type="text"
                  value={formData.adminUser.firstName}
                  onChange={(e) => updateFormData('adminUser', { firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name *
                </label>
                <input
                  type="text"
                  value={formData.adminUser.lastName}
                  onChange={(e) => updateFormData('adminUser', { lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email *
              </label>
              <input
                type="email"
                value={formData.adminUser.email}
                onChange={(e) => updateFormData('adminUser', { email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-gray-50"
                readOnly
              />
              <p className="text-sm text-gray-500 mt-1">
                This is your current logged-in email address
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.adminUser.phone}
                onChange={(e) => updateFormData('adminUser', { phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="+91 98765 43210"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Department
                </label>
                <select
                  value={formData.adminUser.department}
                  onChange={(e) => updateFormData('adminUser', { department: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role *
                </label>
                <select
                  value={formData.adminUser.role}
                  onChange={(e) => updateFormData('adminUser', { role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {USER_ROLES.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )

      case 'settings':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Allow Self-Signup
                  </label>
                  <p className="text-sm text-gray-500">
                    Users with your domain can join automatically
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.settings.allowSelfSignup}
                  onChange={(e) => updateFormData('settings', { allowSelfSignup: e.target.checked })}
                  className="rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Require Admin Approval
                  </label>
                  <p className="text-sm text-gray-500">
                    New users need admin approval before accessing
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.settings.requireAdminApproval}
                  onChange={(e) => updateFormData('settings', { requireAdminApproval: e.target.checked })}
                  className="rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Enable Departments
                  </label>
                  <p className="text-sm text-gray-500">
                    Organize users by departments
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.settings.enableDepartments}
                  onChange={(e) => updateFormData('settings', { enableDepartments: e.target.checked })}
                  className="rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Data Retention Period (days)
              </label>
              <select
                value={formData.settings.dataRetentionDays}
                onChange={(e) => updateFormData('settings', { dataRetentionDays: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
                <option value={730}>2 years</option>
                <option value={1095}>3 years</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Allowed Domains
              </label>
              <textarea
                value={formData.settings.allowedDomains.join('\n')}
                onChange={(e) => updateFormData('settings', { 
                  allowedDomains: e.target.value.split('\n').filter(d => d.trim()) 
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="example.com&#10;subsidiary.com"
              />
              <p className="text-sm text-gray-500 mt-1">
                One domain per line. Your primary domain is already included.
              </p>
            </div>
          </div>
        )

      case 'review':
        return (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Organization Details</h4>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Name:</span> {formData.name}</div>
                <div><span className="font-medium">Domain:</span> {formData.domain}</div>
                <div><span className="font-medium">Industry:</span> {formData.industry}</div>
                <div><span className="font-medium">Size:</span> {ORGANIZATION_SIZES.find(s => s.value === formData.size)?.label}</div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Address</h4>
              <div className="text-sm">
                {formData.address.street}<br/>
                {formData.address.city}, {formData.address.state} {formData.address.zipCode}<br/>
                {formData.address.country}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">Administrator</h4>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Name:</span> {formData.adminUser.firstName} {formData.adminUser.lastName}</div>
                <div><span className="font-medium">Email:</span> {formData.adminUser.email}</div>
                <div><span className="font-medium">Role:</span> {USER_ROLES.find(r => r.value === formData.adminUser.role)?.label}</div>
                <div><span className="font-medium">Department:</span> {formData.adminUser.department}</div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Ready to create your organization</p>
                  <p>Once created, you'll receive an Organization ID and Admin credentials. This information will be needed for user management and system administration.</p>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return <div>Step not found</div>
    }
  }

  if (createdOrgId) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <div className="bg-green-50 border border-green-200 rounded-lg p-8">
          <Check className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-green-900 mb-4">
            Organization Created Successfully!
          </h2>
          
          <div className="space-y-4 text-left bg-white p-6 rounded-lg border">
            <h3 className="font-medium text-gray-900">Your Organization Details:</h3>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Organization ID:</span> <code className="bg-gray-100 px-2 py-1 rounded">{createdOrgId}</code></div>
              <div><span className="font-medium">Organization Name:</span> {formData.name}</div>
              <div><span className="font-medium">Domain:</span> {formData.domain}</div>
              <div><span className="font-medium">Admin Email:</span> {formData.adminUser.email}</div>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg text-left">
            <h4 className="font-medium text-blue-900 mb-2">Next Steps:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Save your Organization ID for future reference</li>
              <li>• You can now invite users to join your organization</li>
              <li>• Users with your domain will be automatically associated</li>
              <li>• Access the Admin Dashboard to manage users and settings</li>
            </ul>
          </div>
          
          <button
            onClick={() => window.location.reload()}
            className="mt-6 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Organization</h1>
        <p className="text-gray-600">Set up your organization and become the administrator</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = index === currentStep
            const isCompleted = index < currentStep
            
            return (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                  isCompleted ? 'bg-green-600 text-white' :
                  isActive ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                  {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <span className={`ml-3 text-sm font-medium ${
                  isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {step.title}
                </span>
                {index < STEPS.length - 1 && (
                  <ArrowRight className="w-5 h-5 text-gray-400 mx-4" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          {STEPS[currentStep]?.title}
        </h2>
        {renderStepContent()}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <button
          onClick={prevStep}
          disabled={currentStep === 0}
          className="flex items-center px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Previous
        </button>
        
        {currentStep === STEPS.length - 1 ? (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Organization'}
          </button>
        ) : (
          <button
            onClick={nextStep}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </button>
        )}
      </div>
    </div>
  )
}

export default OrganizationSetup