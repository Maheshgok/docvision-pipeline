import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../config/firebase'

class CloudStorageService {
  private readonly QR_CODE_FOLDER = 'admin/qr-codes'

  /**
   * Upload QR code image to cloud storage
   */
  async uploadQRCode(file: File): Promise<string> {
    try {
      // Validate file
      if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image')
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error('File size must be less than 5MB')
      }

      // Create a unique filename
      const timestamp = Date.now()
      const fileExtension = file.name.split('.').pop() || 'png'
      const filename = `qr-code-${timestamp}.${fileExtension}`
      
      // Create storage reference
      const storageRef = ref(storage, `${this.QR_CODE_FOLDER}/${filename}`)
      
      // Upload file
      console.log('📤 Uploading QR code to cloud storage...')
      const snapshot = await uploadBytes(storageRef, file)
      
      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref)
      
      console.log('✅ QR code uploaded successfully:', downloadURL)
      return downloadURL
      
    } catch (error) {
      console.error('❌ Error uploading QR code:', error)
      throw error
    }
  }

  /**
   * Delete old QR code from cloud storage
   */
  async deleteQRCode(url: string): Promise<void> {
    try {
      if (!url || !url.includes('firebase')) {
        // Not a Firebase URL, skip deletion
        return
      }

      // Extract the path from Firebase URL
      const urlParts = url.split('/o/')
      if (urlParts.length < 2) return

      const pathPart = urlParts[1].split('?')[0]
      const filePath = decodeURIComponent(pathPart)

      const storageRef = ref(storage, filePath)
      await deleteObject(storageRef)
      
      console.log('✅ Old QR code deleted from cloud storage')
    } catch (error) {
      console.warn('⚠️ Could not delete old QR code:', error)
      // Don't throw error for deletion failures
    }
  }

  /**
   * Upload any admin file to cloud storage
   */
  async uploadAdminFile(file: File, folder: string = 'admin/files'): Promise<string> {
    try {
      const timestamp = Date.now()
      const fileExtension = file.name.split('.').pop() || 'file'
      const filename = `${file.name.replace(/\.[^/.]+$/, '')}-${timestamp}.${fileExtension}`
      
      const storageRef = ref(storage, `${folder}/${filename}`)
      
      console.log(`📤 Uploading admin file to ${folder}...`)
      const snapshot = await uploadBytes(storageRef, file)
      const downloadURL = await getDownloadURL(snapshot.ref)
      
      console.log('✅ Admin file uploaded successfully:', downloadURL)
      return downloadURL
      
    } catch (error) {
      console.error('❌ Error uploading admin file:', error)
      throw error
    }
  }
}

export const cloudStorageService = new CloudStorageService()
export default cloudStorageService