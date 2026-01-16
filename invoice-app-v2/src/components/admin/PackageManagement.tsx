import React, { useState, useEffect } from 'react'
import { 
  Package, 
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  X,
  Calendar,
  CheckCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { packageService, type PackageDefinition } from '../../services/packageService'
import { Timestamp } from 'firebase/firestore'

// Use PackageDefinition as the base interface
type SubscriptionPackage = PackageDefinition

interface PackageManagementProps {}

const PackageManagement: React.FC<PackageManagementProps> = () => {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPackage, setEditingPackage] = useState<SubscriptionPackage | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    duration: 30,
    price: 0,
    currency: 'USD',
    features: [''],
    isActive: true,
    type: 'time_based' as 'time_based' | 'consumption_based' | 'hybrid',
    analysisLimit: 100,
    isUnlimited: false
  })

  useEffect(() => {
    loadPackages()
  }, [])

  const loadPackages = async () => {
    try {
      setLoading(true)
      const packagesData = await packageService.getAllPackages()
      setPackages(packagesData as SubscriptionPackage[])
    } catch (error) {
      console.error('Error loading packages:', error)
      toast.error('Failed to load packages')
    } finally {
      setLoading(false)
    }
  }

  const handleAddPackage = () => {
    setFormData({
      name: '',
      duration: 30,
      price: 0,
      currency: 'USD',
      features: [''],
      isActive: true,
      type: 'time_based',
      analysisLimit: 100,
      isUnlimited: false
    })
    setEditingPackage(null)
    setShowAddModal(true)
  }

  const handleEditPackage = (pkg: SubscriptionPackage) => {
    setFormData({
      name: pkg.name,
      duration: pkg.duration,
      price: pkg.price,
      currency: pkg.currency,
      features: [...pkg.features],
      isActive: pkg.isActive,
      type: pkg.type || 'time_based',
      analysisLimit: pkg.analysisLimit || 100,
      isUnlimited: pkg.isUnlimited || false
    })
    setEditingPackage(pkg)
    setShowAddModal(true)
  }

  const handleSavePackage = async () => {
    try {
      if (!formData.name || formData.duration <= 0 || formData.price < 0) {
        toast.error('Please fill in all required fields with valid values')
        return
      }

      // Validate consumption-based packages have analysis limit (unless unlimited)
      if ((formData.type === 'consumption_based' || formData.type === 'hybrid') && 
          !formData.isUnlimited && formData.analysisLimit <= 0) {
        toast.error('Consumption-based packages must have a valid analysis limit')
        return
      }

      const packageData = {
        name: formData.name,
        type: formData.type,
        duration: formData.duration,
        analysisLimit: formData.isUnlimited ? 10000 : formData.analysisLimit,
        price: formData.price,
        currency: formData.currency,
        features: formData.features.filter(f => f.trim() !== ''),
        isActive: formData.isActive,
        isUnlimited: formData.isUnlimited
      }

      if (editingPackage) {
        // Update existing package
        await packageService.updatePackage(editingPackage.id, packageData)
        toast.success('Package updated successfully')
      } else {
        // Create new package
        await packageService.createPackage(packageData)
        toast.success('Package created successfully')
      }

      setShowAddModal(false)
      setEditingPackage(null)
      loadPackages() // Reload packages from database
      
      // TODO: Save to backend
      
    } catch (error) {
      console.error('Error saving package:', error)
      toast.error('Failed to save package')
    }
  }

  const handleDeletePackage = async (packageId: string) => {
    if (!window.confirm('Are you sure you want to delete this package?')) {
      return
    }

    try {
      await packageService.deletePackage(packageId)
      toast.success('Package deleted successfully')
      loadPackages() // Reload packages from database
      
    } catch (error: any) {
      console.error('Error deleting package:', error)
      toast.error(error.message || 'Failed to delete package')
    }
  }

  const handleToggleActive = async (packageId: string) => {
    try {
      setPackages(prev => prev.map(p => 
        p.id === packageId ? { ...p, isActive: !p.isActive, updatedAt: Timestamp.now() } : p
      ))
      toast.success('Package status updated')
      
      // Update backend
      await packageService.togglePackageStatus(packageId)
      
    } catch (error) {
      console.error('Error updating package status:', error)
      toast.error('Failed to update package status')
    }
  }

  const addFeature = () => {
    setFormData(prev => ({
      ...prev,
      features: [...prev.features, '']
    }))
  }

  const removeFeature = (index: number) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }))
  }

  const updateFeature = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.map((f, i) => i === index ? value : f)
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading packages...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Package Management</h2>
          <p className="text-gray-600">Configure subscription packages and pricing</p>
        </div>
        <button
          onClick={handleAddPackage}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          <span>Add Package</span>
        </button>
      </div>

      {/* Packages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {packages.map((pkg) => (
          <div key={pkg.id} className={`bg-white rounded-lg border-2 p-6 ${pkg.isActive ? 'border-green-200' : 'border-gray-200'}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Package className="w-6 h-6 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">{pkg.name}</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleEditPackage(pkg)}
                  className="text-blue-600 hover:text-blue-800"
                  title="Edit Package"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={() => handleDeletePackage(pkg.id)}
                  className="text-red-600 hover:text-red-800"
                  title="Delete Package"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-gray-900">
                  ₹{pkg.price}
                </span>
                <span className="text-sm text-gray-500">
                  /{pkg.duration} days
                </span>
              </div>

              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Calendar size={16} />
                <span>{pkg.duration} days duration</span>
              </div>

              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Package size={16} />
                <span className="capitalize">{pkg.type?.replace('_', ' ') || 'Time Based'} Package</span>
              </div>

              {(pkg.type === 'consumption_based' || pkg.type === 'hybrid') && pkg.analysisLimit && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <CheckCircle size={16} className="text-blue-500" />
                  <span>{pkg.analysisLimit} analysis credits</span>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Features:</p>
                <ul className="space-y-1">
                  {pkg.features.map((feature, index) => (
                    <li key={index} className="flex items-center space-x-2 text-sm text-gray-600">
                      <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t">
                <button
                  onClick={() => handleToggleActive(pkg.id)}
                  className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    pkg.isActive
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {pkg.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Package Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  {editingPackage ? 'Edit Package' : 'Add New Package'}
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Package Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Premium Plan"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Duration (Days)
                  </label>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Currency
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="INR">INR</option>
                  </select>
                </div>
              </div>

              {/* Package Type and Analysis Limit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Package Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as 'time_based' | 'consumption_based' | 'hybrid' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="time_based">Time Based</option>
                    <option value="consumption_based">Consumption Based</option>
                    <option value="hybrid">Hybrid (Time + Consumption)</option>
                  </select>
                </div>
                
                {/* Unlimited checkbox for time-based packages */}
                {formData.type === 'time_based' && (
                  <div className="flex items-center space-x-2 pt-8">
                    <input
                      type="checkbox"
                      id="isUnlimited"
                      checked={formData.isUnlimited}
                      onChange={(e) => setFormData(prev => ({ ...prev, isUnlimited: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="isUnlimited" className="text-sm font-medium text-gray-700">
                      Unlimited Analysis
                    </label>
                  </div>
                )}
                
                {/* Analysis Limit */}
                {((formData.type === 'consumption_based' || formData.type === 'hybrid') || 
                  (formData.type === 'time_based' && !formData.isUnlimited)) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Analysis Limit
                    </label>
                    <input
                      type="number"
                      value={formData.analysisLimit}
                      onChange={(e) => setFormData(prev => ({ ...prev, analysisLimit: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="1"
                      placeholder={formData.type === 'time_based' ? "Leave blank for unlimited" : "e.g., 100"}
                    />
                  </div>
                )}
              </div>

              {/* Features */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Features
                </label>
                <div className="space-y-2">
                  {formData.features.map((feature, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={feature}
                        onChange={(e) => updateFeature(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter feature description"
                      />
                      <button
                        onClick={() => removeFeature(index)}
                        className="text-red-600 hover:text-red-800"
                        disabled={formData.features.length === 1}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addFeature}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    + Add Feature
                  </button>
                </div>
              </div>

              {/* Active Status */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                  Package is active and available for users
                </label>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePackage}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Save size={16} />
                <span>{editingPackage ? 'Update' : 'Create'} Package</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PackageManagement