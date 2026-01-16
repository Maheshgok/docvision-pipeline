import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { userService } from '../../services/userService'
import { CheckCircle, Circle, CreditCard, User, Shield, FileText, IndianRupee, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import PaymentStep from './PaymentStep'
import VerificationStep from './VerificationStep'
import OrganizationStep from './OrganizationStep'
import WorkspaceStep from './WorkspaceStep'

interface OnboardingStep {
  id: number
  title: string
  description: string
  icon: React.ReactNode
  completed: boolean
}

const OnboardingFlow: React.FC = () => {
  const { user, userProfile, refreshUserProfile } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState(999) // Default amount in INR
  const [organizationData] = useState<{
    organizationId: string
    organizationName: string
    isNew: boolean
  } | null>(null)
  const [workspaceData, setWorkspaceData] = useState<{
    workspaceId: string
    storageQuota: number
    initialized: boolean
  } | null>(null)

  // Check if user should see onboarding
  const shouldShowOnboarding = !userProfile?.paymentStatus || 
                               userProfile?.paymentStatus?.status === 'pending' || 
                               userProfile?.paymentStatus?.status === 'paid' ||
                               !userProfile?.workspace_initialized
  
  // Debug logging
  console.log('🔍 Onboarding Debug:', {
    hasPaymentStatus: !!userProfile?.paymentStatus,
    paymentStatus: userProfile?.paymentStatus?.status,
    workspaceInitialized: userProfile?.workspace_initialized,
    shouldShowOnboarding
  })

  const steps: OnboardingStep[] = [
    {
      id: 1,
      title: 'Account Created',
      description: 'Your account has been successfully created',
      icon: <User className="w-6 h-6" />,
      completed: !!user
    },
    {
      id: 2,
      title: 'Set Up Organization',
      description: 'Create or join an organization for your team',
      icon: <Building2 className="w-6 h-6" />,
      completed: !!organizationData
    },
    {
      id: 3,
      title: 'Initialize Workspace',
      description: 'Set up your isolated file storage environment', 
      icon: <FileText className="w-6 h-6" />,
      completed: !!workspaceData?.initialized
    },
    {
      id: 4,
      title: 'Choose Plan & Payment',
      description: 'Select your subscription plan and make payment',
      icon: <CreditCard className="w-6 h-6" />,
      completed: userProfile?.paymentStatus?.status === 'paid' || 
                 userProfile?.paymentStatus?.status === 'verified'
    },
    {
      id: 5,
      title: 'Payment Verification',
      description: 'Waiting for admin verification of your payment',
      icon: <Shield className="w-6 h-6" />,
      completed: userProfile?.paymentStatus?.status === 'verified'
    },
    {
      id: 6,
      title: 'Start Processing',
      description: 'Upload and process your first invoice',
      icon: <FileText className="w-6 h-6" />,
      completed: false
    }
  ]

  // Redirect if already verified
  if (userProfile?.paymentStatus?.status === 'verified' || 
      userProfile?.paymentStatus?.status === 'free_trial') {
    return <Navigate to="/" replace />
  }

  // Show loading while profile is loading
  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Don't show onboarding if user doesn't need it
  if (!shouldShowOnboarding) {
    return <Navigate to="/" replace />
  }

  const handlePlanSelection = async (selectedAmount: number, subscriptionType: 'monthly' | 'yearly') => {
    try {
      setLoading(true)
      setPaymentAmount(selectedAmount)
      await userService.initializePayment(selectedAmount, subscriptionType)
      await refreshUserProfile()
      setCurrentStep(5) // Move to payment after plan selection
      toast.success('Plan selected! Please proceed with payment.')
    } catch (error: any) {
      console.error('Plan selection error:', error)
      toast.error(error.message || 'Failed to initialize payment')
    } finally {
      setLoading(false)
    }
  }

  const handleOrganizationComplete = async (_organizationData: any) => {
    try {
      setLoading(true)
      // Organization setup is handled in OrganizationStep component
      await refreshUserProfile()
      setCurrentStep(3) // Move to workspace step
      toast.success('Organization setup completed!')
    } catch (error: any) {
      console.error('Organization setup error:', error)
      toast.error(error.message || 'Failed to complete organization setup')
    } finally {
      setLoading(false)
    }
  }

  const handleWorkspaceComplete = async (workspace: any) => {
    try {
      setLoading(true)
      setWorkspaceData(workspace)
      setCurrentStep(4) // Move to plan selection
      toast.success('Workspace initialized successfully!')
    } catch (error: any) {
      console.error('Workspace setup error:', error)
      toast.error(error.message || 'Failed to initialize workspace')
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentComplete = async (transactionRef: string) => {
    try {
      setLoading(true)
      
      // Update payment status to 'paid' (waiting for verification)
      await userService.updatePaymentStatus({
        status: 'paid',
        transactionRef
      })
      
      await refreshUserProfile()
      setCurrentStep(6) // Move to verification after payment
      toast.success('Payment completed! Waiting for verification.')
    } catch (error: any) {
      console.error('Payment completion error:', error)
      toast.error(error.message || 'Failed to update payment status')
    } finally {
      setLoading(false)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Invoice Processor!</h2>
              <p className="text-gray-600 mb-6">Your account has been created successfully. Let's set up your organization first.</p>
            </div>

            <button
              onClick={() => setCurrentStep(2)}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Continue to Organization Setup
            </button>
          </div>
        )
      
      case 2:
        return (
          <OrganizationStep 
            onComplete={handleOrganizationComplete}
            onBack={() => setCurrentStep(1)}
          />
        )

      case 3:
        return (
          <WorkspaceStep
            onComplete={handleWorkspaceComplete}
            onBack={() => setCurrentStep(2)}
          />
        )

      case 4:
        return (
          <div className="text-center space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Plan</h2>
              <p className="text-gray-600 mb-6">Select a subscription plan to start processing invoices.</p>
            </div>

            {/* Plan Selection */}
            <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {/* Monthly Plan */}
              <div className="border-2 border-gray-200 rounded-lg p-6 hover:border-blue-500 transition-colors cursor-pointer"
                   onClick={() => handlePlanSelection(999, 'monthly')}>
                <div className="text-center">
                  <div className="flex items-center justify-center mb-4">
                    <IndianRupee className="w-8 h-8 text-blue-600" />
                    <span className="text-3xl font-bold text-gray-900">999</span>
                    <span className="text-gray-600 ml-2">/month</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Monthly Plan</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>✓ 500 invoice uploads/month</li>
                    <li>✓ AI-powered data extraction</li>
                    <li>✓ Journal entry generation</li>
                    <li>✓ CSV/PDF exports</li>
                    <li>✓ Email support</li>
                  </ul>
                </div>
              </div>

              {/* Yearly Plan */}
              <div className="border-2 border-blue-500 rounded-lg p-6 relative cursor-pointer"
                   onClick={() => handlePlanSelection(9999, 'yearly')}>
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-medium">
                    Save 17%
                  </span>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center mb-4">
                    <IndianRupee className="w-8 h-8 text-blue-600" />
                    <span className="text-3xl font-bold text-gray-900">9,999</span>
                    <span className="text-gray-600 ml-2">/year</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Yearly Plan</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>✓ Unlimited invoice uploads</li>
                    <li>✓ AI-powered data extraction</li>
                    <li>✓ Journal entry generation</li>
                    <li>✓ CSV/PDF exports</li>
                    <li>✓ Priority support</li>
                    <li>✓ API access</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              disabled={loading}
              className="px-8 py-3 bg-gray-200 text-gray-600 rounded-lg font-medium cursor-not-allowed"
            >
              Select a plan to continue
            </button>
          </div>
        )

      case 5:
        return (
          <PaymentStep
            amount={paymentAmount}
            currency="INR"
            onPaymentComplete={handlePaymentComplete}
            userEmail={user?.email || ''}
          />
        )

      case 6:
        return (
          <VerificationStep
            paymentStatus={userProfile?.paymentStatus}
            onVerified={() => {
              toast.success('Payment verified! You can now start processing invoices.')
              // Will redirect automatically due to status change
            }}
          />
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Get Started</h1>
          <p className="text-gray-600 mt-2">Complete these steps to start processing invoices</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-center mb-12">
          <div className="flex items-center space-x-8">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center space-x-3 ${
                  currentStep === step.id ? 'text-blue-600' : 
                  step.completed ? 'text-green-600' : 'text-gray-400'
                }`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    currentStep === step.id ? 'bg-blue-100' : 
                    step.completed ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    {step.completed ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : currentStep === step.id ? (
                      step.icon
                    ) : (
                      <Circle className="w-6 h-6" />
                    )}
                  </div>
                  <div className="hidden md:block">
                    <p className="font-medium text-sm">{step.title}</p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className="w-8 h-px bg-gray-300 mx-4" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          {renderStepContent()}
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-gray-900 font-medium">Processing...</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default OnboardingFlow