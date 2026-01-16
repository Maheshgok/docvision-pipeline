import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  UserCredential,
  User as FirebaseUser,
  onAuthStateChanged
} from 'firebase/auth'
import { auth } from '../config/firebase'
import type { LoginCredentials } from '../types/auth'
import type { UserProfile } from './userService'

// Import session security service (will be dynamically imported to avoid circular dependency)
declare const sessionSecurityService: any

export class AuthService {
  private googleProvider: GoogleAuthProvider

  constructor() {
    this.googleProvider = new GoogleAuthProvider()
    this.googleProvider.setCustomParameters({
      prompt: 'select_account'
    })
    
    // Check for redirect result on initialization
    this.checkRedirectResult()
  }

  /**
   * Check for redirect result from Google sign-in
   */
  private async checkRedirectResult(): Promise<void> {
    try {
      const result = await getRedirectResult(auth)
      if (result) {
        console.log(' Google redirect sign-in successful:', result.user.email)
      }
    } catch (error: any) {
      console.error(' Google redirect sign-in failed:', error)
    }
  }

  /**
   * Detect if device is mobile/touch-based
   */
  private isMobileDevice(): boolean {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0)
  }

  /**
   * Sign in with Google using the most reliable method per platform
   */
  async signInWithGoogle(): Promise<UserCredential> {
    console.log('🔐 Initiating Google sign-in...')
    
    // Choose primary method based on platform
    const useMobileFlow = this.isMobileDevice()
    console.log(`📱 Using ${useMobileFlow ? 'redirect' : 'popup'} flow for ${useMobileFlow ? 'mobile' : 'desktop'}`)

    try {
      let result: UserCredential

      if (useMobileFlow) {
        // Mobile: Use redirect as PRIMARY method (most reliable)
        await signInWithRedirect(auth, this.googleProvider)
        // The redirect will handle the rest - this will throw to indicate redirect in progress
        return Promise.reject(new Error('REDIRECT_IN_PROGRESS'))
      } else {
        // Desktop: Use popup as PRIMARY method
        result = await signInWithPopup(auth, this.googleProvider)
      }
      
      console.log('✅ Google sign-in successful:', result.user.email)      
      
      // Start session security tracking
      try {
        const { sessionSecurityService } = await import('./sessionSecurityService')
        await sessionSecurityService.startSession(result.user.uid)
      } catch (sessionError) {
        console.warn('⚠️ Session security not available:', sessionError)
      }
      
      return result
      
    } catch (error: any) {
      console.error('❌ Google sign-in failed:', error)
      this.handleAuthError(error)
      throw error
    }
  }

  /**
   * Sign in with email and password
   */
  async signInWithEmail(credentials: LoginCredentials): Promise<UserCredential> {
    try {
      console.log(' Signing in with email:', credentials.email)
      const result = await signInWithEmailAndPassword(auth, credentials.email, credentials.password)
      console.log(' Email sign-in successful:', result.user.email)      
      // Start session security tracking
      try {
        const { sessionSecurityService } = await import('./sessionSecurityService')
        await sessionSecurityService.startSession(result.user.uid)
      } catch (sessionError) {
        console.warn('\u26a0\ufe0f Session security not available:', sessionError)
      }
            return result
    } catch (error: any) {
      console.error(' Email sign-in failed:', error)
      this.handleAuthError(error)
      throw error
    }
  }

  /**
   * Sign up with email and password
   */
  async signUpWithEmail(credentials: LoginCredentials): Promise<UserCredential> {
    try {
      console.log(' Creating account for:', credentials.email)
      const result = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password)
      console.log(' Account created successfully:', result.user.email)
      return result
    } catch (error: any) {
      console.error(' Account creation failed:', error)
      this.handleAuthError(error)
      throw error
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      // End session security tracking
      try {
        const { sessionSecurityService } = await import('./sessionSecurityService')
        await sessionSecurityService.endSession()
      } catch (sessionError) {
        console.warn('⚠️ Session cleanup warning:', sessionError)
      }
      
      await firebaseSignOut(auth)
      console.log(' User signed out successfully')
    } catch (error: any) {
      console.error(' Sign-out failed:', error)
      throw error
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email)
      console.log(' Password reset email sent to:', email)
    } catch (error: any) {
      console.error(' Password reset failed:', error)
      this.handleAuthError(error)
      throw error
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): FirebaseUser | null {
    return auth.currentUser
  }

  /**
   * Get current user's ID token
   */
  async getIdToken(): Promise<string | null> {
    const user = this.getCurrentUser()
    if (!user) return null

    try {
      return await user.getIdToken()
    } catch (error) {
      console.error('❌ Failed to get ID token:', error)
      return null
    }
  }

  /**
   * Set up auth state listener with user profile management
   */
  onAuthStateChanged(callback: (user: FirebaseUser | null, profile?: UserProfile | null) => void) {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Import userService here to avoid circular dependency
          const { userService } = await import('./userService')
          
          // Create or update user profile
          const profile = await userService.createOrUpdateUserProfile({
            id: user.uid,
            uid: user.uid,
            email: user.email!,
            displayName: user.displayName,
            photoURL: user.photoURL,
            emailVerified: user.emailVerified
          } as any)
          
          console.log('✅ User authenticated and profile updated:', user.email)
          callback(user, profile)
        } catch (error) {
          console.error('❌ Error managing user profile:', error)
          callback(user, null)
        }
      } else {
        console.log('🚪 User signed out')
        callback(null, null)
      }
    })
  }

  /**
   * Handle authentication errors with user-friendly messages
   */
  private handleAuthError(error: any): void {
    const errorMessages: Record<string, string> = {
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password should be at least 6 characters long.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/popup-closed-by-user': 'Sign-in was cancelled. Trying alternative method...',
      'auth/popup-blocked': 'Popup was blocked. Trying alternative method...',
      'auth/network-request-failed': 'Network error. Please check your connection and try again.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/unauthorized-domain': 'This domain is not authorized for OAuth operations.',
      'auth/operation-not-allowed': 'Google sign-in is not enabled for this project.',
    }

    const userFriendlyMessage = errorMessages[error.code] || error.message
    error.userMessage = userFriendlyMessage
  }
}

export const authService = new AuthService()
