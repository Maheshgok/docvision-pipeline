import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { AlertTriangle, CreditCard, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { userService, UserProfile } from '../services/userService'
import { useAuth } from '../contexts/AuthContext'

interface UPIConfig {
  vpa: string
  name: string
  businessName: string
  qrCodeUrl?: string
  isActive: boolean
}

// Utility function to convert various date types to Date object
const toDate = (timestamp: Timestamp | Date | string | any): Date => {
  if (timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate()
  }
  if (timestamp instanceof Date) {
    return timestamp
  }
  return new Date(timestamp)
}

const PaymentRenewal: React.FC = () => {
  const {} = useAuth()
  const navigate = useNavigate()
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [upiConfig, setUPIConfig] = useState<UPIConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [transactionId, setTransactionId] = useState('')
  const [amount, setAmount] = useState('')

  const SUBSCRIPTION_PLANS = [
    { name: '1 Month', amount: 1000, period: 30, popular: false },
    { name: '6 Months', amount: 5500, period: 180, popular: true, discount: 8 },
    { name: '1 Year', amount: 10000, period: 365, popular: false, discount: 17 }
  ]

  const [selectedPlan, setSelectedPlan] = useState(SUBSCRIPTION_PLANS[1]) // Default to 6 months

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [profileData, upiConfigData] = await Promise.all([
        userService.getUserProfile(),
        userService.getUPIConfig()
      ])
      
      setUserProfile(profileData)
      setUPIConfig(upiConfigData)
      setAmount(selectedPlan.amount.toString())
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Failed to load payment information')
    } finally {
      setLoading(false)
    }
  }

  const getSubscriptionStatus = () => {
    if (!userProfile?.paymentStatus) return 'not_paid'
    
    const expiresAt = userProfile.paymentStatus.expiresAt
    if (!expiresAt) return 'not_paid'
    
    const expiryDate = toDate(expiresAt)
    const now = new Date()
    
    if (expiryDate > now) {
      const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysLeft <= 7) return 'expiring_soon'
      return 'active'
    }
    
    return 'expired'
  }

  const handlePlanChange = (plan: typeof SUBSCRIPTION_PLANS[0]) => {
    setSelectedPlan(plan)
    setAmount(plan.amount.toString())
  }

  const handleVerifyPayment = async () => {
    if (!transactionId.trim()) {
      toast.error('Please enter transaction ID')
      return
    }

    if (!amount || parseInt(amount) <= 0) {
      toast.error('Please enter valid amount')
      return
    }

    try {
      setVerifying(true)
      
      await userService.verifyUserSubscriptionPayment(
        transactionId,
        amount,
        selectedPlan.period
      )
      
      toast.success('Payment verified successfully! Your subscription has been renewed.')
      setTimeout(() => navigate('/dashboard'), 2000)
      
    } catch (error: any) {
      console.error('Payment verification failed:', error)
      toast.error(error.message || 'Payment verification failed')
    } finally {
      setVerifying(false)
    }
  }

  const generateUPILink = () => {
    if (!upiConfig) return '#'
    
    const params = new URLSearchParams({
      pa: upiConfig.vpa,
      pn: upiConfig.name,
      tn: `Invoice Processing Service - ${selectedPlan.name} Subscription`,
      am: selectedPlan.amount.toString(),
      cu: 'INR'
    })
    
    return `upi://pay?${params.toString()}`
  }

  const getStatusColor = () => {
    const status = getSubscriptionStatus()
    switch (status) {
      case 'active': return 'text-green-600'
      case 'expiring_soon': return 'text-amber-600'
      case 'expired': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusText = () => {
    const status = getSubscriptionStatus()
    
    if (status === 'active' && userProfile?.paymentStatus?.expiresAt) {
      const expiryDate = toDate(userProfile.paymentStatus.expiresAt)
      const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return `Active (${daysLeft} days remaining)`
    }
    
    switch (status) {
      case 'expiring_soon': return 'Expiring Soon'
      case 'expired': return 'Expired - Renewal Required'
      default: return 'No Active Subscription'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const subscriptionStatus = getSubscriptionStatus()

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Subscription Management
          </h1>
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${getStatusColor()}`}>
            {subscriptionStatus === 'active' ? <CheckCircle size={16} className="mr-2" /> :
             subscriptionStatus === 'expiring_soon' ? <Clock size={16} className="mr-2" /> :
             <AlertTriangle size={16} className="mr-2" />}
            {getStatusText()}
          </div>
        </div>

        {/* Subscription Plans */}
        <div className="bg-white rounded-xl shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Choose Your Plan</h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <div
                key={plan.name}
                onClick={() => handlePlanChange(plan)}
                className={`relative p-6 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedPlan.name === plan.name
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                } ${plan.popular ? 'ring-2 ring-blue-500 ring-opacity-20' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white px-3 py-1 text-xs font-medium rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-gray-900">₹{plan.amount}</span>
                    {plan.discount && (
                      <div className="text-sm text-green-600 font-medium">
                        {plan.discount}% OFF
                      </div>
                    )}
                  </div>
                  <p className="text-gray-600 text-sm mt-2">{plan.period} days</p>
                </div>
                
                {selectedPlan.name === plan.name && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle className="text-blue-500" size={20} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Payment Section */}
        <div className="bg-white rounded-xl shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <CreditCard className="mr-3" size={24} />
            Payment Details
          </h2>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* UPI Payment */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pay via UPI</h3>
                
                {upiConfig?.qrCodeUrl ? (
                  <div className="text-center">
                    <img
                      src={upiConfig.qrCodeUrl}
                      alt="UPI QR Code"
                      className="mx-auto w-48 h-48 border rounded-lg"
                    />
                    <p className="text-sm text-gray-600 mt-2">Scan QR code to pay</p>
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                    <CreditCard className="mx-auto text-gray-400 mb-2" size={48} />
                    <p className="text-gray-600">QR code not available</p>
                  </div>
                )}
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-900">UPI ID: {upiConfig?.vpa || 'N/A'}</p>
                  <p className="text-sm text-gray-600">Amount: ₹{selectedPlan.amount}</p>
                  <p className="text-sm text-gray-600">Plan: {selectedPlan.name}</p>
                </div>

                <a
                  href={generateUPILink()}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors inline-block text-center"
                >
                  Pay ₹{selectedPlan.amount} via UPI
                </a>
              </div>
            </div>

            {/* Verification Form */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Verify Payment</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Transaction ID
                    </label>
                    <input
                      type="text"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="Enter UPI transaction ID"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount Paid
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount paid"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <button
                    onClick={handleVerifyPayment}
                    disabled={verifying || !transactionId.trim()}
                    className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    {verifying ? (
                      <>
                        <RefreshCw className="animate-spin mr-2" size={16} />
                        Verifying Payment...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2" size={16} />
                        Verify & Activate
                      </>
                    )}
                  </button>
                </div>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-medium text-amber-800 mb-2">Payment Instructions:</h4>
                <ul className="text-sm text-amber-700 space-y-1">
                  <li>1. Pay the exact amount via UPI</li>
                  <li>2. Copy the transaction ID from your payment app</li>
                  <li>3. Paste it above and click verify</li>
                  <li>4. Your subscription will be activated immediately</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="text-center mt-8">
          <p className="text-gray-600">
            Need help? Contact support at{' '}
            <a href="mailto:support@invoiceprocessor.com" className="text-blue-600 hover:underline">
              support@invoiceprocessor.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default PaymentRenewal