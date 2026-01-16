import React, { useState } from 'react'
import { Building2, Search, Plus } from 'lucide-react'
import { userService } from '../../services/userService'
import toast from 'react-hot-toast'

interface OrganizationStepProps {
  onComplete: (organizationData: { organizationId: string; organizationName: string; isNew: boolean }) => void
  onBack: () => void
}

interface OrganizationOption {
  id: string
  name: string
  domain?: string
  memberCount?: number
}

const OrganizationStep: React.FC<OrganizationStepProps> = ({ onComplete, onBack }) => {
  const [selectedOption, setSelectedOption] = useState<'join' | 'create'>('create')
  const [organizationName, setOrganizationName] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [availableOrganizations, setAvailableOrganizations] = useState<OrganizationOption[]>([])
  const [selectedOrganization, setSelectedOrganization] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  const handleSearchOrganizations = async () => {
    if (!searchTerm.trim()) return

    setSearching(true)
    try {
      // Search for organizations by name (this would need to be implemented in userService)
      // For now, we'll show a placeholder
      setAvailableOrganizations([
        {
          id: 'demo-org-1',
          name: 'Tech Solutions Inc',
          memberCount: 5
        },
        {
          id: 'demo-org-2', 
          name: 'Digital Marketing Agency',
          memberCount: 12
        }
      ])
    } catch (error) {
      toast.error('Failed to search organizations')
    } finally {
      setSearching(false)
    }
  }

  const handleCreateOrganization = async () => {
    if (!organizationName.trim()) {
      toast.error('Please enter an organization name')
      return
    }

    setLoading(true)
    try {
      // Create new organization
      const orgId = await userService.createOrganizationWithName(organizationName.trim())
      onComplete({
        organizationId: orgId,
        organizationName: organizationName.trim(),
        isNew: true
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinOrganization = () => {
    if (!selectedOrganization) {
      toast.error('Please select an organization')
      return
    }

    const org = availableOrganizations.find(o => o.id === selectedOrganization)
    if (!org) return

    onComplete({
      organizationId: selectedOrganization,
      organizationName: org.name,
      isNew: false
    })
  }

  const handleSubmit = () => {
    if (selectedOption === 'create') {
      handleCreateOrganization()
    } else {
      handleJoinOrganization()
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Set Up Your Organization</h2>
        <p className="text-gray-600">
          Create a new organization or join an existing one to manage your team's invoices
        </p>
      </div>

      {/* Option Selection */}
      <div className="grid md:grid-cols-2 gap-4">
        <button
          onClick={() => setSelectedOption('create')}
          className={`p-6 border-2 rounded-lg text-left transition-all ${
            selectedOption === 'create'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center space-x-3 mb-3">
            <Plus className="w-6 h-6 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Create New Organization</h3>
          </div>
          <p className="text-sm text-gray-600">
            Start fresh with your own organization. You'll be the admin and can invite team members.
          </p>
        </button>

        <button
          onClick={() => setSelectedOption('join')}
          className={`p-6 border-2 rounded-lg text-left transition-all ${
            selectedOption === 'join'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center space-x-3 mb-3">
            <Search className="w-6 h-6 text-green-600" />
            <h3 className="font-semibold text-gray-900">Join Existing Organization</h3>
          </div>
          <p className="text-sm text-gray-600">
            Search and join an organization that already exists. You'll need admin approval.
          </p>
        </button>
      </div>

      {/* Create Organization Form */}
      {selectedOption === 'create' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Create Your Organization</h4>
          <div className="space-y-4">
            <div>
              <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name *
              </label>
              <input
                type="text"
                id="orgName"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Enter your organization name"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                maxLength={100}
              />
              <p className="text-xs text-gray-500 mt-1">
                This will be displayed to team members and in reports
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Join Organization Form */}
      {selectedOption === 'join' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Find Your Organization</h4>
          <div className="space-y-4">
            <div className="flex space-x-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search organization name..."
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleSearchOrganizations}
                disabled={searching || !searchTerm.trim()}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {availableOrganizations.length > 0 && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Available Organizations:</label>
                {availableOrganizations.map((org) => (
                  <label key={org.id} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="radio"
                      name="organization"
                      value={org.id}
                      checked={selectedOrganization === org.id}
                      onChange={(e) => setSelectedOrganization(e.target.value)}
                      className="text-blue-600"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{org.name}</div>
                      {org.memberCount && (
                        <div className="text-sm text-gray-500">{org.memberCount} members</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-4">
        <button
          onClick={onBack}
          className="flex-1 bg-gray-200 text-gray-800 py-3 px-6 rounded-lg font-medium hover:bg-gray-300 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading || (selectedOption === 'create' && !organizationName.trim()) || (selectedOption === 'join' && !selectedOrganization)}
          className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Processing...' : selectedOption === 'create' ? 'Create Organization' : 'Request to Join'}
        </button>
      </div>
    </div>
  )
}

export default OrganizationStep