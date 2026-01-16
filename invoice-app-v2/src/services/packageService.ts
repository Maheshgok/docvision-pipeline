import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import { PackageDefinition } from './userService'
import toast from 'react-hot-toast'

// Export the type for external use
export type { PackageDefinition }

/**
 * Service for managing package definitions in Firestore
 */
class PackageService {
  
  /**
   * Get all active package definitions
   */
  async getAllPackages(): Promise<PackageDefinition[]> {
    try {
      const packagesRef = collection(db, 'packages')
      
      // Try with ordering first, fallback if index is missing
      try {
        const q = query(packagesRef, orderBy('createdAt', 'desc'))
        const snapshot = await getDocs(q)
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PackageDefinition[]
      } catch (indexError) {
        console.warn('⚠️ Firestore index missing for packages, using simple query')
        // Fallback to simple query without ordering
        const snapshot = await getDocs(packagesRef)
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PackageDefinition[]
      }
    } catch (error) {
      console.error('❌ Error loading packages:', error)
      throw error
    }
  }

  /**
   * Get only active packages
   */
  async getActivePackages(): Promise<PackageDefinition[]> {
    try {
      const packagesRef = collection(db, 'packages')
      const q = query(
        packagesRef, 
        where('isActive', '==', true),
        orderBy('price', 'asc')
      )
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PackageDefinition[]
    } catch (error) {
      console.error('❌ Error loading active packages:', error)
      throw error
    }
  }

  /**
   * Get package by ID
   */
  async getPackageById(packageId: string): Promise<PackageDefinition | null> {
    try {
      const packageRef = doc(db, 'packages', packageId)
      const packageDoc = await getDoc(packageRef)
      
      if (!packageDoc.exists()) {
        return null
      }
      
      return {
        id: packageDoc.id,
        ...packageDoc.data()
      } as PackageDefinition
    } catch (error) {
      console.error('❌ Error loading package:', error)
      return null
    }
  }

  /**
   * Create new package definition (admin only)
   */
  async createPackage(packageData: Omit<PackageDefinition, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<string> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) {
        throw new Error('Authentication required')
      }

      // Set analysis limit for unlimited time-based packages
      const analysisLimit = packageData.isUnlimited ? 10000 : packageData.analysisLimit

      const packageRef = doc(collection(db, 'packages'))
      const newPackage: PackageDefinition = {
        ...packageData,
        id: packageRef.id,
        analysisLimit: analysisLimit,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
        createdBy: currentUser.uid
      }

      await setDoc(packageRef, newPackage)
      console.log('✅ Package created successfully:', packageRef.id)
      
      return packageRef.id
    } catch (error) {
      console.error('❌ Error creating package:', error)
      throw error
    }
  }

  /**
   * Update package definition (admin only)
   */
  async updatePackage(packageId: string, updates: Partial<Omit<PackageDefinition, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) {
        throw new Error('Authentication required')
      }

      // Handle unlimited package analysis limit
      if (updates.isUnlimited !== undefined) {
        updates.analysisLimit = updates.isUnlimited ? 10000 : (updates.analysisLimit || 100)
      }

      const packageRef = doc(db, 'packages', packageId)
      await updateDoc(packageRef, {
        ...updates,
        updatedAt: serverTimestamp()
      })

      console.log('✅ Package updated successfully:', packageId)
    } catch (error) {
      console.error('❌ Error updating package:', error)
      throw error
    }
  }

  /**
   * Delete package definition (admin only)
   */
  async deletePackage(packageId: string): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) {
        throw new Error('Authentication required')
      }

      const packageRef = doc(db, 'packages', packageId)
      await deleteDoc(packageRef)

      console.log('✅ Package deleted successfully:', packageId)
    } catch (error) {
      console.error('❌ Error deleting package:', error)
      throw error
    }
  }

  /**
   * Toggle package active status (admin only)
   */
  async togglePackageStatus(packageId: string): Promise<void> {
    try {
      const packageData = await this.getPackageById(packageId)
      if (!packageData) {
        throw new Error('Package not found')
      }

      await this.updatePackage(packageId, {
        isActive: !packageData.isActive
      })

      console.log(`✅ Package ${packageData.isActive ? 'deactivated' : 'activated'}:`, packageId)
    } catch (error) {
      console.error('❌ Error toggling package status:', error)
      throw error
    }
  }

  /**
   * Initialize default packages (for setup)
   */
  async initializeDefaultPackages(): Promise<void> {
    try {
      const existingPackages = await this.getAllPackages()
      if (existingPackages.length > 0) {
        console.log('📦 Packages already exist, skipping initialization')
        return
      }

      const defaultPackages: Omit<PackageDefinition, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>[] = [
        {
          name: 'Starter Pack',
          type: 'consumption_based',
          duration: 30,
          analysisLimit: 50,
          price: 19.99,
          currency: 'USD',
          features: ['50 Invoice Analysis', 'Basic Support', 'Cloud Storage'],
          isActive: true,
          isUnlimited: false
        },
        {
          name: 'Business Pack',
          type: 'consumption_based',
          duration: 30,
          analysisLimit: 200,
          price: 49.99,
          currency: 'USD',
          features: ['200 Invoice Analysis', 'Priority Support', 'Advanced Analytics', 'Export Features'],
          isActive: true,
          isUnlimited: false
        },
        {
          name: 'Monthly Unlimited',
          type: 'time_based',
          duration: 30,
          analysisLimit: 10000, // Will be set as unlimited
          price: 79.99,
          currency: 'USD',
          features: ['Unlimited Analysis', 'Premium Support', 'Advanced Analytics', 'API Access'],
          isActive: true,
          isUnlimited: true
        },
        {
          name: 'Hybrid Pro',
          type: 'hybrid',
          duration: 60,
          analysisLimit: 500,
          price: 99.99,
          currency: 'USD',
          features: ['500 Analysis Credits', '60 Days Access', 'Premium Support', 'Advanced Analytics', 'API Access'],
          isActive: true,
          isUnlimited: false
        },
        {
          name: 'Annual Unlimited',
          type: 'time_based',
          duration: 365,
          analysisLimit: 10000, // Will be set as unlimited
          price: 599.99,
          currency: 'USD',
          features: ['Unlimited Analysis', 'Annual Access', '24/7 Premium Support', 'Advanced Analytics', 'API Access', 'Custom Integration'],
          isActive: true,
          isUnlimited: true
        }
      ]

      console.log('📦 Initializing default packages...')
      
      for (const packageData of defaultPackages) {
        await this.createPackage(packageData)
      }

      console.log('✅ Default packages initialized successfully')
      toast.success('Default packages created successfully')
    } catch (error) {
      console.error('❌ Error initializing default packages:', error)
      toast.error('Failed to initialize default packages')
    }
  }

  /**
   * Get packages by type
   */
  async getPackagesByType(type: 'time_based' | 'consumption_based' | 'hybrid'): Promise<PackageDefinition[]> {
    try {
      const packagesRef = collection(db, 'packages')
      const q = query(
        packagesRef,
        where('type', '==', type),
        where('isActive', '==', true),
        orderBy('price', 'asc')
      )
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PackageDefinition[]
    } catch (error) {
      console.error('❌ Error loading packages by type:', error)
      throw error
    }
  }

  /**
   * Search packages by name or features
   */
  async searchPackages(searchTerm: string): Promise<PackageDefinition[]> {
    try {
      const allPackages = await this.getActivePackages()
      const searchLower = searchTerm.toLowerCase()
      
      return allPackages.filter(pkg => 
        pkg.name.toLowerCase().includes(searchLower) ||
        pkg.features.some(feature => feature.toLowerCase().includes(searchLower))
      )
    } catch (error) {
      console.error('❌ Error searching packages:', error)
      throw error
    }
  }
}

// Create and export singleton instance
export const packageService = new PackageService()
export default packageService