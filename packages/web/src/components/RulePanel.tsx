import { useState, useRef, useMemo, memo } from 'react'
import { useAppStore, type ReplacementStrategy, type RulePreset, type CustomRule, type PlainTextPattern } from '../stores/useAppStore'
import { Modal } from './Modal'
import { BUILTIN_PATTERNS } from '../data/patterns'
import { BUILTIN_PRESETS, type BuiltinPreset } from '../data/presets'
import { Stats } from './Stats'

interface PatternMatch {
  ruleId: string
  ruleLabel: string
  matches: string[]
}

function testPatternAgainstText(text: string, patterns: Record<string, string>, rules: Record<string, { label: string }>, customRules: CustomRule[]): PatternMatch[] {
  const results: PatternMatch[] = []
  
  Object.entries(patterns).forEach(([id, pattern]) => {
    if (!pattern || !rules[id]) return
    try {
      const regex = new RegExp(pattern, 'gi')
      const matches: string[] = []
      let match
      while ((match = regex.exec(text)) !== null) {
        matches.push(match[0])
        if (matches.length >= 10) break
      }
      if (matches.length > 0) {
        results.push({ ruleId: id, ruleLabel: rules[id].label, matches })
      }
    } catch {}
  })
  
  customRules.forEach(rule => {
    try {
      const regex = new RegExp(rule.pattern, 'gi')
      const matches: string[] = []
      let match
      while ((match = regex.exec(text)) !== null) {
        matches.push(match[0])
        if (matches.length >= 10) break
      }
      if (matches.length > 0) {
        results.push({ ruleId: rule.id, ruleLabel: rule.label, matches })
      }
    } catch {}
  })
  
  return results
}

const STRATEGY_OPTIONS: { value: ReplacementStrategy; label: string }[] = [
  { value: 'label', label: 'Label' },
  { value: 'fake', label: 'Fake' },
  { value: 'redact', label: 'Redact' },
  { value: 'template', label: 'Template' },
]

const CATEGORIES: Record<string, string[]> = {
  'Contact': ['email', 'email_message_id', 'phone_us', 'phone_uk', 'phone_intl'],
  'Network': ['ipv4', 'ipv6', 'mac_address', 'hostname', 'url'],
  'Identity (US)': ['ssn', 'us_itin', 'passport', 'drivers_license'],
  'Identity (UK)': ['uk_nhs', 'uk_nino'],
  'Identity (Intl)': ['au_tfn', 'in_pan', 'sg_nric'],
  'Financial': ['credit_card', 'iban', 'btc_address', 'eth_address'],
  'Tokens & Keys': ['jwt', 'bearer_token', 'aws_access_key', 'aws_secret_key', 'stripe_key', 'gcp_api_key', 'github_token', 'slack_token', 'openai_key', 'anthropic_key', 'xai_key', 'cerebras_key'],
  'Secrets': ['generic_secret', 'high_entropy_secret', 'private_key', 'basic_auth', 'url_credentials', 'session_id'],
  'Location': ['gps_coordinates', 'postcode_uk', 'postcode_us'],
  'Date & Time': ['date_mdy', 'date_dmy', 'date_iso', 'time', 'datetime_iso', 'datetime_clf', 'timestamp_unix'],
  'SQL': ['sql_tables', 'sql_strings', 'sql_identifiers'],
  'Other': ['uuid', 'file_path_unix', 'file_path_windows'],
}

function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true
  
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '')
  const t = target.toLowerCase().replace(/[^a-z0-9]/g, '')
  
  if (t.includes(q)) return true
  
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

interface RuleRowProps {
  label: string
  enabled: boolean
  strategy: ReplacementStrategy
  matchCount?: number
  onToggle: () => void
  onStrategyChange: (strategy: ReplacementStrategy) => void
  onViewPattern: () => void
  onEditTemplate: () => void
}

const RuleRow = memo(function RuleRow({
  label, enabled, strategy, matchCount, onToggle, onStrategyChange, onViewPattern, onEditTemplate
}: RuleRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{label}</span>
        {matchCount !== undefined && matchCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
            {matchCount}
          </span>
        )}
      </label>
      
      <button
        onClick={onViewPattern}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
        title="View regex"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      
      <select
        value={strategy}
        onChange={(e) => onStrategyChange(e.target.value as ReplacementStrategy)}
        disabled={!enabled}
        className="text-xs border dark:border-gray-600 rounded px-1 py-0.5 disabled:opacity-50 w-16 dark:bg-gray-700 dark:text-gray-300"
      >
        {STRATEGY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {strategy === 'template' && (
        <button
          onClick={onEditTemplate}
          className="text-xs text-purple-500 hover:text-purple-700 dark:text-purple-400"
          title="Edit template"
        >
          ✎
        </button>
      )}
    </div>
  )
})

export function RulePanel() {
  const { 
    rules, toggleRule, setRuleStrategy, setRuleTemplate, setAllStrategy, 
    consistencyMode, setConsistencyMode,
    savedPresets, savePreset, loadPreset, deletePreset, importPreset, exportCurrentRules, resetToDefaults,
    customRules, addCustomRule, updateCustomRule, deleteCustomRule, toggleCustomRule, setCustomRuleStrategy,
    plainTextPatterns, addPlainTextPattern, updatePlainTextPattern, deletePlainTextPattern, togglePlainTextPattern, setPlainTextPatternStrategy,
    stats, analysisStats
  } = useAppStore()
  
  const [showStats, setShowStats] = useState(false)
  
  const displayStats = Object.keys(stats).length > 0 ? stats : analysisStats
  const totalDetections = Object.values(displayStats).reduce((sum, count) => sum + count, 0)
  
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Contact': true,
    'Network': true,
    'Identity (US)': true,
    'Identity (UK)': true,
    'Identity (Intl)': true,
    'Financial': true,
    'Tokens & Keys': true,
    'Secrets': true,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [showPresets, setShowPresets] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [viewingPattern, setViewingPattern] = useState<{ id: string; label: string; pattern: string; isCustom?: boolean } | null>(null)
  const [editingCustomRule, setEditingCustomRule] = useState<CustomRule | null>(null)
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [newCustomRule, setNewCustomRule] = useState({ label: '', pattern: '' })
  const [testText, setTestText] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<{ id: string; label: string; template: string } | null>(null)
  const [showAddPlainText, setShowAddPlainText] = useState(false)
  const [newPlainText, setNewPlainText] = useState({ label: '', text: '' })
  const [editingPlainText, setEditingPlainText] = useState<PlainTextPattern | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const testResults = useMemo(() => {
    if (!testText.trim()) return []
    return testPatternAgainstText(testText, BUILTIN_PATTERNS, rules, customRules)
  }, [testText, rules, customRules])

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return CATEGORIES
    
    const result: Record<string, string[]> = {}
    Object.entries(CATEGORIES).forEach(([category, ruleIds]) => {
      const matchingRules = ruleIds.filter(id => {
        const rule = rules[id]
        if (!rule) return false
        return fuzzyMatch(searchQuery, id) || fuzzyMatch(searchQuery, rule.label) || fuzzyMatch(searchQuery, category)
      })
      if (matchingRules.length > 0) {
        result[category] = matchingRules
      }
    })
    return result
  }, [searchQuery, rules])

  const filteredCustomRules = useMemo(() => {
    if (!searchQuery) return customRules
    return customRules.filter(rule => 
      fuzzyMatch(searchQuery, rule.id) || fuzzyMatch(searchQuery, rule.label)
    )
  }, [searchQuery, customRules])

  const filteredPlainTextPatterns = useMemo(() => {
    if (!searchQuery) return plainTextPatterns
    return plainTextPatterns.filter(p => 
      fuzzyMatch(searchQuery, p.id) || fuzzyMatch(searchQuery, p.label) || fuzzyMatch(searchQuery, p.text)
    )
  }, [searchQuery, plainTextPatterns])

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }))
  }

  const toggleAllInCategory = (category: string, enabled: boolean) => {
    CATEGORIES[category].forEach(id => {
      if (rules[id] && rules[id].enabled !== enabled) {
        toggleRule(id)
      }
    })
  }

  const handleSavePreset = () => {
    const name = newPresetName.trim()
    if (!name) return
    savePreset(name)
    setNewPresetName('')
  }

  const handleLoadBuiltinPreset = (preset: BuiltinPreset) => {
    const currentRules = { ...rules }
    
    Object.keys(currentRules).forEach(id => {
      currentRules[id] = { ...currentRules[id], enabled: false }
    })
    
    Object.entries(preset.rules).forEach(([id, updates]) => {
      if (currentRules[id] && updates) {
        currentRules[id] = { ...currentRules[id], ...updates }
      }
    })
    
    Object.keys(currentRules).forEach(id => {
      if (rules[id].enabled !== currentRules[id].enabled) {
        toggleRule(id)
      }
      if (rules[id].strategy !== currentRules[id].strategy) {
        setRuleStrategy(id, currentRules[id].strategy)
      }
    })
    
    if (preset.customRules && preset.customRules.length > 0) {
      preset.customRules.forEach(cr => {
        const existingIdx = customRules.findIndex(r => r.id === cr.id)
        if (existingIdx === -1) {
          addCustomRule({ ...cr, id: `preset_${cr.id}_${Date.now()}` })
        }
      })
    }
  }

  const handleExport = () => {
    const preset = exportCurrentRules()
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'logscrub-rules.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const preset = JSON.parse(event.target?.result as string) as RulePreset
        if (preset.rules && typeof preset.rules === 'object') {
          importPreset({ ...preset, name: preset.name || file.name.replace('.json', ''), customRules: preset.customRules || [] })
        }
      } catch {
        alert('Invalid preset file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleAddCustomRule = () => {
    if (!newCustomRule.label.trim() || !newCustomRule.pattern.trim()) return
    
    try {
      new RegExp(newCustomRule.pattern)
    } catch {
      alert('Invalid regex pattern')
      return
    }
    
    const id = `custom_${Date.now()}`
    addCustomRule({
      id,
      label: newCustomRule.label.trim(),
      pattern: newCustomRule.pattern.trim(),
      enabled: true,
      strategy: 'label'
    })
    setNewCustomRule({ label: '', pattern: '' })
    setShowAddCustom(false)
  }

  const handleSaveEditedCustomRule = () => {
    if (!editingCustomRule) return
    
    try {
      new RegExp(editingCustomRule.pattern)
    } catch {
      alert('Invalid regex pattern')
      return
    }
    
    updateCustomRule(editingCustomRule.id, {
      label: editingCustomRule.label,
      pattern: editingCustomRule.pattern
    })
    setEditingCustomRule(null)
  }

  const handleAddPlainTextPattern = () => {
    if (!newPlainText.label.trim() || !newPlainText.text.trim()) return
    
    const id = `plaintext_${Date.now()}`
    addPlainTextPattern({
      id,
      label: newPlainText.label.trim(),
      text: newPlainText.text.trim(),
      enabled: true,
      strategy: 'label'
    })
    setNewPlainText({ label: '', text: '' })
    setShowAddPlainText(false)
  }

  const handleSaveEditedPlainText = () => {
    if (!editingPlainText) return
    
    updatePlainTextPattern(editingPlainText.id, {
      label: editingPlainText.label,
      text: editingPlainText.text
    })
    setEditingPlainText(null)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h2 className="font-semibold text-gray-900 dark:text-white">Detection Rules</h2>
        {totalDetections > 0 && (
          <button
            onClick={() => setShowStats(true)}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
            title="View detection statistics and audit report"
          >
            <span className="font-medium">{totalDetections}</span>
            <span className="hidden sm:inline">found</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        )}
      </div>
      
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search rules... (e.g. ip4, phone)"
        className="w-full px-3 py-1.5 text-sm border dark:border-gray-600 rounded-md mb-3 dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 flex-shrink-0"
      />
      
      <div className="flex-1 min-h-0 overflow-y-auto">
      
      <div className="flex gap-1 mb-3">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Set all:</span>
        {STRATEGY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setAllStrategy(opt.value)}
            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            title={`Set all enabled rules to use ${opt.label.toLowerCase()} replacement strategy`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800"
          title="Manage rule presets - save, load, or use built-in presets"
        >
          {showPresets ? '▼ Presets' : '▶ Presets'}
        </button>
        <button
          onClick={() => setShowAddCustom(true)}
          className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800"
          title="Add a custom regex pattern for detecting PII"
        >
          + Regex
        </button>
        <button
          onClick={() => setShowAddPlainText(true)}
          className="text-xs px-2 py-1 rounded bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800"
          title="Add exact text to match and replace (e.g., hostnames)"
        >
          + Text
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      {showPresets && (
        <div className="mb-4 p-2 bg-gray-50 dark:bg-gray-900 rounded border dark:border-gray-700 space-y-3">
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Quick Presets</p>
            <div className="flex flex-wrap gap-1">
              {BUILTIN_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => handleLoadBuiltinPreset(preset)}
                  className="text-xs px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/50"
                  title={preset.description}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
          
          <hr className="dark:border-gray-700" />
          
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Your Presets</p>
            <div className="flex gap-1 mb-2">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                placeholder="Save current as..."
                className="flex-1 px-2 py-1 text-xs border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={handleSavePreset}
                disabled={!newPresetName.trim()}
                className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Save current rule configuration as a preset"
              >
                Save
              </button>
            </div>

            {savedPresets.length > 0 ? (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {savedPresets.map((preset) => (
                  <div key={preset.name} className="flex items-center justify-between gap-1 text-xs">
                    <button
                      onClick={() => loadPreset(preset)}
                      className="flex-1 text-left px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 truncate"
                    >
                      {preset.name}
                    </button>
                    <button
                      onClick={() => deletePreset(preset.name)}
                      className="px-1.5 py-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">No saved presets yet</p>
            )}

            <div className="flex gap-1 mt-2 pt-2 border-t dark:border-gray-700">
              <button
                onClick={handleExport}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                title="Export current rule configuration as JSON file"
              >
                Export
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                title="Import rule configuration from JSON file"
              >
                Import
              </button>
              <button
                onClick={resetToDefaults}
                className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                title="Reset all rules to their default enabled/disabled state and strategies"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="space-y-3">
        {filteredCustomRules.length > 0 && (
          <div className="border-b dark:border-gray-700 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-purple-700 dark:text-purple-400">
                Custom Regex ({filteredCustomRules.filter(r => r.enabled).length}/{filteredCustomRules.length})
              </span>
            </div>
            <div className="space-y-2 ml-4">
              {filteredCustomRules.map(rule => (
                <div key={rule.id} className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => toggleCustomRule(rule.id)}
                      className="rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{rule.label}</span>
                    {displayStats[rule.id] > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full">
                        {displayStats[rule.id]}
                      </span>
                    )}
                  </label>

                  <button
                    onClick={() => setEditingCustomRule({ ...rule })}
                    className="text-xs text-purple-500 hover:text-purple-700 dark:hover:text-purple-300 px-1"
                    title="Edit"
                  >
                    ✎
                  </button>

                  <button
                    onClick={() => deleteCustomRule(rule.id)}
                    className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-1"
                    title="Delete"
                  >
                    ✕
                  </button>

                  <select
                    value={rule.strategy}
                    onChange={(e) => setCustomRuleStrategy(rule.id, e.target.value as ReplacementStrategy)}
                    disabled={!rule.enabled}
                    className="text-xs border dark:border-gray-600 rounded px-1 py-0.5 disabled:opacity-50 w-16 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {STRATEGY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredPlainTextPatterns.length > 0 && (
          <div className="border-b dark:border-gray-700 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
                Plain Text ({filteredPlainTextPatterns.filter(p => p.enabled).length}/{filteredPlainTextPatterns.length})
              </span>
            </div>
            <div className="space-y-2 ml-4">
              {filteredPlainTextPatterns.map(pattern => (
                <div key={pattern.id} className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={pattern.enabled}
                      onChange={() => togglePlainTextPattern(pattern.id)}
                      className="rounded border-gray-300 dark:border-gray-600 text-orange-600 focus:ring-orange-500 dark:bg-gray-700"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={pattern.text}>
                      {pattern.label}
                    </span>
                    {displayStats[pattern.id] > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-full">
                        {displayStats[pattern.id]}
                      </span>
                    )}
                  </label>

                  <button
                    onClick={() => setEditingPlainText({ ...pattern })}
                    className="text-xs text-orange-500 hover:text-orange-700 dark:hover:text-orange-300 px-1"
                    title="Edit"
                  >
                    ✎
                  </button>

                  <button
                    onClick={() => deletePlainTextPattern(pattern.id)}
                    className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-1"
                    title="Delete"
                  >
                    ✕
                  </button>

                  <select
                    value={pattern.strategy}
                    onChange={(e) => setPlainTextPatternStrategy(pattern.id, e.target.value as ReplacementStrategy)}
                    disabled={!pattern.enabled}
                    className="text-xs border dark:border-gray-600 rounded px-1 py-0.5 disabled:opacity-50 w-16 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {STRATEGY_OPTIONS.filter(opt => opt.value !== 'fake' && opt.value !== 'template').map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {Object.entries(filteredCategories).map(([category, ruleIds]) => {
          const categoryRules = ruleIds.filter(id => rules[id])
          if (categoryRules.length === 0) return null

          const enabledCount = categoryRules.filter(id => rules[id]?.enabled).length
          const isExpanded = searchQuery ? true : expandedCategories[category]

          return (
            <div key={category} className="border-b dark:border-gray-700 pb-2 last:border-b-0">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                  {category}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({enabledCount}/{categoryRules.length})
                  </span>
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleAllInCategory(category, true)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    title={`Enable all rules in ${category}`}
                  >
                    All
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <button
                    onClick={() => toggleAllInCategory(category, false)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    title={`Disable all rules in ${category}`}
                  >
                    None
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="space-y-2 ml-4">
                  {categoryRules.map(id => {
                    const rule = rules[id]
                    if (!rule) return null

                    return (
                      <RuleRow
                        key={id}
                        label={rule.label}
                        enabled={rule.enabled}
                        strategy={rule.strategy}
                        matchCount={displayStats[id]}
                        onToggle={() => toggleRule(id)}
                        onStrategyChange={(newStrategy) => {
                          setRuleStrategy(id, newStrategy)
                          if (newStrategy === 'template' && !rule.template) {
                            setEditingTemplate({ id, label: rule.label, template: rule.template || `[${id.toUpperCase()}-{n}]` })
                          }
                        }}
                        onViewPattern={() => setViewingPattern({ id, label: rule.label, pattern: BUILTIN_PATTERNS[id] || '' })}
                        onEditTemplate={() => setEditingTemplate({ id, label: rule.label, template: rule.template || `[${id.toUpperCase()}-{n}]` })}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {Object.keys(filteredCategories).length === 0 && filteredCustomRules.length === 0 && searchQuery && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No rules match "{searchQuery}"
          </p>
        )}
      </div>
      </div>

      <hr className="my-3 dark:border-gray-700 flex-shrink-0" />

      <div className="flex-shrink-0">
        <label className="flex items-center gap-2 cursor-pointer" title="When enabled, identical PII values will always be replaced with the same replacement value">
          <input
            type="checkbox"
            checked={consistencyMode}
            onChange={(e) => setConsistencyMode(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Consistency Mode</span>
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
          Same input → same replacement
        </p>
      </div>

      {viewingPattern && (
        <Modal onClose={() => { setViewingPattern(null); setTestText('') }} title={`Pattern: ${viewingPattern.label}`} maxWidth="max-w-3xl">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Regex Pattern
              </label>
              <code className="block p-3 bg-gray-100 dark:bg-gray-900 rounded text-sm font-mono text-gray-800 dark:text-gray-200 break-all whitespace-pre-wrap">
                {viewingPattern.pattern || 'Pattern not available'}
              </code>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Test Pattern
              </label>
              <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="Paste sample text here to test the pattern..."
                rows={4}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm dark:bg-gray-700 dark:text-white placeholder-gray-400"
              />
            </div>

            {testText.trim() && (
              <div className="space-y-3">
                {(() => {
                  const currentRuleMatches = testResults.find(r => r.ruleId === viewingPattern.id)
                  const otherMatches = testResults.filter(r => r.ruleId !== viewingPattern.id)
                  
                  return (
                    <>
                      <div className={`p-3 rounded-lg ${currentRuleMatches ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2 h-2 rounded-full ${currentRuleMatches ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {viewingPattern.label}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {currentRuleMatches ? `${currentRuleMatches.matches.length} match${currentRuleMatches.matches.length > 1 ? 'es' : ''}` : 'No matches'}
                          </span>
                        </div>
                        {currentRuleMatches && (
                          <div className="flex flex-wrap gap-1">
                            {currentRuleMatches.matches.map((m, i) => (
                              <code key={i} className="px-2 py-0.5 bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200 rounded text-xs">
                                {m.length > 50 ? m.slice(0, 50) + '...' : m}
                              </code>
                            ))}
                          </div>
                        )}
                      </div>

                      {otherMatches.length > 0 && (
                        <div className="border-t dark:border-gray-700 pt-3">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                            Other rules that also match:
                          </p>
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {otherMatches.map(result => (
                              <div key={result.ruleId} className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{result.ruleLabel}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {result.matches.length} match{result.matches.length > 1 ? 'es' : ''}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {result.matches.slice(0, 5).map((m, i) => (
                                    <code key={i} className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200 rounded text-xs">
                                      {m.length > 30 ? m.slice(0, 30) + '...' : m}
                                    </code>
                                  ))}
                                  {result.matches.length > 5 && (
                                    <span className="text-xs text-gray-500">+{result.matches.length - 5} more</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Built-in patterns cannot be edited. Create a custom rule to use your own regex.
            </p>
          </div>
        </Modal>
      )}

      {editingCustomRule && (
        <Modal onClose={() => setEditingCustomRule(null)} title="Edit Custom Rule">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rule Name
              </label>
              <input
                type="text"
                value={editingCustomRule.label}
                onChange={(e) => setEditingCustomRule({ ...editingCustomRule, label: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Regex Pattern
              </label>
              <textarea
                value={editingCustomRule.pattern}
                onChange={(e) => setEditingCustomRule({ ...editingCustomRule, pattern: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingCustomRule(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditedCustomRule}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showAddCustom && (
        <Modal onClose={() => setShowAddCustom(false)} title="Add Custom Regex Rule">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Rule Name
              </label>
              <input
                type="text"
                value={newCustomRule.label}
                onChange={(e) => setNewCustomRule({ ...newCustomRule, label: e.target.value })}
                placeholder="e.g. Company IDs"
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Regex Pattern
              </label>
              <textarea
                value={newCustomRule.pattern}
                onChange={(e) => setNewCustomRule({ ...newCustomRule, pattern: e.target.value })}
                placeholder="e.g. \bCOMP-[0-9]{6}\b"
                rows={3}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm dark:bg-gray-700 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Use JavaScript regex syntax. The pattern will be applied with global and case-insensitive flags.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddCustom(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomRule}
                disabled={!newCustomRule.label.trim() || !newCustomRule.pattern.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Rule
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showAddPlainText && (
        <Modal onClose={() => setShowAddPlainText(false)} title="Add Plain Text Pattern">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Label
              </label>
              <input
                type="text"
                value={newPlainText.label}
                onChange={(e) => setNewPlainText({ ...newPlainText, label: e.target.value })}
                placeholder="e.g. Internal Hostname"
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Text to Match
              </label>
              <input
                type="text"
                value={newPlainText.text}
                onChange={(e) => setNewPlainText({ ...newPlainText, text: e.target.value })}
                placeholder="e.g. server.internal.example.com"
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm dark:bg-gray-700 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Exact text to find and replace. Case-insensitive matching.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddPlainText(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPlainTextPattern}
                disabled={!newPlainText.label.trim() || !newPlainText.text.trim()}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Pattern
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editingPlainText && (
        <Modal onClose={() => setEditingPlainText(null)} title="Edit Plain Text Pattern">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Label
              </label>
              <input
                type="text"
                value={editingPlainText.label}
                onChange={(e) => setEditingPlainText({ ...editingPlainText, label: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Text to Match
              </label>
              <input
                type="text"
                value={editingPlainText.text}
                onChange={(e) => setEditingPlainText({ ...editingPlainText, text: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingPlainText(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditedPlainText}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editingTemplate && (
        <Modal onClose={() => setEditingTemplate(null)} title={`Template: ${editingTemplate.label}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Replacement Template
              </label>
              <input
                type="text"
                value={editingTemplate.template}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, template: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm dark:bg-gray-700 dark:text-white"
                placeholder="[{TYPE}-{n}]"
              />
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-xs space-y-2">
              <p className="font-medium text-gray-700 dark:text-gray-300">Available variables:</p>
              <div className="grid grid-cols-2 gap-2 text-gray-600 dark:text-gray-400">
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{n}'}</code> - Counter (1, 2, 3...)</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{type}'}</code> - Type name</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{TYPE}'}</code> - TYPE (uppercase)</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{len}'}</code> - Original length</div>
              </div>
              <p className="text-gray-500 dark:text-gray-500 mt-2">
                Example: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">[REDACTED-{'{TYPE}'}-{'{n}'}]</code> → [REDACTED-EMAIL-1]
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setRuleTemplate(editingTemplate.id, editingTemplate.template)
                  setEditingTemplate(null)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Template
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showStats && (
        <Modal onClose={() => setShowStats(false)} title="Detection Statistics" maxWidth="max-w-lg">
          <Stats />
        </Modal>
      )}
    </div>
  )
}
