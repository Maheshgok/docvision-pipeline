import { createContext, useContext, ReactNode, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { createAbility, type AppAbility } from '../services/permissions'

interface PermissionContextType {
  ability: AppAbility
  can: (action: string, subject: string, resource?: any) => boolean
  cannot: (action: string, subject: string, resource?: any) => boolean
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined)

interface PermissionProviderProps {
  children: ReactNode
}

export const PermissionProvider: React.FC<PermissionProviderProps> = ({ children }) => {
  const { userProfile } = useAuth()

  const ability = useMemo(() => {
    console.log('🔑 Creating permissions for user:', userProfile?.email, 'Role:', userProfile?.role, 'PaymentStatus:', userProfile?.paymentStatus?.status)
    return createAbility(userProfile)
  }, [userProfile])

  const can = (action: string, subject: string, resource?: any): boolean => {
    try {
      return ability.can(action as any, subject as any, resource)
    } catch (error) {
      console.error('Permission check error:', error)
      return false
    }
  }

  const cannot = (action: string, subject: string, resource?: any): boolean => {
    return !can(action, subject, resource)
  }

  const value: PermissionContextType = {
    ability,
    can,
    cannot
  }

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  )
}

export const usePermissions = (): PermissionContextType => {
  const context = useContext(PermissionContext)
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionProvider')
  }
  return context
}

// Convenience hook for checking single permission
export const useCanAccess = (action: string, subject: string, resource?: any): boolean => {
  const { can } = usePermissions()
  return can(action, subject, resource)
}