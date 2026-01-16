import React from 'react'
import { Clock, Zap, TrendingUp, Calendar } from 'lucide-react'
import { UserProfile } from '../../services/userService'

interface UsageIndicatorProps {
  userProfile: UserProfile
  className?: string
}

export const UsageIndicator: React.FC<UsageIndicatorProps> = ({ 
  userProfile, 
  className = '' 
}) => {
  const { currentPackageValidity } = userProfile

  // Calculate time-based usage
  const getTimeUsage = () => {
    if (!currentPackageValidity?.expiresAt) return null
    
    const now = new Date()
    const expiresAt = currentPackageValidity.expiresAt.toDate()
    const activatedAt = currentPackageValidity.activatedAt.toDate()
    const totalDays = Math.ceil((expiresAt.getTime() - activatedAt.getTime()) / (1000 * 60 * 60 * 24))
    const remainingDays = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const usedDays = totalDays - remainingDays
    
    return {
      totalDays,
      remainingDays: Math.max(0, remainingDays),
      usedDays: Math.max(0, usedDays),
      percentage: Math.min(100, Math.max(0, (usedDays / totalDays) * 100))
    }
  }

  // Calculate consumption-based usage
  const getConsumptionUsage = () => {
    if (!currentPackageValidity || currentPackageValidity.analysisLimit === 0) return null
    
    const usedAnalyses = userProfile.packageConsumption
    const totalAnalyses = currentPackageValidity.analysisLimit
    const remainingAnalyses = currentPackageValidity.analysisRemaining
    const percentage = Math.min(100, (usedAnalyses / totalAnalyses) * 100)
    
    return {
      usedAnalyses,
      totalAnalyses,
      remainingAnalyses,
      percentage
    }
  }

  const timeUsage = getTimeUsage()
  const consumptionUsage = getConsumptionUsage()

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-500 bg-red-50'
    if (percentage >= 70) return 'text-amber-500 bg-amber-50'
    return 'text-green-500 bg-green-50'
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 70) return 'bg-amber-500'
    return 'bg-green-500'
  }

  if (userProfile.role === 'super_admin') {
    return (
      <div className={`p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200 ${className}`}>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-purple-600" />
          <span className="font-semibold text-purple-800">Super Admin</span>
        </div>
        <p className="text-sm text-purple-600 mt-1">Unlimited access to all features</p>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Time-based usage (always shown for active subscriptions) */}
      {timeUsage && (currentPackageValidity.packageType === 'time_based' || currentPackageValidity.packageType === 'hybrid') && (
        <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-gray-900">Subscription Time</span>
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getUsageColor(timeUsage.percentage)}`}>
              {timeUsage.remainingDays} days left
            </span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(timeUsage.percentage)}`}
              style={{ width: `${timeUsage.percentage}%` }}
            />
          </div>
          
          <div className="flex justify-between text-xs text-gray-600">
            <span>Used: {timeUsage.usedDays} days</span>
            <span>Total: {timeUsage.totalDays} days</span>
          </div>
        </div>
      )}

      {/* Consumption-based usage */}
      {consumptionUsage && (currentPackageValidity.packageType === 'consumption_based' || currentPackageValidity.packageType === 'hybrid') && (
        <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-600" />
              <span className="font-medium text-gray-900">Analysis Credits</span>
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getUsageColor(consumptionUsage.percentage)}`}>
              {consumptionUsage.remainingAnalyses} left
            </span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(consumptionUsage.percentage)}`}
              style={{ width: `${consumptionUsage.percentage}%` }}
            />
          </div>
          
          <div className="flex justify-between text-xs text-gray-600">
            <span>Used: {consumptionUsage.usedAnalyses}</span>
            <span>Total: {consumptionUsage.totalAnalyses}</span>
          </div>
        </div>
      )}

      {/* Total consumption stats */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="font-medium text-gray-900">Lifetime Stats</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Package Analysis:</span>
            <div className="font-medium text-gray-900">{userProfile.packageConsumption}</div>
          </div>
          <div>
            <span className="text-gray-500">Total Analysis:</span>
            <div className="font-medium text-gray-900">{userProfile.totalConsumption}</div>
          </div>
        </div>
      </div>

      {/* Package info */}
      <div className="flex items-center justify-center p-2 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="w-4 h-4" />
          <span>{currentPackageValidity.packageName}</span>
        </div>
      </div>
    </div>
  )
}

export default UsageIndicator