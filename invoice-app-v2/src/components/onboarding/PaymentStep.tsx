import { useState, useEffect } from 'react'
import { QrCode, Copy, CheckCircle, IndianRupee, AlertCircle, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { userService } from '../../services/userService'

interface PaymentStepProps {
  amount: number
  currency: string
  onPaymentComplete: (transactionRef: string) => void
  userEmail: string
}

const PaymentStep: React.FC<PaymentStepProps> = ({
  amount,
  currency,
  onPaymentComplete,
  userEmail
}) => {
  const [transactionRef, setTransactionRef] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [upiConfig, setUpiConfig] = useState<any>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)

  // Load UPI configuration on component mount
  useEffect(() => {
    const loadUPIConfig = async () => {
      try {
        const config = await userService.getUPIConfig()
        setUpiConfig(config)
      } catch (error) {
        console.error('Failed to load UPI config:', error)
        toast.error('Failed to load payment configuration')
      } finally {
        setLoadingConfig(false)
      }
    }
    
    loadUPIConfig()
  }, [])

  // Show loading state while fetching UPI config
  if (loadingConfig || !upiConfig) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-12">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading payment configuration...</p>
        </div>
      </div>
    )
  }

  // UPI payment details using dynamic configuration
  const upiDetails = {
    vpa: upiConfig.vpa,
    name: upiConfig.name,
    businessName: upiConfig.businessName,
    amount: amount,
    transactionId: `INV${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
    note: `Invoice Processing Subscription - ${userEmail}`
  }

  // Generate UPI payment link
  const generateUPILink = () => {
    const params = new URLSearchParams({
      pa: upiDetails.vpa,
      pn: upiDetails.name,
      am: upiDetails.amount.toString(),
      tr: upiDetails.transactionId,
      tn: upiDetails.note,
      cu: currency
    })
    return `upi://pay?${params.toString()}`
  }

  // Generate QR code data
  const qrCodeData = generateUPILink()

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      toast.success(`${label} copied to clipboard!`)
      setTimeout(() => setCopied(null), 2000)
    } catch (error) {
      toast.error('Failed to copy to clipboard')
    }
  }

  const handleSubmitPaymentProof = async () => {
    if (!transactionRef.trim()) {
      toast.error('Please enter your transaction reference number')
      return
    }

    setSubmitting(true)
    try {
      // Here you could upload payment proof to storage if needed
      await onPaymentComplete(transactionRef.trim())
    } catch (error) {
      console.error('Payment proof submission error:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <IndianRupee className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Complete Your Payment</h2>
        <p className="text-gray-600">
          Pay ₹{amount} to activate your subscription and start processing invoices
        </p>
      </div>

      {/* Payment Methods */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Options</h3>
        
        {/* UPI Payment */}
        <div className="bg-white rounded-lg border-2 border-blue-200 p-6">
          <div className="flex items-center space-x-3 mb-4">
            <QrCode className="w-6 h-6 text-blue-600" />
            <h4 className="text-lg font-medium text-gray-900">UPI Payment (Recommended)</h4>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* QR Code */}
            <div className="text-center">
              <h5 className="font-medium text-gray-900 mb-3">Scan QR Code</h5>
              <div className="bg-white border-2 border-gray-200 rounded-lg p-4 inline-block">
                {upiConfig.qrCodeUrl ? (
                  // Display uploaded QR code
                  <img 
                    src={upiConfig.qrCodeUrl} 
                    alt="UPI QR Code" 
                    className="w-48 h-48 object-contain"
                  />
                ) : (
                  // Fallback placeholder if no QR code uploaded
                  <div className="w-48 h-48 bg-gray-100 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <div className="text-center">
                      <QrCode className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">QR Code</p>
                      <p className="text-xs text-gray-400">₹{amount}</p>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-2">Open any UPI app and scan to pay</p>
            </div>

            {/* Payment Details */}
            <div className="space-y-4">
              <h5 className="font-medium text-gray-900">Payment Details</h5>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="text-sm text-gray-600">UPI ID:</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm">{upiDetails.vpa}</span>
                    <button
                      onClick={() => copyToClipboard(upiDetails.vpa, 'UPI ID')}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      {copied === 'UPI ID' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="text-sm text-gray-600">Amount:</span>
                  <span className="font-medium">₹{amount}</span>
                </div>

                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="text-sm text-gray-600">Transaction ID:</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm">{upiDetails.transactionId}</span>
                    <button
                      onClick={() => copyToClipboard(upiDetails.transactionId, 'Transaction ID')}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      {copied === 'Transaction ID' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Direct UPI Link */}
              <div className="pt-4">
                <a
                  href={qrCodeData}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors inline-block text-center"
                >
                  Pay with UPI App
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bank Transfer Option */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mt-4">
          <h4 className="text-lg font-medium text-gray-900 mb-3">Alternative: Bank Transfer</h4>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p><strong>Account Name:</strong> Your Business Name</p>
              <p><strong>Account Number:</strong> XXXXXXXXXX</p>
            </div>
            <div>
              <p><strong>IFSC Code:</strong> XXXXXXX</p>
              <p><strong>Bank:</strong> Your Bank Name</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Please include the Transaction ID ({upiDetails.transactionId}) in the transfer remarks
          </p>
        </div>
      </div>

      {/* Payment Confirmation */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">After Payment Confirmation</h3>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="transactionRef" className="block text-sm font-medium text-gray-700 mb-2">
              Transaction Reference Number *
            </label>
            <input
              type="text"
              id="transactionRef"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="Enter your UPI transaction ID (e.g., 1234567890)"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              You can find this in your UPI app's transaction history
            </p>
          </div>



          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Important:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Payment verification is done manually within 2-24 hours</li>
                  <li>• You'll receive email confirmation once verified</li>
                  <li>• Contact support if payment is not verified within 24 hours</li>
                </ul>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmitPaymentProof}
            disabled={submitting || !transactionRef.trim()}
            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Submitting...</span>
              </div>
            ) : (
              'Confirm Payment Made'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PaymentStep