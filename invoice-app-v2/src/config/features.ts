// Feature configuration for the invoice processing system
// Controls which features are enabled/disabled

export interface FeatureConfig {
  accountCodes: {
    enabled: boolean;
    displayInTable: boolean;
    description: string;
  };
  // Add more feature toggles as needed
}

export const FEATURE_CONFIG: FeatureConfig = {
  accountCodes: {
    enabled: false, // Currently disabled - can be toggled when chart of accounts is provided
    displayInTable: false, // Hide account code column in tables when disabled
    description: "Account codes from chart of accounts. Enable when you have a standardized chart of accounts with codes."
  }
};

// Utility functions for feature checking
export const isFeatureEnabled = (feature: keyof FeatureConfig): boolean => {
  return FEATURE_CONFIG[feature]?.enabled || false;
};

export const shouldDisplayInTable = (feature: keyof FeatureConfig): boolean => {
  const featureConfig = FEATURE_CONFIG[feature];
  return featureConfig?.enabled && featureConfig?.displayInTable || false;
};

// Function to dynamically enable account codes when chart of accounts is available
export const enableAccountCodesFeature = (enabled: boolean = true): void => {
  FEATURE_CONFIG.accountCodes.enabled = enabled;
  FEATURE_CONFIG.accountCodes.displayInTable = enabled;
};

// Function to check if organization has chart of accounts
export const hasChartOfAccounts = (organizationContext?: any): boolean => {
  if (!organizationContext) return false;
  
  // Check various indicators of chart of accounts availability
  const contextStr = JSON.stringify(organizationContext).toLowerCase();
  return (
    contextStr.includes('chart_of_accounts') ||
    contextStr.includes('account_codes') ||
    contextStr.includes('account_mapping') ||
    organizationContext.chart_of_accounts ||
    organizationContext.account_codes
  );
};