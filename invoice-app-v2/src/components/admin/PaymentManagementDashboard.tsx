import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { userService, UserProfile, PaymentStatus } from '../../services/userService'
import { 
  CreditCard, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  RefreshCw, 
  Eye, 
  X,
  IndianRupee,
  User,
  Mail,
  Settings
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'

interface PendingPayment extends UserProfile {
  id: string
}

const PaymentManagementDashboard: React.FC = () => {
  const { userProfile } = useAuth()
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<PendingPayment | null>(null)
  const [transactionRef, setTransactionRef] = useState('')
  const [notes, setNotes] = useState('')

  // Check if user has admin permissions
  const isAdmin = userProfile?.role === 'super_admin'

  useEffect(() => {
    if (isAdmin) {
      loadPendingPayments()
    }
  }, [isAdmin])

  const loadPendingPayments = async () => {
    try {
      setLoading(true)
      const payments = await userService.getPendingPayments()
      setPendingPayments(payments)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load pending payments')
      console.error('Error loading pending payments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyPayment = async (userUid: string) => {
    if (!transactionRef.trim()) {
      toast.error('Please enter a transaction reference')
      return
    }

    try {
      setVerifying(userUid)
      await userService.verifyUserPayment(userUid, transactionRef.trim(), notes.trim())
      toast.success('Payment verified successfully!')
      
      // Refresh the list
      await loadPendingPayments()
      
      // Close modal
      setSelectedPayment(null)
      setTransactionRef('')
      setNotes('')
    } catch (error: any) {
      toast.error(error.message || 'Failed to verify payment')
      console.error('Error verifying payment:', error)
    } finally {
      setVerifying(null)
    }
  }

  const getStatusBadge = (status: PaymentStatus['status']) => {
    const styles: Record<PaymentStatus['status'], string> = {
      pending: 'bg-gray-100 text-gray-800',
      paid: 'bg-amber-100 text-amber-800',
      verified: 'bg-green-100 text-green-800',
      expired: 'bg-red-100 text-red-800',
      free_trial: 'bg-blue-100 text-blue-800'
    }

    const icons: Record<PaymentStatus['status'], React.ReactNode> = {
      pending: <Clock className="w-3 h-3" />,
      paid: <CreditCard className="w-3 h-3" />,
      verified: <CheckCircle className="w-3 h-3" />,
      expired: <AlertTriangle className="w-3 h-3" />,
      free_trial: <Clock className="w-3 h-3" />
    }

    return (
      <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {icons[status]}
        <span className="capitalize">{status}</span>
      </span>
    )
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A'
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp)
    return date.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Payment Management</h1>
              <p className="text-gray-600 mt-2">Verify and manage user payments</p>
            </div>
            <div className="flex items-center space-x-4">
              <Link 
                to="/admin"
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
              >
                <Settings className="w-4 h-4" />
                <span>Admin Dashboard</span>
              </Link>
              <button
                onClick={loadPendingPayments}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center space-x-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading pending payments...</p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="flex items-center">
                  <Clock className="w-8 h-8 text-amber-600" />
                  <div className="ml-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {pendingPayments.filter(p => p.paymentStatus.status === 'paid').length}
                    </p>
                    <p className="text-sm text-gray-600">Awaiting Verification</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="flex items-center">
                  <CreditCard className="w-8 h-8 text-gray-600" />
                  <div className="ml-4">
                    <p className="text-2xl font-bold text-gray-900">
                      {pendingPayments.filter(p => p.paymentStatus.status === 'pending').length}
                    </p>
                    <p className="text-sm text-gray-600">Payment Pending</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="flex items-center">
                  <IndianRupee className="w-8 h-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-2xl font-bold text-gray-900">
                      ₹{pendingPayments
                        .filter(p => p.paymentStatus.status === 'paid')
                        .reduce((sum, p) => sum + p.paymentStatus.amount, 0)
                        .toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600">Pending Revenue</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="flex items-center">
                  <CheckCircle className="w-8 h-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-2xl font-bold text-gray-900">{pendingPayments.length}</p>
                    <p className="text-sm text-gray-600">Total Records</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payments Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Pending Payments</h2>
              </div>
              
              {pendingPayments.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">All caught up!</h3>
                  <p className="text-gray-600">No pending payments to verify.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Payment Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Transaction Ref
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {pendingPayments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10">
                                {payment.photoURL ? (
                                  <img className="h-10 w-10 rounded-full" src={payment.photoURL} alt="" />
                                ) : (
                                  <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                    <User className="w-5 h-5 text-gray-600" />
                                  </div>
                                )}
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {payment.displayName || 'Unknown User'}
                                </div>
                                <div className="text-sm text-gray-500 flex items-center">
                                  <Mail className="w-3 h-3 mr-1" />
                                  {payment.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              ₹{payment.paymentStatus.amount.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-500 capitalize">
                              {payment.paymentStatus.subscriptionType}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(payment.paymentStatus.status)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(payment.paymentStatus.paidAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-mono text-gray-900">
                              {payment.paymentStatus.transactionRef || 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => setSelectedPayment(payment)}
                                className="text-blue-600 hover:text-blue-900 flex items-center space-x-1"
                              >
                                <Eye className="w-4 h-4" />
                                <span>View</span>
                              </button>
                              {payment.paymentStatus.status === 'paid' && (
                                <button
                                  onClick={() => {
                                    setSelectedPayment(payment)
                                    setTransactionRef(payment.paymentStatus.transactionRef || '')
                                  }}
                                  disabled={verifying === payment.id}
                                  className="text-green-600 hover:text-green-900 flex items-center space-x-1 disabled:opacity-50"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  <span>{verifying === payment.id ? 'Verifying...' : 'Verify'}</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Verification Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Payment Verification</h3>
              <button
                onClick={() => {
                  setSelectedPayment(null)
                  setTransactionRef('')
                  setNotes('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* User Details */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center mb-4">
                {selectedPayment.photoURL ? (
                  <img className="h-12 w-12 rounded-full" src={selectedPayment.photoURL} alt="" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-gray-300 flex items-center justify-center">
                    <User className="w-6 h-6 text-gray-600" />
                  </div>
                )}
                <div className="ml-4">
                  <h4 className="text-lg font-medium text-gray-900">
                    {selectedPayment.displayName || 'Unknown User'}
                  </h4>
                  <p className="text-gray-600">{selectedPayment.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Amount:</p>
                  <p className="font-medium">₹{selectedPayment.paymentStatus.amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-600">Plan:</p>
                  <p className="font-medium capitalize">{selectedPayment.paymentStatus.subscriptionType}</p>
                </div>
                <div>
                  <p className="text-gray-600">Status:</p>
                  <div>{getStatusBadge(selectedPayment.paymentStatus.status)}</div>
                </div>
                <div>
                  <p className="text-gray-600">Payment Date:</p>
                  <p className="text-xs">{formatDate(selectedPayment.paymentStatus.paidAt)}</p>
                </div>
              </div>
            </div>

            {/* Verification Form */}
            {selectedPayment.paymentStatus.status === 'paid' && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="verifyTransactionRef" className="block text-sm font-medium text-gray-700 mb-2">
                    Transaction Reference
                  </label>
                  <input
                    type="text"
                    id="verifyTransactionRef"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="Enter verified transaction reference"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="verifyNotes" className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    id="verifyNotes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any verification notes..."
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center space-x-4 pt-4">
                  <button
                    onClick={() => handleVerifyPayment(selectedPayment.id)}
                    disabled={verifying === selectedPayment.id || !transactionRef.trim()}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  >
                    {verifying === selectedPayment.id ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Verify Payment</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedPayment(null)
                      setTransactionRef('')
                      setNotes('')
                    }}
                    className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PaymentManagementDashboard