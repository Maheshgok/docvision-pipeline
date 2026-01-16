import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  Timestamp 
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'

export interface UserOrganization {
  id?: string
  name: string
  gstin: string
  business_type: string
  industry: string
  address: string
  contact_person: string
  phone: string
  email: string
  created_at: Timestamp
  updated_at: Timestamp
  user_uid: string
}

export interface ClientOrganization {
  id?: string
  client_name: string
  client_gstin: string
  business_type: string
  industry: string
  business_description: string
  capitalization_threshold: number
  common_hsn_codes: string[]
  expense_categories: string[]
  client_address: string
  client_contact_person: string
  client_phone: string
  client_email: string
  is_active: boolean
  created_at: Timestamp
  updated_at: Timestamp
  user_uid: string
}

// User organization interface (for the user's own company, not clients)
export interface UserOrganizationProfile {
  id?: string
  name: string
  gstin: string
  business_type: string
  industry: string
  business_description: string
  capitalization_threshold: number
  common_hsn_codes: string[]
  expense_categories: string[]
  address: string
  contact_person: string
  phone: string
  email: string
  is_default: boolean
  is_active: boolean
  created_at: Timestamp
  updated_at: Timestamp
  user_uid: string
}

// Legacy interface for backward compatibility with client organizations
export interface OrganizationProfile extends ClientOrganization {
  name: string
  gstin: string
  address: string
  contact_person: string
  phone: string
  email: string
  is_default: boolean
}

export interface BusinessType {
  value: string
  label: string
  description: string
  gst_section: string
  chapter_number: number
  common_hsn_codes: string[]
  expense_categories: string[]
  capitalization_threshold: number
}

// GST-based comprehensive business types taxonomy
export const BUSINESS_TYPES: BusinessType[] = [
  // Section I: Animals and Animal Products (Chapters 1-5)
  {
    value: 'livestock_animals',
    label: 'Livestock and Animals',
    description: 'Live animals, livestock farming, animal breeding',
    gst_section: 'Section I: Animals and Animal Products',
    chapter_number: 1,
    common_hsn_codes: ['01011000', '01021000', '01041000'],
    expense_categories: ['Animal Feed', 'Veterinary Expenses', 'Farm Equipment', 'Labor Costs'],
    capitalization_threshold: 100000
  },
  {
    value: 'meat_processing',
    label: 'Meat and Edible Offal',
    description: 'Meat processing, slaughterhouse operations, meat products',
    gst_section: 'Section I: Animals and Animal Products',
    chapter_number: 2,
    common_hsn_codes: ['02011000', '02023000', '02071100'],
    expense_categories: ['Raw Materials', 'Processing Equipment', 'Cold Storage', 'Packaging'],
    capitalization_threshold: 150000
  },
  {
    value: 'seafood_aquaculture',
    label: 'Fish and Seafood',
    description: 'Fishing, aquaculture, seafood processing',
    gst_section: 'Section I: Animals and Animal Products',
    chapter_number: 3,
    common_hsn_codes: ['03011000', '03023100', '03074900'],
    expense_categories: ['Fishing Equipment', 'Boat Maintenance', 'Ice & Preservation', 'Processing Costs'],
    capitalization_threshold: 80000
  },
  {
    value: 'dairy_products',
    label: 'Dairy Products',
    description: 'Dairy farming, milk processing, cheese, butter production',
    gst_section: 'Section I: Animals and Animal Products',
    chapter_number: 4,
    common_hsn_codes: ['04011000', '04021000', '04081100'],
    expense_categories: ['Dairy Equipment', 'Animal Feed', 'Pasteurization', 'Cold Chain'],
    capitalization_threshold: 120000
  },

  // Section II: Vegetables and Vegetable Products (Chapters 6-14)
  {
    value: 'agriculture_horticulture',
    label: 'Agriculture and Horticulture',
    description: 'Crop farming, vegetable cultivation, fruit growing',
    gst_section: 'Section II: Vegetables and Vegetable Products',
    chapter_number: 7,
    common_hsn_codes: ['07010000', '07020000', '07031000'],
    expense_categories: ['Seeds & Fertilizers', 'Farm Equipment', 'Irrigation', 'Harvesting'],
    capitalization_threshold: 75000
  },
  {
    value: 'spices_tea_coffee',
    label: 'Tea, Coffee, Spices',
    description: 'Tea/coffee cultivation, spice processing, beverage production',
    gst_section: 'Section II: Vegetables and Vegetable Products',
    chapter_number: 9,
    common_hsn_codes: ['09021000', '09041100', '09101100'],
    expense_categories: ['Processing Equipment', 'Quality Control', 'Storage', 'Packaging'],
    capitalization_threshold: 60000
  },
  {
    value: 'cereals_grains',
    label: 'Cereals and Grains',
    description: 'Grain farming, milling, cereal processing',
    gst_section: 'Section II: Vegetables and Vegetable Products',
    chapter_number: 10,
    common_hsn_codes: ['10011000', '10059000', '10064000'],
    expense_categories: ['Farm Operations', 'Milling Equipment', 'Storage Facilities', 'Transportation'],
    capitalization_threshold: 100000
  },

  // Section IV: Prepared Food, Beverages, Spirits (Chapters 16-24)
  {
    value: 'food_processing',
    label: 'Food Processing and Manufacturing',
    description: 'Food processing, packaged foods, food manufacturing',
    gst_section: 'Section IV: Prepared Food, Beverages, Spirits',
    chapter_number: 19,
    common_hsn_codes: ['19011000', '19023000', '19053100'],
    expense_categories: ['Raw Materials', 'Processing Equipment', 'Quality Control', 'Packaging'],
    capitalization_threshold: 150000
  },
  {
    value: 'restaurant_food',
    label: 'Restaurant and Food Services',
    description: 'Restaurants, catering, food service establishments',
    gst_section: 'Section IV: Prepared Food, Beverages, Spirits',
    chapter_number: 21,
    common_hsn_codes: ['21069030', '84186990', '39269099'],
    expense_categories: ['Food & Beverages', 'Kitchen Equipment', 'Restaurant Supplies', 'Staff Wages'],
    capitalization_threshold: 75000
  },
  {
    value: 'beverages_alcohol',
    label: 'Beverages and Spirits',
    description: 'Beverage production, breweries, distilleries',
    gst_section: 'Section IV: Prepared Food, Beverages, Spirits',
    chapter_number: 22,
    common_hsn_codes: ['22011000', '22030000', '22084000'],
    expense_categories: ['Raw Materials', 'Brewing Equipment', 'Bottling', 'Licensing'],
    capitalization_threshold: 200000
  },

  // Section V: Minerals (Chapters 25-27)
  {
    value: 'mining_extraction',
    label: 'Mining and Mineral Extraction',
    description: 'Mining operations, mineral extraction, quarrying',
    gst_section: 'Section V: Minerals',
    chapter_number: 26,
    common_hsn_codes: ['26011100', '26030000', '27011200'],
    expense_categories: ['Mining Equipment', 'Safety Equipment', 'Blasting Materials', 'Transportation'],
    capitalization_threshold: 500000
  },
  {
    value: 'petroleum_fuels',
    label: 'Petroleum and Fuel Products',
    description: 'Oil refining, fuel distribution, petroleum products',
    gst_section: 'Section V: Minerals',
    chapter_number: 27,
    common_hsn_codes: ['27011100', '27101221', '27109000'],
    expense_categories: ['Refining Equipment', 'Transportation', 'Storage Tanks', 'Safety Systems'],
    capitalization_threshold: 1000000
  },

  // Section VI: Chemical Products (Chapters 28-38)
  {
    value: 'pharmaceuticals',
    label: 'Pharmaceuticals and Healthcare',
    description: 'Pharmaceutical manufacturing, healthcare products, medical devices',
    gst_section: 'Section VI: Chemical Products',
    chapter_number: 30,
    common_hsn_codes: ['30021000', '30041000', '90189099'],
    expense_categories: ['R&D Expenses', 'Manufacturing Equipment', 'Quality Control', 'Regulatory Compliance'],
    capitalization_threshold: 300000
  },
  {
    value: 'chemicals_manufacturing',
    label: 'Chemical Manufacturing',
    description: 'Chemical production, industrial chemicals, specialty chemicals',
    gst_section: 'Section VI: Chemical Products',
    chapter_number: 29,
    common_hsn_codes: ['29011000', '38220090', '28092000'],
    expense_categories: ['Raw Chemicals', 'Processing Equipment', 'Safety Systems', 'Waste Treatment'],
    capitalization_threshold: 400000
  },
  {
    value: 'cosmetics_personal_care',
    label: 'Cosmetics and Personal Care',
    description: 'Cosmetic manufacturing, personal care products, beauty services',
    gst_section: 'Section VI: Chemical Products',
    chapter_number: 33,
    common_hsn_codes: ['33041000', '33071000', '34011100'],
    expense_categories: ['Raw Materials', 'Packaging', 'Marketing', 'R&D'],
    capitalization_threshold: 100000
  },

  // Section VII: Plastics and Rubber (Chapters 39-40)
  {
    value: 'plastics_manufacturing',
    label: 'Plastics Manufacturing',
    description: 'Plastic products, polymer processing, injection molding',
    gst_section: 'Section VII: Plastics and Rubber',
    chapter_number: 39,
    common_hsn_codes: ['39011000', '39023000', '39269099'],
    expense_categories: ['Plastic Resins', 'Molding Equipment', 'Quality Control', 'Energy Costs'],
    capitalization_threshold: 200000
  },
  {
    value: 'rubber_products',
    label: 'Rubber Products',
    description: 'Rubber manufacturing, tire production, rubber goods',
    gst_section: 'Section VII: Plastics and Rubber',
    chapter_number: 40,
    common_hsn_codes: ['40011000', '40094100', '40169300'],
    expense_categories: ['Rubber Materials', 'Vulcanization', 'Molding Equipment', 'Quality Testing'],
    capitalization_threshold: 180000
  },

  // Section XI: Textiles (Chapters 50-63)
  {
    value: 'textiles_garments',
    label: 'Textiles and Garments',
    description: 'Textile manufacturing, garment production, fabric processing',
    gst_section: 'Section XI: Textile and Textile Articles',
    chapter_number: 61,
    common_hsn_codes: ['61091000', '52084200', '54076100'],
    expense_categories: ['Raw Materials', 'Dyeing & Finishing', 'Tailoring Equipment', 'Labor Costs'],
    capitalization_threshold: 80000
  },

  // Section XV: Base Metals (Chapters 72-83)
  {
    value: 'metal_fabrication',
    label: 'Metal Fabrication and Engineering',
    description: 'Metal working, fabrication, engineering services',
    gst_section: 'Section XV: Base Metal and Articles',
    chapter_number: 73,
    common_hsn_codes: ['73021000', '82041100', '84799090'],
    expense_categories: ['Steel & Metal', 'Welding Equipment', 'Machining', 'Safety Equipment'],
    capitalization_threshold: 150000
  },

  // Section XVI: Machinery and Electrical Equipment (Chapters 84-85)
  {
    value: 'software_it',
    label: 'Software and IT Services',
    description: 'Software development, IT consulting, digital services',
    gst_section: 'Section XVI: Machinery and Electrical Equipment',
    chapter_number: 85,
    common_hsn_codes: ['998313', '84713000', '85176290'],
    expense_categories: ['Technology Infrastructure', 'Software Licenses', 'Professional Services', 'Internet & Communications'],
    capitalization_threshold: 50000
  },
  {
    value: 'electronics_manufacturing',
    label: 'Electronics Manufacturing',
    description: 'Electronic component manufacturing, consumer electronics, industrial electronics',
    gst_section: 'Section XVI: Machinery and Electrical Equipment',
    chapter_number: 85,
    common_hsn_codes: ['85176200', '85414000', '84713000'],
    expense_categories: ['Electronic Components', 'Assembly Equipment', 'Testing Equipment', 'R&D'],
    capitalization_threshold: 250000
  },

  // Section XVII: Vehicles and Transport (Chapters 86-89)
  {
    value: 'automotive_manufacturing',
    label: 'Automotive Manufacturing',
    description: 'Vehicle manufacturing, auto parts, automotive services',
    gst_section: 'Section XVII: Vehicles and Transport Equipment',
    chapter_number: 87,
    common_hsn_codes: ['87032300', '87089900', '40169300'],
    expense_categories: ['Auto Parts', 'Manufacturing Equipment', 'Quality Control', 'Assembly Line'],
    capitalization_threshold: 500000
  },
  {
    value: 'transportation_logistics',
    label: 'Transportation and Logistics',
    description: 'Transport services, logistics, freight forwarding',
    gst_section: 'Section XVII: Vehicles and Transport Equipment',
    chapter_number: 87,
    common_hsn_codes: ['996511', '996512', '996513'],
    expense_categories: ['Vehicle Maintenance', 'Fuel Costs', 'Driver Wages', 'Insurance'],
    capitalization_threshold: 200000
  },

  // Section XVIII: Precision Instruments (Chapters 90-92)
  {
    value: 'medical_devices',
    label: 'Medical Devices and Instruments',
    description: 'Medical equipment manufacturing, diagnostic instruments, surgical devices',
    gst_section: 'Section XVIII: Precision Instruments',
    chapter_number: 90,
    common_hsn_codes: ['90181900', '90183900', '90189099'],
    expense_categories: ['Medical Equipment', 'R&D', 'Regulatory Compliance', 'Quality Assurance'],
    capitalization_threshold: 300000
  },

  // Section XX: Miscellaneous Manufactured Articles (Chapters 94-96)
  {
    value: 'furniture_fixtures',
    label: 'Furniture and Fixtures',
    description: 'Furniture manufacturing, interior design, home furnishings',
    gst_section: 'Section XX: Miscellaneous Manufactured Articles',
    chapter_number: 94,
    common_hsn_codes: ['94013000', '94036000', '94054000'],
    expense_categories: ['Wood & Materials', 'Manufacturing Equipment', 'Design Services', 'Finishing Materials'],
    capitalization_threshold: 75000
  },

  // Professional Services (Chapter 99: Services)
  {
    value: 'professional_services',
    label: 'Professional Services',
    description: 'CA, legal, consulting, advisory services, management consulting',
    gst_section: 'Section XXI: Services',
    chapter_number: 99,
    common_hsn_codes: ['998721', '998313', '998361'],
    expense_categories: ['Professional Development', 'Office Expenses', 'Client Entertainment', 'Reference Materials'],
    capitalization_threshold: 30000
  },
  {
    value: 'financial_services',
    label: 'Financial Services',
    description: 'Banking, insurance, investment services, financial consulting',
    gst_section: 'Section XXI: Services',
    chapter_number: 99,
    common_hsn_codes: ['997159', '997132', '997211'],
    expense_categories: ['Technology Systems', 'Compliance & Audit', 'Office Administration', 'Professional Training'],
    capitalization_threshold: 100000
  },
  {
    value: 'construction_real_estate',
    label: 'Construction and Real Estate',
    description: 'Construction services, real estate development, architectural services',
    gst_section: 'Section XXI: Services',
    chapter_number: 99,
    common_hsn_codes: ['997212', '998313', '25232900'],
    expense_categories: ['Construction Materials', 'Equipment Rental', 'Labor Costs', 'Legal & Documentation'],
    capitalization_threshold: 300000
  },
  {
    value: 'retail_trading',
    label: 'Retail and Trading',
    description: 'Retail sales, wholesale trading, e-commerce, general merchandise',
    gst_section: 'Section XXI: Services',
    chapter_number: 99,
    common_hsn_codes: ['48239090', '39269099', '84713000'],
    expense_categories: ['Inventory', 'Store Operations', 'Marketing & Advertising', 'Point of Sale Systems'],
    capitalization_threshold: 25000
  },
  {
    value: 'education_training',
    label: 'Education and Training',
    description: 'Educational institutions, training centers, e-learning, coaching',
    gst_section: 'Section XXI: Services',
    chapter_number: 99,
    common_hsn_codes: ['998211', '84713000', '49019990'],
    expense_categories: ['Educational Materials', 'Technology Infrastructure', 'Faculty Costs', 'Facility Maintenance'],
    capitalization_threshold: 50000
  },
  {
    value: 'healthcare_services',
    label: 'Healthcare Services',
    description: 'Hospitals, clinics, diagnostic centers, medical practice',
    gst_section: 'Section XXI: Services',
    chapter_number: 99,
    common_hsn_codes: ['998211', '90189099', '84713000'],
    expense_categories: ['Medical Equipment', 'Consumables & Supplies', 'Professional Services', 'Facility Management'],
    capitalization_threshold: 200000
  },

  // General/Other
  {
    value: 'other',
    label: 'Other Business Activities',
    description: 'General business activities not elsewhere classified',
    gst_section: 'General Classification',
    chapter_number: 99,
    common_hsn_codes: ['48239090', '84713000', '39269099'],
    expense_categories: ['Office Expenses', 'Equipment', 'Professional Services', 'Utilities'],
    capitalization_threshold: 50000
  }
]

class OrganizationService {
  
  /**
   * Get user's organization collection path
   */
  private getUserOrganizationPath(): string {
    const user = authService.getCurrentUser()
    if (!user?.uid) throw new Error('User not authenticated')
    return `users/${user.uid}/organizations`
  }

  /**
   * Create a new organization profile
   */
  async createOrganization(organizationData: Omit<UserOrganizationProfile, 'id' | 'created_at' | 'updated_at' | 'user_uid'>): Promise<string> {
    try {
      const user = authService.getCurrentUser()
      if (!user?.uid) throw new Error('User not authenticated')

      const orgRef = collection(db, this.getUserOrganizationPath())
      
      const newOrg: Omit<UserOrganizationProfile, 'id'> = {
        ...organizationData,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        user_uid: user.uid
      }

      const docRef = await addDoc(orgRef, newOrg)
      console.log('🏢 Organization created:', docRef.id)
      return docRef.id
      
    } catch (error) {
      console.error('❌ Error creating organization:', error)
      throw error
    }
  }

  /**
   * Update an organization profile
   */
  async updateOrganization(organizationId: string, updates: Partial<OrganizationProfile>): Promise<void> {
    try {
      const orgRef = doc(db, this.getUserOrganizationPath(), organizationId)
      
      await updateDoc(orgRef, {
        ...updates,
        updated_at: Timestamp.now()
      })
      
      console.log('🏢 Organization updated:', organizationId)
      
    } catch (error) {
      console.error('❌ Error updating organization:', error)
      throw error
    }
  }

  /**
   * Delete an organization profile
   */
  async deleteOrganization(organizationId: string): Promise<void> {
    try {
      const orgRef = doc(db, this.getUserOrganizationPath(), organizationId)
      await deleteDoc(orgRef)
      console.log('🗑️ Organization deleted:', organizationId)
      
    } catch (error) {
      console.error('❌ Error deleting organization:', error)
      throw error
    }
  }

  /**
   * Get all user's organizations
   */
  async getOrganizations(): Promise<OrganizationProfile[]> {
    try {
      const orgRef = collection(db, this.getUserOrganizationPath())
      const q = query(orgRef, orderBy('created_at', 'desc'))
      
      const snapshot = await getDocs(q)
      const organizations: OrganizationProfile[] = []
      
      snapshot.forEach(doc => {
        organizations.push({
          id: doc.id,
          ...doc.data()
        } as OrganizationProfile)
      })
      
      console.log('🏢 Retrieved organizations:', organizations.length)
      return organizations
      
    } catch (error) {
      console.error('❌ Error getting organizations:', error)
      throw error
    }
  }

  /**
   * Get user's default organization
   */
  async getDefaultOrganization(): Promise<OrganizationProfile | null> {
    try {
      const orgRef = collection(db, this.getUserOrganizationPath())
      const q = query(orgRef, where('is_default', '==', true))
      
      const snapshot = await getDocs(q)
      if (snapshot.empty) return null
      
      const doc = snapshot.docs[0]
      return {
        id: doc.id,
        ...doc.data()
      } as OrganizationProfile
      
    } catch (error) {
      console.error('❌ Error getting default organization:', error)
      return null
    }
  }

  /**
   * Set an organization as default
   */
  async setDefaultOrganization(organizationId: string): Promise<void> {
    try {
      const organizations = await this.getOrganizations()
      
      // Remove default from all others
      const updatePromises = organizations.map(org => {
        if (org.id === organizationId) {
          return this.updateOrganization(org.id!, { is_default: true })
        } else if (org.is_default) {
          return this.updateOrganization(org.id!, { is_default: false })
        }
        return Promise.resolve()
      })
      
      await Promise.all(updatePromises)
      console.log('🏢 Default organization set:', organizationId)
      
    } catch (error) {
      console.error('❌ Error setting default organization:', error)
      throw error
    }
  }

  /**
   * Get business type template by value
   */
  getBusinessTypeTemplate(businessType: string): BusinessType | undefined {
    return BUSINESS_TYPES.find(bt => bt.value === businessType)
  }

  /**
   * Create organization from business type template
   */
  createFromTemplate(businessType: string, orgName: string, gstin: string): Omit<UserOrganizationProfile, 'id' | 'created_at' | 'updated_at' | 'user_uid'> {
    const template = this.getBusinessTypeTemplate(businessType)
    
    if (!template) {
      throw new Error(`Business type template not found: ${businessType}`)
    }

    return {
      name: orgName,
      gstin: gstin,
      business_type: template.value,
      industry: template.label,
      business_description: template.description,
      capitalization_threshold: template.capitalization_threshold,
      common_hsn_codes: [...template.common_hsn_codes],
      expense_categories: [...template.expense_categories],
      address: '',
      contact_person: '',
      phone: '',
      email: '',
      is_default: false,
      is_active: true
    }
  }
}

export const organizationService = new OrganizationService()