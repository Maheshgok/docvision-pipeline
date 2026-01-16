import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Upload, Download, AlertCircle, Check } from 'lucide-react'
import type { ChartOfAccountsEntry } from '../../services/clientOrganizations'
import { toast } from 'react-hot-toast'

interface ChartOfAccountsManagerProps {
  chartOfAccounts: ChartOfAccountsEntry[]
  onUpdate: (accounts: ChartOfAccountsEntry[]) => void
  clientName: string
}

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset', color: 'bg-blue-100 text-blue-800' },
  { value: 'liability', label: 'Liability', color: 'bg-red-100 text-red-800' },
  { value: 'equity', label: 'Equity', color: 'bg-purple-100 text-purple-800' },
  { value: 'income', label: 'Income', color: 'bg-green-100 text-green-800' },
  { value: 'expense', label: 'Expense', color: 'bg-amber-100 text-amber-800' }
]

// Sample Chart of Accounts templates
const SAMPLE_COA_TEMPLATES = {
  basic: [
    { account_code: '1000', account_name: 'Cash and Bank', account_type: 'asset' as const, description: 'Cash and bank balances', is_active: true },
    { account_code: '1100', account_name: 'Accounts Receivable', account_type: 'asset' as const, description: 'Money owed by customers', is_active: true },
    { account_code: '1200', account_name: 'Inventory', account_type: 'asset' as const, description: 'Stock and raw materials', is_active: true },
    { account_code: '1500', account_name: 'Fixed Assets', account_type: 'asset' as const, description: 'Property, plant, equipment', is_active: true },
    { account_code: '2000', account_name: 'Accounts Payable', account_type: 'liability' as const, description: 'Money owed to suppliers', is_active: true },
    { account_code: '2100', account_name: 'GST Payable', account_type: 'liability' as const, description: 'GST/Tax obligations', is_active: true },
    { account_code: '3000', account_name: 'Capital Account', account_type: 'equity' as const, description: 'Owner equity', is_active: true },
    { account_code: '4000', account_name: 'Sales Revenue', account_type: 'income' as const, description: 'Revenue from sales', keywords: ['sale', 'revenue', 'income'], is_active: true },
    { account_code: '4100', account_name: 'Service Revenue', account_type: 'income' as const, description: 'Revenue from services', keywords: ['service', 'consulting', 'fees'], is_active: true },
    { account_code: '5000', account_name: 'Cost of Goods Sold', account_type: 'expense' as const, description: 'Direct costs of goods sold', keywords: ['cogs', 'cost of goods'], is_active: true },
    { account_code: '5100', account_name: 'Raw Materials', account_type: 'expense' as const, description: 'Purchase of raw materials', keywords: ['material', 'raw', 'components'], is_active: true },
    { account_code: '6000', account_name: 'Rent Expense', account_type: 'expense' as const, description: 'Office and facility rent', keywords: ['rent', 'lease', 'premises'], is_active: true },
    { account_code: '6100', account_name: 'Utilities', account_type: 'expense' as const, description: 'Electricity, water, internet', keywords: ['electricity', 'water', 'internet', 'phone', 'utility'], is_active: true },
    { account_code: '6200', account_name: 'Office Supplies', account_type: 'expense' as const, description: 'Stationery and office items', keywords: ['stationery', 'office', 'supplies', 'printing'], is_active: true },
    { account_code: '6300', account_name: 'Travel & Conveyance', account_type: 'expense' as const, description: 'Business travel expenses', keywords: ['travel', 'transport', 'fuel', 'cab', 'flight'], is_active: true },
    { account_code: '6400', account_name: 'Professional Fees', account_type: 'expense' as const, description: 'Legal, accounting, consulting', keywords: ['legal', 'accounting', 'audit', 'consulting', 'professional'], is_active: true },
    { account_code: '6500', account_name: 'Repairs & Maintenance', account_type: 'expense' as const, description: 'Equipment and facility repairs', keywords: ['repair', 'maintenance', 'service', 'amc'], is_active: true },
    { account_code: '6600', account_name: 'Insurance', account_type: 'expense' as const, description: 'Business insurance premiums', keywords: ['insurance', 'premium', 'policy'], is_active: true },
    { account_code: '6700', account_name: 'Marketing & Advertising', account_type: 'expense' as const, description: 'Promotional expenses', keywords: ['marketing', 'advertising', 'promotion', 'ads'], is_active: true },
    { account_code: '6800', account_name: 'Software & Subscriptions', account_type: 'expense' as const, description: 'Software licenses and SaaS', keywords: ['software', 'license', 'subscription', 'saas'], is_active: true }
  ],
  manufacturing: [
    { account_code: '1300', account_name: 'Work in Progress', account_type: 'asset' as const, description: 'Partially completed goods', is_active: true },
    { account_code: '1350', account_name: 'Finished Goods', account_type: 'asset' as const, description: 'Completed inventory', is_active: true },
    { account_code: '5200', account_name: 'Direct Labor', account_type: 'expense' as const, description: 'Production labor costs', keywords: ['labor', 'wages', 'production'], is_active: true },
    { account_code: '5300', account_name: 'Factory Overhead', account_type: 'expense' as const, description: 'Indirect manufacturing costs', keywords: ['factory', 'overhead', 'manufacturing'], is_active: true },
    { account_code: '5400', account_name: 'Packaging Materials', account_type: 'expense' as const, description: 'Packaging and packing', keywords: ['packaging', 'packing', 'carton', 'box'], is_active: true }
  ],
  trading: [
    { account_code: '4200', account_name: 'Commission Income', account_type: 'income' as const, description: 'Commission earned', keywords: ['commission', 'brokerage'], is_active: true },
    { account_code: '5500', account_name: 'Freight Inward', account_type: 'expense' as const, description: 'Shipping costs for purchases', keywords: ['freight', 'shipping', 'transport', 'courier'], is_active: true },
    { account_code: '5600', account_name: 'Freight Outward', account_type: 'expense' as const, description: 'Delivery costs for sales', keywords: ['delivery', 'dispatch', 'courier out'], is_active: true },
    { account_code: '5700', account_name: 'Customs & Duties', account_type: 'expense' as const, description: 'Import/export duties', keywords: ['customs', 'duty', 'import', 'export'], is_active: true }
  ]
}

const ChartOfAccountsManager: React.FC<ChartOfAccountsManagerProps> = ({
  chartOfAccounts,
  onUpdate,
  clientName
}) => {
  const [accounts, setAccounts] = useState<ChartOfAccountsEntry[]>(chartOfAccounts || [])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [newAccount, setNewAccount] = useState<Partial<ChartOfAccountsEntry>>({
    account_code: '',
    account_name: '',
    account_type: 'expense',
    description: '',
    keywords: [],
    is_active: true
  })
  const [keywordsInput, setKeywordsInput] = useState('')
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    setAccounts(chartOfAccounts || [])
  }, [chartOfAccounts])

  const handleAddAccount = () => {
    if (!newAccount.account_code || !newAccount.account_name) {
      toast.error('Account code and name are required')
      return
    }

    // Check for duplicate account code
    if (accounts.some(a => a.account_code === newAccount.account_code)) {
      toast.error('Account code already exists')
      return
    }

    const account: ChartOfAccountsEntry = {
      account_code: newAccount.account_code!,
      account_name: newAccount.account_name!,
      account_type: newAccount.account_type as ChartOfAccountsEntry['account_type'],
      description: newAccount.description,
      keywords: keywordsInput.split(',').map(k => k.trim().toLowerCase()).filter(k => k),
      is_active: true
    }

    const updatedAccounts = [...accounts, account].sort((a, b) => 
      a.account_code.localeCompare(b.account_code)
    )
    
    setAccounts(updatedAccounts)
    setHasChanges(true)
    setNewAccount({
      account_code: '',
      account_name: '',
      account_type: 'expense',
      description: '',
      keywords: [],
      is_active: true
    })
    setKeywordsInput('')
    setShowAddForm(false)
    toast.success('Account added')
  }

  const handleDeleteAccount = (index: number) => {
    const updatedAccounts = accounts.filter((_, i) => i !== index)
    setAccounts(updatedAccounts)
    setHasChanges(true)
    toast.success('Account removed')
  }

  const handleToggleActive = (index: number) => {
    const updatedAccounts = [...accounts]
    updatedAccounts[index].is_active = !updatedAccounts[index].is_active
    setAccounts(updatedAccounts)
    setHasChanges(true)
  }

  const handleSaveChanges = () => {
    onUpdate(accounts)
    setHasChanges(false)
    toast.success('Chart of Accounts saved')
  }

  const handleLoadTemplate = (templateKey: keyof typeof SAMPLE_COA_TEMPLATES) => {
    const template = SAMPLE_COA_TEMPLATES[templateKey]
    const existingCodes = new Set(accounts.map(a => a.account_code))
    const newAccounts = template.filter(t => !existingCodes.has(t.account_code))
    
    if (newAccounts.length === 0) {
      toast.error('All template accounts already exist')
      return
    }

    const updatedAccounts = [...accounts, ...newAccounts].sort((a, b) => 
      a.account_code.localeCompare(b.account_code)
    )
    
    setAccounts(updatedAccounts)
    setHasChanges(true)
    toast.success(`Added ${newAccounts.length} accounts from ${templateKey} template`)
  }

  const handleExportCSV = () => {
    const headers = ['Account Code', 'Account Name', 'Type', 'Description', 'Keywords', 'Active']
    const rows = accounts.map(a => [
      a.account_code,
      a.account_name,
      a.account_type,
      a.description || '',
      (a.keywords || []).join(';'),
      a.is_active ? 'Yes' : 'No'
    ])
    
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${clientName}_chart_of_accounts.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported to CSV')
  }

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const lines = text.split('\n').slice(1) // Skip header
        
        const importedAccounts: ChartOfAccountsEntry[] = []
        const existingCodes = new Set(accounts.map(a => a.account_code))

        for (const line of lines) {
          if (!line.trim()) continue
          
          // Parse CSV line (handle quoted values)
          const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)
          if (!matches || matches.length < 3) continue
          
          const [code, name, type, desc, keywords, active] = matches.map(m => m.replace(/^"|"$/g, '').trim())
          
          if (existingCodes.has(code)) continue
          
          importedAccounts.push({
            account_code: code,
            account_name: name,
            account_type: (['asset', 'liability', 'equity', 'income', 'expense'].includes(type.toLowerCase()) 
              ? type.toLowerCase() : 'expense') as ChartOfAccountsEntry['account_type'],
            description: desc || undefined,
            keywords: keywords ? keywords.split(';').map(k => k.trim().toLowerCase()) : undefined,
            is_active: active?.toLowerCase() !== 'no'
          })
        }

        if (importedAccounts.length === 0) {
          toast.error('No new accounts found in CSV')
          return
        }

        const updatedAccounts = [...accounts, ...importedAccounts].sort((a, b) => 
          a.account_code.localeCompare(b.account_code)
        )
        
        setAccounts(updatedAccounts)
        setHasChanges(true)
        toast.success(`Imported ${importedAccounts.length} accounts`)
        
      } catch (error) {
        toast.error('Failed to parse CSV file')
        console.error('CSV import error:', error)
      }
    }
    reader.readAsText(file)
    event.target.value = '' // Reset input
  }

  const getAccountTypeStyle = (type: string) => {
    return ACCOUNT_TYPES.find(t => t.value === type)?.color || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-gray-900">Chart of Accounts</h4>
          <span className="text-sm text-gray-500">({accounts.length} accounts)</span>
          {hasChanges && (
            <span className="flex items-center gap-1 text-amber-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              Unsaved changes
            </span>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          {/* Template dropdown */}
          <div className="relative group">
            <button className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
              Load Template
            </button>
            <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => handleLoadTemplate('basic')}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
              >
                Basic COA (20 accounts)
              </button>
              <button
                onClick={() => handleLoadTemplate('manufacturing')}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
              >
                + Manufacturing (5 accounts)
              </button>
              <button
                onClick={() => handleLoadTemplate('trading')}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
              >
                + Trading (4 accounts)
              </button>
            </div>
          </div>
          
          <label className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer flex items-center gap-1">
            <Upload className="w-4 h-4" />
            Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
          </label>
          
          <button
            onClick={handleExportCSV}
            disabled={accounts.length === 0}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
          
          {hasChanges && (
            <button
              onClick={handleSaveChanges}
              className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600 flex items-center gap-1"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          )}
        </div>
      </div>

      {/* Add Account Form */}
      {showAddForm && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h5 className="font-medium text-gray-900 mb-3">Add New Account</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Code *
              </label>
              <input
                type="text"
                value={newAccount.account_code}
                onChange={(e) => setNewAccount({...newAccount, account_code: e.target.value})}
                placeholder="e.g., 5100"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Name *
              </label>
              <input
                type="text"
                value={newAccount.account_name}
                onChange={(e) => setNewAccount({...newAccount, account_name: e.target.value})}
                placeholder="e.g., Raw Materials"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Type *
              </label>
              <select
                value={newAccount.account_type}
                onChange={(e) => setNewAccount({...newAccount, account_type: e.target.value as ChartOfAccountsEntry['account_type']})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                {ACCOUNT_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={newAccount.description}
                onChange={(e) => setNewAccount({...newAccount, description: e.target.value})}
                placeholder="When to use this account"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="e.g., raw, material, component, input"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Keywords help auto-match invoice line items to this account
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAddAccount}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Add Account
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Accounts Table */}
      {accounts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Keywords</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {accounts.map((account, index) => (
                <tr key={account.account_code} className={!account.is_active ? 'opacity-50' : ''}>
                  <td className="px-4 py-2 text-sm font-mono font-medium text-gray-900">
                    {account.account_code}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {account.account_name}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getAccountTypeStyle(account.account_type)}`}>
                      {account.account_type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500 max-w-xs truncate">
                    {account.description || '-'}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500 max-w-xs">
                    {account.keywords?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {account.keywords.slice(0, 3).map(kw => (
                          <span key={kw} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                            {kw}
                          </span>
                        ))}
                        {account.keywords.length > 3 && (
                          <span className="text-xs text-gray-400">+{account.keywords.length - 3}</span>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleToggleActive(index)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                        account.is_active 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {account.is_active ? (
                        <>
                          <Check className="w-3 h-3" />
                          Active
                        </>
                      ) : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDeleteAccount(index)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      title="Delete account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <p>No accounts configured yet.</p>
          <p className="text-sm mt-1">Click "Load Template" to start with a predefined chart of accounts, or add accounts manually.</p>
        </div>
      )}
    </div>
  )
}

export default ChartOfAccountsManager
