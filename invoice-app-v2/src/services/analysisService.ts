import { userService } from './userService'
import { sessionSecurityService } from './sessionSecurityService'
import toast from 'react-hot-toast'

/**
 * Service to handle invoice analysis operations with consumption tracking
 */
class AnalysisService {
  /**
   * Check if user can perform analysis based on their package and security restrictions
   */
  async canPerformAnalysis(userUid?: string): Promise<boolean> {
    try {
      // First check session security
      if (!sessionSecurityService.canPerformSecureOperations()) {
        return false
      }

      // Then check user package limits
      return await userService.canPerformAnalysis(userUid)
    } catch (error) {
      console.error('❌ Error checking analysis permission:', error)
      return false
    }
  }

  /**
   * Process invoice analysis with consumption tracking and security validation
   */
  async processInvoiceAnalysis(file: File, userUid?: string): Promise<any> {
    try {
      // Security check - validate session and tab restrictions
      if (!sessionSecurityService.canPerformSecureOperations()) {
        toast.error('Analysis functionality is restricted. Please ensure you are on the active tab.')
        throw new Error('Security restriction: Analysis blocked')
      }

      // Validate session
      const isValidSession = await sessionSecurityService.validateSession()
      if (!isValidSession) {
        toast.error('Your session has expired or is invalid. Please login again.')
        throw new Error('Invalid session')
      }

      // Check if user can perform analysis
      const canAnalyze = await this.canPerformAnalysis(userUid)
      if (!canAnalyze) {
        const usageStats = await userService.getUserUsageStats(userUid)
        
        if (usageStats?.subscriptionStatus === 'expired') {
          toast.error('Your subscription has expired. Please renew to continue.')
          throw new Error('Subscription expired')
        } else if (usageStats?.remainingCredits === 0) {
          toast.error('You have reached your analysis limit. Please upgrade your package.')
          throw new Error('Analysis limit reached')
        } else {
          toast.error('Analysis not allowed. Please check your subscription status.')
          throw new Error('Analysis not allowed')
        }
      }

      // Increment analysis count (this also validates consumption limits)
      const analysisAllowed = await userService.recordAnalysisCompletion(userUid)
      if (!analysisAllowed) {
        toast.error('Analysis limit reached. Please upgrade your package.')
        throw new Error('Analysis limit reached')
      }

      // TODO: Integrate with your existing analysis API
      // For now, return mock data
      console.log('🔍 Processing invoice analysis for file:', file.name)
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Mock successful analysis result matching InvoiceData interface
      const analysisResult = {
        invoiceNumber: `INV-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        totalAmount: Math.random() * 1000 + 100,
        taxAmount: Math.random() * 100 + 10,
        currency: 'USD',
        vendorName: 'Sample Vendor Corp',
        vendorEmail: 'billing@samplevendor.com',
        vendorAddress: '123 Business Street, City, State 12345',
        confidence: 0.95,
        processedAt: new Date()
      }

      // Update user stats after successful analysis
      const updatedStats = await userService.getUserUsageStats(userUid)
      if (updatedStats) {
        console.log('📊 Updated usage stats:', updatedStats)
        
        // Show usage notification
        if (updatedStats.packageType === 'consumption_based' || updatedStats.packageType === 'hybrid') {
          const remainingCredits = updatedStats.remainingCredits
          if (remainingCredits <= 5 && remainingCredits > 0) {
            toast(`⚠️ Only ${remainingCredits} analysis credits remaining!`, {
              icon: '⚠️',
              duration: 5000,
              style: {
                background: '#FEF3C7',
                color: '#92400E',
                border: '1px solid #F59E0B'
              }
            })
          } else if (remainingCredits === 0) {
            toast.error('You have used all your analysis credits!')
          }
        }
      }

      return analysisResult

    } catch (error) {
      console.error('❌ Error processing invoice analysis:', error)
      
      // If security check failed, don't increment usage
      if (error instanceof Error && error.message.includes('Security restriction')) {
        throw error
      }
      
      throw error
    }
  }

  /**
   * Get user's current usage statistics
   */
  async getUserUsageStats(userUid?: string) {
    try {
      return await userService.getUserUsageStats(userUid)
    } catch (error) {
      console.error('❌ Error getting usage stats:', error)
      return null
    }
  }

  /**
   * Check if user needs to renew subscription or upgrade package
   */
  async checkSubscriptionStatus(userUid?: string): Promise<{
    needsAttention: boolean
    message: string
    type: 'warning' | 'error' | 'info'
  }> {
    try {
      const usageStats = await this.getUserUsageStats(userUid)
      if (!usageStats) {
        return {
          needsAttention: true,
          message: 'Unable to check subscription status',
          type: 'error'
        }
      }

      // Check subscription expiry
      if (usageStats.subscriptionStatus === 'expired') {
        return {
          needsAttention: true,
          message: 'Your subscription has expired. Please renew to continue.',
          type: 'error'
        }
      }

      // Check time-based expiry warning (15 days)
      if (usageStats.daysRemaining && usageStats.daysRemaining <= 15) {
        return {
          needsAttention: true,
          message: `Your subscription expires in ${usageStats.daysRemaining} days.`,
          type: 'warning'
        }
      }

      // Check consumption-based credits
      if ((usageStats.packageType === 'consumption_based' || usageStats.packageType === 'hybrid') && 
          usageStats.analysisLimit > 0) {
        const remainingCredits = usageStats.remainingCredits
        
        if (remainingCredits === 0) {
          return {
            needsAttention: true,
            message: 'You have used all your analysis credits. Please upgrade your package.',
            type: 'error'
          }
        } else if (remainingCredits <= 10) {
          return {
            needsAttention: true,
            message: `Only ${remainingCredits} analysis credits remaining.`,
            type: 'warning'
          }
        }
      }

      return {
        needsAttention: false,
        message: 'Your subscription is active',
        type: 'info'
      }

    } catch (error) {
      console.error('❌ Error checking subscription status:', error)
      return {
        needsAttention: true,
        message: 'Error checking subscription status',
        type: 'error'
      }
    }
  }
}

// Create and export singleton instance
export const analysisService = new AnalysisService()
export default analysisService