import { User as FirebaseUser } from 'firebase/auth'

export interface User extends FirebaseUser {
  id: string
  email: string
  displayName: string | null
  photoURL: string | null
  emailVerified: boolean
}

export interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  isAuthenticated: boolean
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthContextType {
  user: User | null
  loading: boolean
  error: string | null
  isAuthenticated: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (credentials: LoginCredentials) => Promise<void>
  signUpWithEmail: (credentials: LoginCredentials) => Promise<void>
  signOut: () => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  clearError: () => void
}