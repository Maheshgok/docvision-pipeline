import React, { useState, useEffect } from 'react'
import { Settings, Save, Plus, Trash2, CreditCard, Shield, Upload, QrCode } from 'lucide-react'
import { userService } from '../../services/userService'
import { cloudStorageService } from '../../services/cloudStorageService'
import toast from 'react-hot-toast'

interface SuperAdminSettingsProps {
  // Empty for now - could add props if needed
}

interface UPIConfig {
  vpa: string // UPI ID like maheshgok@paytm
  name: string // Display name for payments
  businessName: string // Business name
  qrCodeUrl?: string // QR code image URL
  isActive: boolean
}

interface SuperAdminConfig {
  allowedEmails: string[]
  upiConfig: UPIConfig
  systemSettings: {
    maintenanceMode: boolean
    newRegistrations: boolean
    paymentVerificationAuto: boolean
  }
}

export const SuperAdminSettings: React.FC<SuperAdminSettingsProps> = () => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<SuperAdminConfig>({
    allowedEmails: ['maheshgok@gmail.com'],
    upiConfig: {
      vpa: 'maheshgok@paytm',
      name: 'Invoice Processor',
      businessName: 'Invoice Processing Services',
      qrCodeUrl: '',
      isActive: true
    },
    systemSettings: {
      maintenanceMode: false,
      newRegistrations: true,
      paymentVerificationAuto: false
    }
  })
  const [newEmail, setNewEmail] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const savedConfig = await userService.getSuperAdminConfig()
      if (savedConfig) {
        setConfig(savedConfig)
      }
    } catch (error) {
      console.error('Failed to load admin config:', error)
      // Use default config if loading fails
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      await userService.saveSuperAdminConfig(config)
      toast.success('Settings saved successfully!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const addAdminEmail = () => {
    if (!newEmail.trim()) {
      toast.error('Please enter a valid email address')
      return
    }
    
    if (config.allowedEmails.includes(newEmail.trim().toLowerCase())) {
      toast.error('This email is already added as admin')
      return
    }

    setConfig(prev => ({
      ...prev,
      allowedEmails: [...prev.allowedEmails, newEmail.trim().toLowerCase()]
    }))
    setNewEmail('')
    toast.success('Admin email added (remember to save changes)')
  }

  const removeAdminEmail = (emailToRemove: string) => {
    if (config.allowedEmails.length <= 1) {
      toast.error('Cannot remove the last admin email')
      return
    }

    setConfig(prev => ({
      ...prev,
      allowedEmails: prev.allowedEmails.filter(email => email !== emailToRemove)
    }))
    toast.success('Admin email removed (remember to save changes)')
  }

  const updateUPIConfig = (field: keyof UPIConfig, value: string | boolean) => {
    setConfig(prev => ({
      ...prev,
      upiConfig: {
        ...prev.upiConfig,
        [field]: value
      }
    }))
  }

  const handleQRCodeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setSaving(true)
      toast.loading('Uploading QR code to cloud storage...')
      
      // Delete old QR code if exists
      if (config.upiConfig.qrCodeUrl) {
        await cloudStorageService.deleteQRCode(config.upiConfig.qrCodeUrl)
      }
      
      // Upload new QR code to cloud storage
      const downloadURL = await cloudStorageService.uploadQRCode(file)
      
      // Update config with cloud URL
      updateUPIConfig('qrCodeUrl', downloadURL)
      
      toast.dismiss()
      toast.success('QR code uploaded to cloud storage!')
      
    } catch (error: any) {
      toast.dismiss()
      console.error('Error uploading QR code:', error)
      toast.error(error.message || 'Failed to upload QR code')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveQRCode = async () => {
    try {
      if (config.upiConfig.qrCodeUrl) {
        setSaving(true)
        toast.loading('Removing QR code from cloud storage...')
        
        await cloudStorageService.deleteQRCode(config.upiConfig.qrCodeUrl)
        updateUPIConfig('qrCodeUrl', '')
        
        toast.dismiss()
        toast.success('QR code removed successfully')
      }
    } catch (error: any) {
      toast.dismiss()
      console.error('Error removing QR code:', error)
      toast.error('Failed to remove QR code')
    } finally {
      setSaving(false)
    }
  }

  const updateSystemSetting = (field: keyof SuperAdminConfig['systemSettings'], value: boolean) => {
    setConfig(prev => ({
      ...prev,
      systemSettings: {
        ...prev.systemSettings,
        [field]: value
      }
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading settings...</span>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-red-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Super Admin Settings</h1>
            <p className="text-gray-600">Configure system-wide settings and payment details</p>
          </div>
        </div>
        
        <button
          onClick={saveConfig}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center space-x-2"
        >
          <Save className="w-5 h-5" />
          <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
        </button>
      </div>

      {/* Admin Email Management */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <Shield className="w-5 h-5 text-red-600 mr-2" />
          Super Admin Emails
        </h2>
        <p className="text-gray-600 mb-4">
          Only users with these email addresses will have super admin access.
        </p>

        {/* Current Admin Emails */}
        <div className="space-y-2 mb-4">
          {config.allowedEmails.map((email, index) => (
            <div key={email} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-red-600" />
                <span className="font-medium text-gray-900">{email}</span>
                {index === 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full">Primary</span>}
              </div>
              {config.allowedEmails.length > 1 && (
                <button
                  onClick={() => removeAdminEmail(email)}
                  className="text-red-600 hover:text-red-700 p-1"
                  title="Remove admin access"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add New Admin Email */}
        <div className="flex space-x-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Enter email address for new admin"
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={addAdminEmail}
            className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Admin</span>
          </button>
        </div>
      </div>

      {/* UPI Payment Configuration */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <CreditCard className="w-5 h-5 text-green-600 mr-2" />
          UPI Payment Configuration
        </h2>
        <p className="text-gray-600 mb-6">
          Configure your UPI details for payment collection. Users will see QR codes with these details.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              UPI ID *
            </label>
            <input
              type="text"
              value={config.upiConfig.vpa}
              onChange={(e) => updateUPIConfig('vpa', e.target.value)}
              placeholder="yourname@paytm"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Your UPI ID (e.g., yourname@paytm, yourname@phonepe)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Display Name *
            </label>
            <input
              type="text"
              value={config.upiConfig.name}
              onChange={(e) => updateUPIConfig('name', e.target.value)}
              placeholder="Invoice Processor"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Name shown in UPI payment requests</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Business Name
            </label>
            <input
              type="text"
              value={config.upiConfig.businessName}
              onChange={(e) => updateUPIConfig('businessName', e.target.value)}
              placeholder="Invoice Processing Services"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Your business name for receipts</p>
          </div>

          {/* QR Code Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              UPI QR Code Image
            </label>
            <div className="space-y-3">
              {config.upiConfig.qrCodeUrl ? (
                <div className="flex items-start space-x-4">
                  <img 
                    src={config.upiConfig.qrCodeUrl} 
                    alt="UPI QR Code" 
                    className="w-24 h-24 object-contain border border-gray-200 rounded"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600 mb-2">Current QR code</p>
                    <button
                      onClick={handleRemoveQRCode}
                      disabled={saving}
                      className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      Remove QR Code
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 border-2 border-dashed border-gray-300 rounded-lg">
                  <QrCode className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No QR code uploaded</p>
                </div>
              )}
              
              <label className={`inline-flex items-center px-4 py-2 text-white text-sm rounded-lg cursor-pointer transition-colors ${
                saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}>
                <Upload className="w-4 h-4 mr-2" />
                {saving ? 'Uploading...' : (config.upiConfig.qrCodeUrl ? 'Replace QR Code' : 'Upload QR Code')}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQRCodeUpload}
                  disabled={saving}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Upload your UPI QR code image (PNG, JPG, etc.) - stored securely in cloud storage
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="upiActive"
              checked={config.upiConfig.isActive}
              onChange={(e) => updateUPIConfig('isActive', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <label htmlFor="upiActive" className="text-sm font-medium text-gray-700">
              Enable UPI Payments
            </label>
          </div>
        </div>

        {/* UPI Preview */}
        {config.upiConfig.vpa && config.upiConfig.name && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Payment Preview:</h3>
            <div className="text-sm text-blue-800">
              <p><strong>To:</strong> {config.upiConfig.name}</p>
              <p><strong>UPI ID:</strong> {config.upiConfig.vpa}</p>
              <p><strong>Business:</strong> {config.upiConfig.businessName}</p>
            </div>
          </div>
        )}
      </div>

      {/* System Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <Settings className="w-5 h-5 text-gray-600 mr-2" />
          System Settings
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Maintenance Mode</h3>
              <p className="text-sm text-gray-600">Temporarily disable the system for maintenance</p>
            </div>
            <input
              type="checkbox"
              checked={config.systemSettings.maintenanceMode}
              onChange={(e) => updateSystemSetting('maintenanceMode', e.target.checked)}
              className="w-4 h-4 text-red-600 rounded"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Allow New Registrations</h3>
              <p className="text-sm text-gray-600">Allow new users to register and create accounts</p>
            </div>
            <input
              type="checkbox"
              checked={config.systemSettings.newRegistrations}
              onChange={(e) => updateSystemSetting('newRegistrations', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center space-x-2"
        >
          <Save className="w-5 h-5" />
          <span>{saving ? 'Saving Changes...' : 'Save All Changes'}</span>
        </button>
      </div>
    </div>
  )
}