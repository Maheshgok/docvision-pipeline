import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Clock, CheckCircle, Mail, RefreshCw, AlertTriangle } from 'lucide-react'
import { PaymentStatus } from '../../services/userService'
import toast from 'react-hot-toast'

interface VerificationStepProps {
  paymentStatus?: PaymentStatus
  onVerified: () => void
}

const VerificationStep: React.FC<VerificationStepProps> = ({
  paymentStatus,
  onVerified
}) => {
  const { refreshUserProfile } = useAuth()
  const [checking, setChecking] = useState(false)
  const [timeElapsed, setTimeElapsed] = useState(0)

  // Auto-refresh profile every 30 seconds to check for verification
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await refreshUserProfile()
      } catch (error) {
        console.error('Error refreshing profile:', error)
      }
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [refreshUserProfile])

  // Timer to show elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeElapsed(prev => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Check if payment is verified
  useEffect(() => {
    if (paymentStatus?.status === 'verified') {
      onVerified()
    }
  }, [paymentStatus?.status, onVerified])

  const handleManualRefresh = async () => {
    setChecking(true)
    try {
      await refreshUserProfile()
      if (paymentStatus?.status === 'verified') {
        toast.success('Payment verified!')
        onVerified()
      } else {
        toast('Still waiting for verification...', { icon: 'ℹ️' })
      }
    } catch (error) {
      toast.error('Failed to check verification status')
    } finally {
      setChecking(false)
    }
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const getStatusInfo = () => {
    switch (paymentStatus?.status) {
      case 'paid':
        return {
          icon: <Clock className="w-8 h-8 text-amber-600" />,
          title: 'Payment Received',
          subtitle: 'Waiting for admin verification...',
          bgColor: 'bg-amber-100',
          borderColor: 'border-amber-200',
          textColor: 'text-amber-800'
        }
      case 'verified':
        return {
          icon: <CheckCircle className="w-8 h-8 text-green-600" />,
          title: 'Payment Verified',
          subtitle: 'Your account is now active!',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200',
          textColor: 'text-green-800'
        }
      case 'expired':
        return {
          icon: <AlertTriangle className="w-8 h-8 text-red-600" />,
          title: 'Payment Expired',
          subtitle: 'Please make payment again',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-200',
          textColor: 'text-red-800'
        }
      default:
        return {
          icon: <Clock className="w-8 h-8 text-gray-600" />,
          title: 'Waiting for Payment',
          subtitle: 'Please complete your payment first',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200',
          textColor: 'text-gray-800'
        }
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <div className={`w-20 h-20 ${statusInfo.bgColor} rounded-full flex items-center justify-center mx-auto mb-4`}>
          {statusInfo.icon}
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{statusInfo.title}</h2>
        <p className="text-gray-600">{statusInfo.subtitle}</p>
      </div>

      {paymentStatus?.status === 'paid' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2 text-blue-800">
              <Clock className="w-5 h-5" />
              <span className="font-medium">Waiting for Verification</span>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm text-blue-700">
                Your payment has been received and is being verified by our admin team.
              </p>
              <p className="text-sm text-blue-600">
                Time elapsed: <span className="font-mono">{formatTime(timeElapsed)}</span>
              </p>
            </div>

            <div className="flex items-center justify-center space-x-4">
              <div className="animate-pulse flex space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animation-delay-75"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animation-delay-150"></div>
              </div>
            </div>

            <button
              onClick={handleManualRefresh}
              disabled={checking}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center space-x-2 mx-auto"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Checking...' : 'Check Status'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Payment Details */}
      {paymentStatus && (
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Amount:</p>
              <p className="font-medium">₹{paymentStatus.amount}</p>
            </div>
            <div>
              <p className="text-gray-600">Status:</p>
              <p className={`font-medium capitalize ${statusInfo.textColor}`}>
                {paymentStatus.status.replace('_', ' ')}
              </p>
            </div>
            {paymentStatus.transactionRef && (
              <div>
                <p className="text-gray-600">Transaction Reference:</p>
                <p className="font-mono text-xs">{paymentStatus.transactionRef}</p>
              </div>
            )}
            {paymentStatus.paidAt && (
              <div>
                <p className="text-gray-600">Payment Time:</p>
                <p className="text-xs">{new Date(paymentStatus.paidAt.seconds * 1000).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact Information */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <Mail className="w-5 h-5 text-gray-600 mt-1" />
          <div className="text-sm">
            <h4 className="font-medium text-gray-900 mb-2">Need Help?</h4>
            <p className="text-gray-600 mb-2">
              If your payment is not verified within 24 hours, or if you have any questions, 
              please contact our support team:
            </p>
            <div className="space-y-1 text-gray-700">
              <p><strong>Email:</strong> support@invoiceprocessor.com</p>
              <p><strong>WhatsApp:</strong> +91-XXXXXXXXXX</p>
              <p><strong>Reference:</strong> {paymentStatus?.transactionRef || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Frequently Asked Questions</h3>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-gray-900">How long does verification take?</p>
            <p className="text-gray-600">Usually 2-24 hours during business days (Monday-Friday, 9 AM - 6 PM IST)</p>
          </div>
          <div>
            <p className="font-medium text-gray-900">What if I made a mistake in my payment?</p>
            <p className="text-gray-600">Contact support immediately with your transaction details for assistance.</p>
          </div>
          <div>
            <p className="font-medium text-gray-900">Will I get a confirmation email?</p>
            <p className="text-gray-600">Yes, you'll receive an email once your payment is verified and your account is activated.</p>
          </div>
        </div>
      </div>

      {/* Auto-refresh notice */}
      <div className="text-center">
        <p className="text-xs text-gray-500">
          This page automatically checks for verification every 30 seconds
        </p>
      </div>
    </div>
  )
}

export default VerificationStep