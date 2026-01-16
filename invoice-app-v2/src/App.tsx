import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { PermissionProvider } from './contexts/PermissionContext'
import LandingPage from './pages/LandingPage'
import MultiUploadDashboard from './pages/MultiUploadDashboard'
import ModernInvoiceProcessingDashboard from './pages/ModernInvoiceProcessingDashboard'
import Login from './pages/Login'
import WorkspaceSetup from './pages/WorkspaceSetup'
import PaymentRenewal from './pages/PaymentRenewal'
import OnboardingFlow from './components/onboarding/OnboardingFlow'
import PaymentManagementDashboard from './components/admin/PaymentManagementDashboard'
import { AdminDashboard } from './components/admin/AdminDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import AuthProtectedRoute from './components/auth/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <PermissionProvider>
        <Router>
          <div className="min-h-screen bg-gray-50">
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              {/* Legacy auth route redirect */}
              <Route path="/auth/signin" element={<Navigate to="/login" replace />} />
              {/* Legacy payment route redirect */}
              <Route path="/payment/setup" element={<Navigate to="/payment/renewal" replace />} />
              
              {/* Protected routes */}
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <MultiUploadDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/modern" 
                element={
                  <ProtectedRoute>
                    <ModernInvoiceProcessingDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/workspace-setup" 
                element={
                  <AuthProtectedRoute requirePayment={false}>
                    <WorkspaceSetup />
                  </AuthProtectedRoute>
                } 
              />
              <Route 
                path="/payment/renewal" 
                element={
                  <AuthProtectedRoute requirePayment={false}>
                    <PaymentRenewal />
                  </AuthProtectedRoute>
                } 
              />
              <Route 
                path="/admin" 
                element={
                  <AuthProtectedRoute requirePayment={false}>
                    <AdminDashboard />
                  </AuthProtectedRoute>
                } 
              />
              <Route 
                path="/onboarding" 
                element={
                  <AuthProtectedRoute requirePayment={false}>
                    <OnboardingFlow />
                  </AuthProtectedRoute>
                } 
              />
              <Route 
                path="/admin/payments" 
                element={
                  <AuthProtectedRoute 
                    requirePayment={false}
                    requiredPermission={{ action: 'manage', subject: 'payments' }}
                  >
                    <PaymentManagementDashboard />
                  </AuthProtectedRoute>
                } 
              />
              {/* Catch all route - redirect to landing page */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
                borderRadius: '10px',
                padding: '16px',
              },
              success: {
                style: {
                  background: '#10B981',
                },
              },
              error: {
                style: {
                  background: '#EF4444',
                },
              },
            }}
          />
        </div>
      </Router>
    </PermissionProvider>
  </AuthProvider>
  )
}

export default App
