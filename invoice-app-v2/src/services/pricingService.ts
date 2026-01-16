/**
 * Configurable Pricing Management Service
 * Allows super admin to configure pricing plans and features
 */

import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'

export interface PricingPlan {
  id: string
  name: string
  displayName: string
  description: string
  price: number
  currency: string
  duration: 'monthly' | 'yearly' | 'lifetime'
  features: PlanFeature[]
  limits: PlanLimits
  isActive: boolean
  isPopular?: boolean
  discountPercentage?: number
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string // Super admin UID
}

export interface PlanFeature {
  id: string
  name: string
  description: string
  included: boolean
  limit?: number // For numeric features
}

export interface PlanLimits {
  maxUploadsPerMonth: number
  maxFileSize: number // in MB
  maxUsers: number
  maxStorageGB: number
  apiCallsPerMonth: number
  prioritySupport: boolean
  customBranding: boolean
}

export interface PricingConfig {
  id: 'pricing_config'
  plans: PricingPlan[]
  defaultTrialPlan: string // Plan ID for trial users
  approvalRequired: boolean
  paymentMethods: string[]
  supportEmail: string
  termsOfServiceUrl?: string
  privacyPolicyUrl?: string
  lastUpdatedBy: string
  lastUpdatedAt: Timestamp
}

// Default pricing configuration
const DEFAULT_PRICING_CONFIG: Omit<PricingConfig, 'lastUpdatedBy' | 'lastUpdatedAt'> = {
  id: 'pricing_config',
  approvalRequired: true, // Manual approval required
  paymentMethods: ['upi', 'card', 'bank_transfer'],
  supportEmail: 'support@invoiceprocessor.com',
  defaultTrialPlan: 'trial',
  plans: [
    {
      id: 'trial',
      name: 'trial',
      displayName: 'Free Trial',
      description: '7-day free trial with basic features',
      price: 0,
      currency: 'INR',
      duration: 'monthly',
      features: [
        { id: 'uploads', name: 'Invoice Uploads', description: 'Process invoice files', included: true, limit: 10 },
        { id: 'ai_extraction', name: 'AI Data Extraction', description: 'Automated data extraction', included: true },
        { id: 'csv_export', name: 'CSV Export', description: 'Export to CSV format', included: true },
        { id: 'support', name: 'Email Support', description: 'Basic email support', included: false }
      ],
      limits: {
        maxUploadsPerMonth: 10,
        maxFileSize: 5,
        maxUsers: 1,
        maxStorageGB: 1,
        apiCallsPerMonth: 100,
        prioritySupport: false,
        customBranding: false
      },
      isActive: true,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      createdBy: 'system'
    },
    {
      id: 'monthly',
      name: 'monthly',
      displayName: 'Monthly Plan',
      description: 'Perfect for small businesses',
      price: 999,
      currency: 'INR',
      duration: 'monthly',
      features: [
        { id: 'uploads', name: 'Invoice Uploads', description: 'Process invoice files', included: true, limit: 500 },
        { id: 'ai_extraction', name: 'AI Data Extraction', description: 'Automated data extraction', included: true },
        { id: 'journal_entries', name: 'Journal Entry Generation', description: 'Automated accounting entries', included: true },
        { id: 'csv_export', name: 'CSV/PDF Export', description: 'Export in multiple formats', included: true },
        { id: 'support', name: 'Email Support', description: 'Priority email support', included: true }
      ],
      limits: {
        maxUploadsPerMonth: 500,
        maxFileSize: 10,
        maxUsers: 5,
        maxStorageGB: 10,
        apiCallsPerMonth: 1000,
        prioritySupport: true,
        customBranding: false
      },
      isActive: true,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      createdBy: 'system'
    },
    {
      id: 'yearly',
      name: 'yearly',
      displayName: 'Yearly Plan',
      description: 'Best value for growing businesses',
      price: 9999,
      currency: 'INR',
      duration: 'yearly',
      features: [
        { id: 'uploads', name: 'Invoice Uploads', description: 'Unlimited invoice processing', included: true },
        { id: 'ai_extraction', name: 'AI Data Extraction', description: 'Advanced AI processing', included: true },
        { id: 'journal_entries', name: 'Journal Entry Generation', description: 'Automated accounting entries', included: true },
        { id: 'csv_export', name: 'CSV/PDF Export', description: 'Export in multiple formats', included: true },
        { id: 'api_access', name: 'API Access', description: 'Full API integration', included: true },
        { id: 'support', name: 'Priority Support', description: '24/7 priority support', included: true }
      ],
      limits: {
        maxUploadsPerMonth: -1, // Unlimited
        maxFileSize: 50,
        maxUsers: 20,
        maxStorageGB: 100,
        apiCallsPerMonth: 10000,
        prioritySupport: true,
        customBranding: true
      },
      isActive: true,
      isPopular: true,
      discountPercentage: 17,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      createdBy: 'system'
    }
  ]
}

class PricingService {
  private readonly PRICING_CONFIG_DOC = 'pricing_config'

  /**
   * Calculate pricing for a plan and billing cycle
   */
  async calculatePricing(planId: string, billingCycle: 'monthly' | 'annual'): Promise<{
    basePrice: number
    finalPrice: number
    discount: number
    discountType?: string
  }> {
    const config = await this.getPricingConfig()
    const plan = config.plans.find(p => p.id === planId)
    
    if (!plan) {
      throw new Error(`Plan ${planId} not found`)
    }

    const basePrice = billingCycle === 'annual' ? plan.yearlyPrice || (plan.monthlyPrice * 12) : plan.monthlyPrice
    let discount = 0
    let discountType = ''

    if (billingCycle === 'annual' && config.discounts?.annual) {
      discount = (basePrice * config.discounts.annual) / 100
      discountType = 'Annual'
    }

    return {
      basePrice,
      finalPrice: basePrice - discount,
      discount,
      discountType
    }
  }

  /**
   * Update pricing configuration (returns result)
   */
  async updatePricingConfig(updates: Partial<PricingConfig>): Promise<{ success: boolean, error?: string }> {
    try {
      await this.setPricingConfig(updates)
      return { success: true }
    } catch (error) {
      console.error('❌ Failed to update pricing config:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get current pricing configuration
   */
  async getPricingConfig(): Promise<PricingConfig> {
    try {
      const docRef = doc(db, 'system_config', this.PRICING_CONFIG_DOC)
      const docSnapshot = await getDoc(docRef)

      if (docSnapshot.exists()) {
        return docSnapshot.data() as PricingConfig
      } else {
        // Create default config if none exists
        console.log('🆕 Creating default pricing configuration')
        return await this.createDefaultPricingConfig()
      }
    } catch (error) {
      console.error('❌ Error getting pricing config:', error)
      throw error
    }
  }

  /**
   * Update pricing configuration (Super admin only) - with validation
   */
  async updatePricingConfigSecure(config: Partial<PricingConfig>): Promise<void> {
    try {
      const user = authService.getCurrentUser()
      if (!user) {
        throw new Error('Authentication required')
      }

      // TODO: Add super admin validation here
      // const userProfile = await userService.getUserProfile()
      // if (userProfile.role !== 'super_admin') {
      //   throw new Error('Super admin access required')
      // }

      const docRef = doc(db, 'system_config', this.PRICING_CONFIG_DOC)
      const updateData = {
        ...config,
        lastUpdatedBy: user.uid,
        lastUpdatedAt: serverTimestamp()
      }

      await setDoc(docRef, updateData, { merge: true })
      console.log('✅ Pricing configuration updated')
    } catch (error) {
      console.error('❌ Error updating pricing config:', error)
      throw error
    }
  }

  /**
   * Get specific plan by ID
   */
  async getPlan(planId: string): Promise<PricingPlan | null> {
    try {
      const config = await this.getPricingConfig()
      return config.plans.find(plan => plan.id === planId) || null
    } catch (error) {
      console.error('❌ Error getting plan:', error)
      return null
    }
  }

  /**
   * Get active plans only
   */
  async getActivePlans(): Promise<PricingPlan[]> {
    try {
      const config = await this.getPricingConfig()
      return config.plans.filter(plan => plan.isActive)
    } catch (error) {
      console.error('❌ Error getting active plans:', error)
      return []
    }
  }

  /**
   * Create default pricing configuration
   */
  private async createDefaultPricingConfig(): Promise<PricingConfig> {
    try {
      const user = authService.getCurrentUser()
      const defaultConfig: PricingConfig = {
        ...DEFAULT_PRICING_CONFIG,
        lastUpdatedBy: user?.uid || 'system',
        lastUpdatedAt: serverTimestamp() as Timestamp
      }

      const docRef = doc(db, 'system_config', this.PRICING_CONFIG_DOC)
      await setDoc(docRef, defaultConfig)

      console.log('✅ Default pricing configuration created')
      return defaultConfig
    } catch (error) {
      console.error('❌ Error creating default pricing config:', error)
      throw error
    }
  }

  /**
   * Check if manual approval is required
   */
  async isApprovalRequired(): Promise<boolean> {
    try {
      const config = await this.getPricingConfig()
      return config.approvalRequired
    } catch (error) {
      console.error('❌ Error checking approval requirement:', error)
      return true // Default to requiring approval
    }
  }

  /**
   * Calculate discounted price
   */
  calculateDiscountedPrice(plan: PricingPlan): number {
    if (plan.discountPercentage && plan.discountPercentage > 0) {
      return Math.round(plan.price * (1 - plan.discountPercentage / 100))
    }
    return plan.price
  }

  /**
   * Format price for display
   */
  formatPrice(amount: number, currency: string = 'INR'): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0
    }).format(amount)
  }
}

// Export singleton instance
export const pricingService = new PricingService()
export default pricingService