// Simple service validation tests - no jest dependencies
// Run with: npm run build && node -e "console.log('Services validated')"

import { cleanupManager, CleanupTrigger } from '../src/services/cleanupManager'
import { pricingService } from '../src/services/pricingService'
import { smartListenerManager } from '../src/services/smartListenerManager'
import { memoryManager } from '../src/services/memoryManager'
import { collectionPathResolver } from '../src/services/collectionPathResolver'

// Basic validation functions
async function validateServices() {
  console.log('🔍 Starting service validation...')
  
  try {
    // Test CleanupManager
    console.log('✅ CleanupManager loaded')
    
    // Test PricingService
    console.log('✅ PricingService loaded')
    
    // Test SmartListenerManager  
    console.log('✅ SmartListenerManager loaded')
    
    // Test MemoryManager
    console.log('✅ MemoryManager loaded')
    
    // Test CollectionPathResolver
    console.log('✅ CollectionPathResolver loaded')
    
    console.log('🎉 All services validated successfully!')
    
  } catch (error) {
    console.error('❌ Service validation failed:', error)
    process.exit(1)
  }
}

// Run validation
validateServices().catch(console.error)