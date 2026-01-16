import React, { useState, useEffect } from 'react'
import { organizationService, UserOrganizationProfile, BUSINESS_TYPES } from '../../services/organizationProfiles'
import toast from 'react-hot-toast'

interface OrganizationManagementProps {
  onSelectOrganization?: (org: UserOrganizationProfile) => void
  selectionMode?: boolean
}

const OrganizationManagement: React.FC<OrganizationManagementProps> = ({ 
  onSelectOrganization, 
  selectionMode = false 
}) => {
  const [organizations, setOrganizations] = useState<UserOrganizationProfile[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingOrg, setEditingOrg] = useState<UserOrganizationProfile | null>(null)
  const [loading, setLoading] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    gstin: '',
    business_type: '',
    industry: '',
    business_description: '',
    capitalization_threshold: 50000,
    common_hsn_codes: [] as string[],
    expense_categories: [] as string[],
    address: '',
    contact_person: '',
    phone: '',
    email: '',
    is_default: false,
    is_active: true
  })

  useEffect(() => {
    loadOrganizations()
  }, [])

  const loadOrganizations = async () => {
    try {
      setLoading(true)
      const orgs = await organizationService.getOrganizations()
      setOrganizations(orgs)
    } catch (error) {
      toast.error('Failed to load organizations')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleBusinessTypeChange = (businessType: string) => {
    const template = organizationService.getBusinessTypeTemplate(businessType)
    if (template) {
      setFormData(prev => ({
        ...prev,
        business_type: template.value,
        industry: template.label,
        business_description: template.description,
        capitalization_threshold: template.capitalization_threshold,
        common_hsn_codes: [...template.common_hsn_codes],
        expense_categories: [...template.expense_categories]
      }))
    }
  }

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      await organizationService.createOrganization(formData)
      toast.success('Organization created successfully!')
      setShowCreateForm(false)
      resetForm()
      loadOrganizations()
    } catch (error) {
      toast.error('Failed to create organization')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOrg?.id) return
    
    try {
      setLoading(true)
      await organizationService.updateOrganization(editingOrg.id, formData)
      toast.success('Organization updated successfully!')
      setEditingOrg(null)
      resetForm()
      loadOrganizations()
    } catch (error) {
      toast.error('Failed to update organization')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteOrganization = async (orgId: string) => {
    if (!confirm('Are you sure you want to delete this organization?')) return
    
    try {
      setLoading(true)
      await organizationService.deleteOrganization(orgId)
      toast.success('Organization deleted successfully!')
      loadOrganizations()
    } catch (error) {
      toast.error('Failed to delete organization')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSetDefault = async (orgId: string) => {
    try {
      setLoading(true)
      await organizationService.setDefaultOrganization(orgId)
      toast.success('Default organization updated!')
      loadOrganizations()
    } catch (error) {
      toast.error('Failed to set default organization')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (org: UserOrganizationProfile) => {
    setEditingOrg(org)
    setFormData({
      name: org.name,
      gstin: org.gstin,
      business_type: org.business_type,
      industry: org.industry,
      business_description: org.business_description,
      capitalization_threshold: org.capitalization_threshold,
      common_hsn_codes: [...org.common_hsn_codes],
      expense_categories: [...org.expense_categories],
      address: org.address,
      contact_person: org.contact_person,
      phone: org.phone,
      email: org.email,
      is_default: org.is_default,
      is_active: org.is_active || true
    })
  }

  const resetForm = () => {
    setFormData({
      name: '',
      gstin: '',
      business_type: '',
      industry: '',
      business_description: '',
      capitalization_threshold: 50000,
      common_hsn_codes: [],
      expense_categories: [],
      address: '',
      contact_person: '',
      phone: '',
      email: '',
      is_default: false,
      is_active: true
    })
  }

  if (selectionMode) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Select Organization Profile</h3>
        
        {loading ? (
          <div className="text-center py-8">Loading organizations...</div>
        ) : organizations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">No organization profiles found.</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create First Organization
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {organizations.map(org => (
              <div 
                key={org.id} 
                className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => onSelectOrganization?.(org)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-lg">{org.name}</h4>
                    <p className="text-gray-600">{org.industry}</p>
                    <p className="text-sm text-gray-500">GSTIN: {org.gstin}</p>
                    <p className="text-sm text-gray-500 mt-1">{org.business_description}</p>
                  </div>
                  {org.is_default && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      Default
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Organization Profiles</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Add Organization
        </button>
      </div>

      {/* Organization List */}
      {loading ? (
        <div className="text-center py-8">Loading organizations...</div>
      ) : (
        <div className="grid gap-6">
          {organizations.map(org => (
            <div key={org.id} className="bg-white border rounded-lg p-6 shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold">{org.name}</h3>
                    {org.is_default && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        Default
                      </span>
                    )}
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p><strong>Business Type:</strong> {org.industry}</p>
                      <p><strong>GSTIN:</strong> {org.gstin}</p>
                      <p><strong>Threshold:</strong> ₹{org.capitalization_threshold.toLocaleString()}</p>
                    </div>
                    <div>
                      <p><strong>Contact:</strong> {org.contact_person}</p>
                      <p><strong>Email:</strong> {org.email}</p>
                      <p><strong>Phone:</strong> {org.phone}</p>
                    </div>
                  </div>
                  
                  <p className="text-gray-600 mt-2">{org.business_description}</p>
                  
                  <div className="mt-3">
                    <p className="text-sm font-medium">Common HSN Codes:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {org.common_hsn_codes.map(hsn => (
                        <span key={hsn} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                          {hsn}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 ml-4">
                  {!org.is_default && (
                    <button
                      onClick={() => handleSetDefault(org.id!)}
                      className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded hover:bg-green-200"
                      disabled={loading}
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(org)}
                    className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded hover:bg-blue-200"
                    disabled={loading}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteOrganization(org.id!)}
                    className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200"
                    disabled={loading}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {(showCreateForm || editingOrg) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">
              {editingOrg ? 'Edit Organization' : 'Create Organization'}
            </h3>
            
            <form onSubmit={editingOrg ? handleUpdateOrganization : handleCreateOrganization} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Organization Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">GSTIN *</label>
                  <input
                    type="text"
                    required
                    value={formData.gstin}
                    onChange={(e) => setFormData(prev => ({ ...prev, gstin: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Business Type *</label>
                <select
                  required
                  value={formData.business_type}
                  onChange={(e) => handleBusinessTypeChange(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Business Type</option>
                  {BUSINESS_TYPES.map(bt => {
                    const hsnPrefix = bt.common_hsn_codes[0]?.substring(0, 2) || bt.chapter_number.toString().padStart(2, '0')
                    return (
                      <option key={bt.value} value={bt.value}>
                        HSN {hsnPrefix}xx - {bt.label} | {bt.gst_section.split(':')[1]?.trim() || 'Services'}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Business Description</label>
                <textarea
                  value={formData.business_description}
                  onChange={(e) => setFormData(prev => ({ ...prev, business_description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Capitalization Threshold (₹)</label>
                <input
                  type="number"
                  value={formData.capitalization_threshold}
                  onChange={(e) => setFormData(prev => ({ ...prev, capitalization_threshold: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setEditingOrg(null)
                    resetForm()
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : editingOrg ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrganizationManagement