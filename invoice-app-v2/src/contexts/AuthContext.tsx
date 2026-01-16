import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react'
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth'
import { auth } from '../config/firebase'
import { authService } from '../services/auth'
import { userService, type UserProfile } from '../services/userService'
import { windowCloseHandler } from '../services/windowCloseHandler'
import type { AuthContextType, LoginCredentials, User } from '../types/auth'

// Enhanced context type with user management
interface EnhancedAuthContextType extends AuthContextType {
  userProfile: UserProfile | null
  refreshUserProfile: () => Promise<void>
  hasPermission: (permission: keyof UserProfile['permissions']) => boolean
  checkUsageLimits: () => Promise<ReturnType<typeof userService.checkUsageLimits>>
  validateFileSize: (fileSizeInMB: number) => Promise<ReturnType<typeof userService.validateFileSize>>
  markHasResults: (hasResults: boolean) => void
}

const AuthContext = createContext<EnhancedAuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionInitialized, setSessionInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refresh user profile
  const refreshUserProfile = async () => {
    try {
      if (user) {
        const profile = await userService.getUserProfile(user.uid)
        setUserProfile(profile)
      }
    } catch (error) {
      console.error('Error refreshing user profile:', error)
    }
  }

  // Check if user has permission
  const hasPermission = (permission: keyof UserProfile['permissions']): boolean => {
    return userProfile?.permissions?.[permission] || false
  }

  // Check usage limits wrapper
  const checkUsageLimits = async () => {
    return await userService.checkUsageLimits()
  }

  // Validate file size wrapper
  const validateFileSize = async (fileSizeInMB: number) => {
    return await userService.validateFileSize(fileSizeInMB)
  }

  // Track results status for window close handling
  const markHasResults = (hasActiveResults: boolean) => {
    windowCloseHandler.setHasResults(hasActiveResults)
  }

  // Convert Firebase user to our User type
  const convertFirebaseUser = (firebaseUser: FirebaseUser): User => ({
    ...firebaseUser,
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    emailVerified: firebaseUser.emailVerified,
  })

  useEffect(() => {
    console.log('🔄 Setting up enhanced auth state listener...')
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const user = convertFirebaseUser(firebaseUser)
          console.log('✅ User authenticated:', user.email)
          setUser(user)
          
          // Initialize window close handler for this user
          windowCloseHandler.initialize(user)
          
          // Initialize session security (only if not already started)
          try {
            const { sessionSecurityService } = await import('../services/sessionSecurityService')
            const currentSession = sessionSecurityService.getCurrentSession()
            if (!currentSession.sessionId && !sessionInitialized) {
              setSessionInitialized(true)
              const sessionStarted = await sessionSecurityService.startSession(user.uid)
              if (!sessionStarted) {
                console.log('🚫 Session blocked - system in use by another user')
                // Force logout since session couldn't be started
                await authService.signOut()
                setSessionInitialized(false)
                return
              }
              console.log('🔒 Session security initialized')
            }
          } catch (sessionError) {
            console.warn('⚠️ Session security initialization failed:', sessionError)
            setSessionInitialized(false)
          }
          
          // Create or update user profile
          try {
            const profile = await userService.createOrUpdateUserProfile(user)
            setUserProfile(profile)
            console.log('📋 User profile updated:', profile.role)
          } catch (profileError) {
            console.error('❌ Error managing user profile:', profileError)
            setUserProfile(null)
          }
        } else {
          console.log('❌ User not authenticated')
          setUser(null)
          setUserProfile(null)
          setSessionInitialized(false)
          windowCloseHandler.cleanup()
          
          // End session security
          try {
            const { sessionSecurityService } = await import('../services/sessionSecurityService')
            await sessionSecurityService.endSession()
            console.log('🔒 Session security ended')
          } catch (sessionError) {
            console.warn('⚠️ Session cleanup warning:', sessionError)
          }
        }
      } catch (err: any) {
        console.error('❌ Auth state change error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })

    return () => {
      console.log('🔄 Cleaning up auth listener')
      unsubscribe()
      windowCloseHandler.cleanup()
    }
  }, [])

  const signInWithGoogle = async (): Promise<void> => {
    try {
      setError(null)
      setLoading(true)
      await authService.signInWithGoogle()
      // User state will be updated by onAuthStateChanged
    } catch (err: any) {
      setError(err.userMessage || err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const signInWithEmail = async (credentials: LoginCredentials): Promise<void> => {
    try {
      setError(null)
      setLoading(true)
      await authService.signInWithEmail(credentials)
      // User state will be updated by onAuthStateChanged
    } catch (err: any) {
      setError(err.userMessage || err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const signUpWithEmail = async (credentials: LoginCredentials): Promise<void> => {
    try {
      setError(null)
      setLoading(true)
      await authService.signUpWithEmail(credentials)
      // User state will be updated by onAuthStateChanged
    } catch (err: any) {
      setError(err.userMessage || err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const signOut = async (): Promise<void> => {
    try {
      setError(null)
      
      // Trigger cleanup before logout
      if (user) {
        console.log('🚪 Manual logout - triggering cleanup')
        await windowCloseHandler.triggerCleanup()
      }
      
      await authService.signOut()
      
      // User state will be updated by onAuthStateChanged
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }

  const resetPassword = async (email: string): Promise<void> => {
    try {
      setError(null)
      await authService.resetPassword(email)
    } catch (err: any) {
      setError(err.userMessage || err.message)
      throw err
    }
  }

  const clearError = (): void => {
    setError(null)
  }

  const value: EnhancedAuthContextType = {
    user,
    userProfile,
    loading,
    error,
    isAuthenticated: !!user && !!userProfile,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    logout: signOut,
    resetPassword,
    clearError,
    refreshUserProfile,
    hasPermission,
    checkUsageLimits,
    validateFileSize,
    markHasResults,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): EnhancedAuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}