import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore, type ReplacementStrategy, type CustomRule, type PlainTextPattern } from '../stores/useAppStore'
import { Modal } from './Modal'
import { BUILTIN_PATTERNS } from '../data/patterns'
import { BUILTIN_PRESETS, type BuiltinPreset } from '../data/presets'

type Tab = 'active' | 'suggestions' | 'custom' | 'context'

const STRATEGY_OPTIONS: { value: ReplacementStrategy; label: string }[] = [
  { value: 'label', label: 'Label' },
  { value: 'realistic', label: 'Fake' },
  { value: 'redact', label: 'Redact' },
  { value: 'template', label: 'Template' },
]

function testPatternAgainstText(text: string, patterns: Record<string, string>, rules: Record<string, { label: string }>, customRules: CustomRule[]): Array<{ ruleId: string; ruleLabel: string; matches: string[] }> {
  const results: Array<{ ruleId: string; ruleLabel: string; matches: string[] }> = []

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

export function Suggestions() {
  const {
    suggestions,
    activeMatches,
    unmatchedRules,
    showSuggestions,
    suggestionsInitialTab,
    lastSuggestionsTab,
    enableSuggestedRule,
    disableActiveMatch,
    enableAllSuggested,
    disableUnmatchedRules,
    contextMatches,
    addContextMatchAsPattern,
    rules,
    setRuleStrategy,
    setAllStrategy,
    setRuleTemplate,
    customRules,
    addCustomRule,
    updateCustomRule,
    deleteCustomRule,
    toggleCustomRule,
    setCustomRuleStrategy,
    plainTextPatterns,
    addPlainTextPattern,
    updatePlainTextPattern,
    deletePlainTextPattern,
    togglePlainTextPattern,
    setPlainTextPatternStrategy,
    savedPresets,
    savePreset,
    loadPreset,
    deletePreset,
    importPreset,
    exportCurrentRules,
    consistencyMode,
    labelFormat,
    setLabelFormat,
    globalTemplate,
    setGlobalTemplate,
  } = useAppStore()

  const [activeTab, setActiveTab] = useState<Tab>('active')
  const [lastSetStrategy, setLastSetStrategy] = useState<ReplacementStrategy | null>(null)
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [showPatternViewer, setShowPatternViewer] = useState<{ id: string; label: string; pattern: string } | null>(null)
  const [patternTestText, setPatternTestText] = useState('')
  const [patternTestResults, setPatternTestResults] = useState<Array<{ ruleId: string; ruleLabel: string; matches: string[] }>>([])
  const [editingTemplate, setEditingTemplate] = useState<{ id: string; label: string; template: string } | null>(null)
  const [showLabelConfig, setShowLabelConfig] = useState(false)
  const [showGlobalTemplate, setShowGlobalTemplate] = useState(false)
  const [editingGlobalTemplate, setEditingGlobalTemplate] = useState(globalTemplate)
  // Preset state
  const [newPresetName, setNewPresetName] = useState('')
  const presetFileInputRef = useRef<HTMLInputElement>(null)
  // Custom rule state
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [newCustomRule, setNewCustomRule] = useState({ label: '', pattern: '', strategy: 'label' as ReplacementStrategy })
  const [editingCustomRule, setEditingCustomRule] = useState<CustomRule | null>(null)
  // Plain text pattern state
  const [showAddPlainText, setShowAddPlainText] = useState(false)
  const [newPlainText, setNewPlainText] = useState({ label: '', text: '' })
  const [editingPlainText, setEditingPlainText] = useState<PlainTextPattern | null>(null)
  // Auto-select the most relevant tab when panel opens
  useEffect(() => {
    if (showSuggestions) {
      if (suggestionsInitialTab) {
        setActiveTab(suggestionsInitialTab)
      } else if (lastSuggestionsTab) {
        setActiveTab(lastSuggestionsTab)
      } else if (suggestions.length > 0) {
        setActiveTab('suggestions')
      } else if (activeMatches.length > 0) {
        setActiveTab('active')
      } else if (contextMatches.length > 0) {
        setActiveTab('context')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSuggestions, suggestionsInitialTab])

  // Track last active tab for persistence
  useEffect(() => {
    if (showSuggestions) {
      useAppStore.setState({ lastSuggestionsTab: activeTab })
    }
  }, [activeTab, showSuggestions])

  // Pattern test handler
  const handlePatternTest = useCallback(() => {
    if (!patternTestText.trim()) {
      setPatternTestResults([])
      return
    }
    const patterns: Record<string, string> = { ...BUILTIN_PATTERNS }
    const results = testPatternAgainstText(patternTestText, patterns, rules, customRules)
    setPatternTestResults(results)
  }, [patternTestText, rules, customRules])

  // Preset handlers
  const handleSavePreset = useCallback(() => {
    const name = newPresetName.trim()
    if (!name) return
    savePreset(name)
    setNewPresetName('')
  }, [newPresetName, savePreset])

  const handleLoadBuiltinPreset = useCallback((preset: BuiltinPreset) => {
    const ruleConfig: Record<string, { label: string; enabled: boolean; strategy: ReplacementStrategy }> = {}
    Object.entries(preset.rules).forEach(([id, updates]) => {
      if (rules[id]) {
        ruleConfig[id] = { ...rules[id], ...updates }
      }
    })
    loadPreset({
      name: preset.name,
      rules: { ...rules, ...ruleConfig },
      customRules: preset.customRules || [],
      consistencyMode
    })
  }, [rules, consistencyMode, loadPreset])

  const handleExport = useCallback(() => {
    const data = exportCurrentRules()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'logscrub-rules.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [exportCurrentRules])

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (data.rules) importPreset(data)
      } catch {}
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [importPreset])

  // Custom rule handlers
  const handleAddCustomRule = useCallback(() => {
    if (!newCustomRule.label.trim() || !newCustomRule.pattern.trim()) return
    try { new RegExp(newCustomRule.pattern) } catch { return }
    addCustomRule({
      id: `custom_${Date.now()}`,
      label: newCustomRule.label.trim(),
      pattern: newCustomRule.pattern,
      enabled: true,
      strategy: newCustomRule.strategy
    })
    setNewCustomRule({ label: '', pattern: '', strategy: 'label' })
    setShowAddCustom(false)
  }, [newCustomRule, addCustomRule])

  const handleSaveEditedCustomRule = useCallback(() => {
    if (!editingCustomRule) return
    updateCustomRule(editingCustomRule.id, {
      label: editingCustomRule.label,
      pattern: editingCustomRule.pattern,
      strategy: editingCustomRule.strategy
    })
    setEditingCustomRule(null)
  }, [editingCustomRule, updateCustomRule])

  // Plain text handlers
  const handleAddPlainText = useCallback(() => {
    if (!newPlainText.label.trim() || !newPlainText.text.trim()) return
    addPlainTextPattern({
      id: `plain_${Date.now()}`,
      label: newPlainText.label.trim(),
      text: newPlainText.text,
      enabled: true,
      strategy: 'label'
    })
    setNewPlainText({ label: '', text: '' })
    setShowAddPlainText(false)
  }, [newPlainText, addPlainTextPattern])

  const handleSaveEditedPlainText = useCallback(() => {
    if (!editingPlainText) return
    updatePlainTextPattern(editingPlainText.id, {
      label: editingPlainText.label,
      text: editingPlainText.text
    })
    setEditingPlainText(null)
  }, [editingPlainText, updatePlainTextPattern])

  if (!showSuggestions) return null

  const renderMatchList = (items: typeof activeMatches, showEnableButton: boolean, showDisableButton: boolean = false) => (
    <div className="space-y-2">
      {items.map(item => {
        const isExpanded = expandedRule === item.id
        const rule = rules[item.id]
        const builtinPattern = BUILTIN_PATTERNS[item.id]

        return (
          <div
            key={item.id}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700 transition-colors"
          >
            <div className="flex items-center justify-between gap-3 p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {item.label}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-full font-medium">
                    {item.count} found
                  </span>
                  {showDisableButton && rule && (
                    <button
                      onClick={() => setExpandedRule(isExpanded ? null : item.id)}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      title="Configure rule"
                    >
                      {isExpanded ? '▼ Settings' : '▶ Settings'}
                    </button>
                  )}
                </div>
                {item.samples.length > 0 && (
                  <div className="flex flex-col gap-1 mt-2">
                    {item.samples.map((sample, i) => (
                      <code
                        key={i}
                        className="text-sm px-2 py-1 bg-gray-50 dark:bg-gray-900 rounded inline-flex items-baseline w-fit max-w-full overflow-hidden"
                        title={`${sample.truncatedBefore ? '…' : ''}${sample.before}${sample.match}${sample.after}${sample.truncatedAfter ? '…' : ''}`}
                      >
                        {sample.truncatedBefore && <span className="text-gray-400 dark:text-gray-500">…</span>}
                        <span className="text-gray-500 dark:text-gray-400">{sample.before}</span>
                        <mark className="bg-yellow-200 dark:bg-yellow-700 text-gray-900 dark:text-yellow-100 font-semibold px-1 rounded">{sample.match}</mark>
                        <span className="text-gray-500 dark:text-gray-400">{sample.after}</span>
                        {sample.truncatedAfter && <span className="text-gray-400 dark:text-gray-500">…</span>}
                      </code>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                {showEnableButton && (
                  <button
                    onClick={() => enableSuggestedRule(item.id)}
                    className="text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                  >
                    Enable
                  </button>
                )}
                {showDisableButton && (
                  <button
                    onClick={() => disableActiveMatch(item.id)}
                    className="text-sm px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
                  >
                    Disable
                  </button>
                )}
              </div>
            </div>

            {/* Expanded per-rule settings */}
            {isExpanded && showDisableButton && rule && (
              <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">Strategy:</label>
                    <select
                      value={rule.strategy}
                      onChange={(e) => {
                        const strategy = e.target.value as ReplacementStrategy
                        setRuleStrategy(item.id, strategy)
                        setLastSetStrategy(strategy)
                      }}
                      className="text-xs border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-300"
                    >
                      {STRATEGY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {lastSetStrategy && lastSetStrategy === rule.strategy && (
                      <button
                        onClick={() => {
                          setAllStrategy(lastSetStrategy)
                          setLastSetStrategy(null)
                        }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:underline"
                      >
                        Set all to {STRATEGY_OPTIONS.find(o => o.value === lastSetStrategy)?.label}
                      </button>
                    )}
                  </div>
                  {rule.strategy === 'template' && (
                    <button
                      onClick={() => setEditingTemplate({ id: item.id, label: item.label, template: rule.template || globalTemplate })}
                      className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50"
                    >
                      Edit Template
                    </button>
                  )}
                  {builtinPattern && (
                    <button
                      onClick={() => setShowPatternViewer({ id: item.id, label: item.label, pattern: builtinPattern })}
                      className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      View Regex
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900">
        {/* Tabs */}
        <div className="flex flex-shrink-0 relative z-10 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-x-auto">
          {([
            { key: 'active' as Tab, label: 'Active Matches', count: activeMatches.length, color: 'green' },
            { key: 'suggestions' as Tab, label: 'Suggestions', count: suggestions.length, color: 'amber' },
            { key: 'custom' as Tab, label: 'Custom Rules', count: customRules.length + plainTextPatterns.length, color: 'purple' },
            { key: 'context' as Tab, label: 'Context-Aware', count: contextMatches.length, color: 'purple' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-0 px-3 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-green-700 dark:text-green-400 bg-white dark:bg-gray-900'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <span className="truncate">{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                    activeTab === tab.key
                      ? `bg-${tab.color}-100 dark:bg-${tab.color}-900/50 text-${tab.color}-700 dark:text-${tab.color}-300`
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </span>
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {/* ==================== ACTIVE MATCHES TAB ==================== */}
          {activeTab === 'active' && (
            <div className="space-y-4">
              {/* Preset & Config buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowLabelConfig(true)}
                  className="text-xs px-2.5 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Label Format: {labelFormat.prefix}...{labelFormat.suffix}
                </button>
                <button
                  onClick={() => { setEditingGlobalTemplate(globalTemplate); setShowGlobalTemplate(true) }}
                  className="text-xs px-2.5 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Global Template
                </button>
              </div>

              {/* Preset management */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700 space-y-3">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Quick Presets</p>
                <div className="flex flex-wrap gap-1.5">
                  {BUILTIN_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => handleLoadBuiltinPreset(preset)}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors"
                      title={preset.description}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5 pt-2 border-t dark:border-gray-700">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                    placeholder="Save current as..."
                    className="flex-1 px-2.5 py-1.5 text-xs border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white"
                  />
                  <button onClick={handleSavePreset} disabled={!newPresetName.trim()} className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Save</button>
                  <button onClick={handleExport} className="text-xs px-2.5 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">Export</button>
                  <button onClick={() => presetFileInputRef.current?.click()} className="text-xs px-2.5 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">Import</button>
                  <input ref={presetFileInputRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
                </div>
                {savedPresets.length > 0 && (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {savedPresets.map(preset => (
                      <div key={preset.name} className="flex items-center justify-between gap-1.5 text-xs">
                        <button onClick={() => loadPreset(preset)} className="flex-1 text-left px-2.5 py-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 truncate">{preset.name}</button>
                        <button onClick={() => deletePreset(preset.name)} className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded" title="Delete preset">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {activeMatches.length > 0 ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    These enabled rules found matches. Click Settings to configure per-rule strategy. Disable any false positives.
                  </p>
                  {renderMatchList(activeMatches, false, true)}
                </>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>No enabled rules found matches.</p>
                  <p className="text-sm mt-1">Run Analyze on your text to see detections here.</p>
                </div>
              )}

              {unmatchedRules.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{unmatchedRules.length}</span> enabled rule{unmatchedRules.length !== 1 ? 's' : ''} had no matches
                    </p>
                    <button
                      onClick={disableUnmatchedRules}
                      className="text-sm px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      Disable Unused Rules
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== SUGGESTIONS TAB ==================== */}
          {activeTab === 'suggestions' && (
            <div className="space-y-4">
              {suggestions.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      These disabled rules would find matches if enabled. Review and enable the ones you need.
                    </p>
                    <button
                      onClick={enableAllSuggested}
                      className="flex-shrink-0 ml-3 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                    >
                      Enable All
                    </button>
                  </div>
                  {renderMatchList(suggestions, true)}
                  <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                    <strong>Note:</strong> These suggestions may include false positives. Only enable rules that match actual sensitive data.
                  </p>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <p>No additional rules would find matches.</p>
                </div>
              )}
            </div>
          )}

          {/* ==================== CUSTOM RULES TAB ==================== */}
          {activeTab === 'custom' && (
            <div className="space-y-6">
              {/* Custom Regex Rules */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-purple-700 dark:text-purple-400">Custom Regex Rules ({customRules.length})</h3>
                  <button
                    onClick={() => setShowAddCustom(true)}
                    className="text-xs px-3 py-1.5 rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                  >
                    + Add Regex
                  </button>
                </div>
                {customRules.length > 0 ? (
                  <div className="space-y-2">
                    {customRules.map(rule => (
                      <div key={rule.id} className="flex items-center justify-between gap-2 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                        <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => toggleCustomRule(rule.id)}
                            className="rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500 bg-white dark:bg-gray-700"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{rule.label}</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={rule.strategy}
                            onChange={(e) => setCustomRuleStrategy(rule.id, e.target.value as ReplacementStrategy)}
                            disabled={!rule.enabled}
                            className="text-xs border dark:border-gray-600 rounded px-1.5 py-1 disabled:opacity-50 bg-white dark:bg-gray-700 dark:text-gray-300"
                          >
                            {STRATEGY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                          <button onClick={() => setEditingCustomRule({ ...rule })} className="p-1 text-purple-500 hover:text-purple-700 dark:hover:text-purple-300 rounded" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => deleteCustomRule(rule.id)} className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-300 rounded" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No custom regex rules yet.</p>
                )}
              </div>

              <hr className="dark:border-gray-700" />

              {/* Plain Text Patterns */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-orange-700 dark:text-orange-400">Plain Text Patterns ({plainTextPatterns.length})</h3>
                  <button
                    onClick={() => setShowAddPlainText(true)}
                    className="text-xs px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 transition-colors"
                  >
                    + Add Text
                  </button>
                </div>
                {plainTextPatterns.length > 0 ? (
                  <div className="space-y-2">
                    {plainTextPatterns.map(pattern => (
                      <div key={pattern.id} className="flex items-center justify-between gap-2 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                        <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={pattern.enabled}
                            onChange={() => togglePlainTextPattern(pattern.id)}
                            className="rounded border-gray-300 dark:border-gray-600 text-orange-600 focus:ring-orange-500 bg-white dark:bg-gray-700"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={pattern.text}>{pattern.label}</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={pattern.strategy}
                            onChange={(e) => setPlainTextPatternStrategy(pattern.id, e.target.value as ReplacementStrategy)}
                            disabled={!pattern.enabled}
                            className="text-xs border dark:border-gray-600 rounded px-1.5 py-1 disabled:opacity-50 bg-white dark:bg-gray-700 dark:text-gray-300"
                          >
                            {STRATEGY_OPTIONS.filter(opt => opt.value !== 'realistic' && opt.value !== 'template').map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button onClick={() => setEditingPlainText({ ...pattern })} className="p-1 text-orange-500 hover:text-orange-700 dark:hover:text-orange-300 rounded" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => deletePlainTextPattern(pattern.id)} className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-300 rounded" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No plain text patterns yet.</p>
                )}
              </div>
            </div>
          )}

          {/* ==================== CONTEXT-AWARE TAB ==================== */}
          {activeTab === 'context' && (
            <div className="space-y-4">
              {contextMatches.length > 0 ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Potential secrets found via JSON key analysis (e.g., "password", "token", "api_key").
                  </p>
                  <div className="space-y-2">
                    {contextMatches.map((match, index) => (
                      <div
                        key={`${match.start}-${match.end}-${index}`}
                        className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 dark:text-white">{match.key}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              match.confidence === 'high'
                                ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                            }`}>{match.confidence}</span>
                            <code className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">{match.path}</code>
                          </div>
                          <div className="mt-2">
                            <code className="text-sm px-2 py-1 bg-gray-50 dark:bg-gray-900 rounded inline-block max-w-full overflow-hidden text-ellipsis">
                              <mark className="bg-purple-200 dark:bg-purple-800 text-gray-900 dark:text-purple-100 font-medium px-1 rounded">
                                {match.value.length > 60 ? match.value.slice(0, 60) + '...' : match.value}
                              </mark>
                            </code>
                          </div>
                        </div>
                        <button
                          onClick={() => addContextMatchAsPattern(match)}
                          className="flex-shrink-0 text-sm px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors"
                        >
                          Add to Scrub
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p>No JSON-based secrets detected.</p>
                  <p className="text-sm mt-1">This tab analyzes JSON structures for suspicious key names.</p>
                </div>
              )}
            </div>
          )}

        </div>

      {/* ==================== SUB-MODALS ==================== */}

      {/* Pattern Viewer */}
      {showPatternViewer && (
        <Modal onClose={() => { setShowPatternViewer(null); setPatternTestText(''); setPatternTestResults([]) }} title={`Pattern: ${showPatternViewer.label}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Regex Pattern</label>
              <pre className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm font-mono break-all whitespace-pre-wrap border dark:border-gray-700">
                {showPatternViewer.pattern}
              </pre>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Test Input</label>
              <textarea
                value={patternTestText}
                onChange={(e) => setPatternTestText(e.target.value)}
                placeholder="Paste text to test this pattern..."
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white resize-y min-h-[80px]"
              />
              <button
                onClick={handlePatternTest}
                disabled={!patternTestText.trim()}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                Test Pattern
              </button>
            </div>
            {patternTestResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {patternTestResults.reduce((sum, r) => sum + r.matches.length, 0)} matches found
                </p>
                {patternTestResults.map(r => (
                  <div key={r.ruleId} className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">{r.ruleLabel}</span>
                    <span className="text-gray-500 dark:text-gray-400"> ({r.matches.length})</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.matches.map((m, i) => (
                        <code key={i} className="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900/50 rounded">{m}</code>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Template Editor */}
      {editingTemplate && (
        <Modal onClose={() => setEditingTemplate(null)} title={`Template: ${editingTemplate.label}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Replacement Template</label>
              <input
                type="text"
                value={editingTemplate.template}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, template: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white"
                placeholder="[{TYPE}-{n}]"
              />
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-xs space-y-2">
              <p className="font-medium text-gray-700 dark:text-gray-300">Available variables:</p>
              <div className="grid grid-cols-2 gap-2 text-gray-600 dark:text-gray-400">
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{n}'}</code> - Counter</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{type}'}</code> - Type name</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{TYPE}'}</code> - TYPE (uppercase)</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{len}'}</code> - Original length</div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingTemplate(null)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
              <button
                onClick={() => { setRuleTemplate(editingTemplate.id, editingTemplate.template); setEditingTemplate(null) }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Template
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Label Format Config */}
      {showLabelConfig && (
        <Modal onClose={() => setShowLabelConfig(false)} title="Label Format">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prefix</label>
                <input type="text" value={labelFormat.prefix} onChange={(e) => setLabelFormat({ ...labelFormat, prefix: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white" placeholder="[" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Suffix</label>
                <input type="text" value={labelFormat.suffix} onChange={(e) => setLabelFormat({ ...labelFormat, suffix: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white" placeholder="]" />
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-sm">
              <p className="text-gray-600 dark:text-gray-400">Preview: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{labelFormat.prefix}EMAIL-1{labelFormat.suffix}</code></p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quick presets:</p>
              <div className="flex gap-2">
                <button onClick={() => setLabelFormat({ prefix: '[', suffix: ']' })} className="px-3 py-1.5 text-sm rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300">[ ]</button>
                <button onClick={() => setLabelFormat({ prefix: '{{', suffix: '}}' })} className="px-3 py-1.5 text-sm rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300">{'{{ }}'}</button>
                <button onClick={() => setLabelFormat({ prefix: '<', suffix: '>' })} className="px-3 py-1.5 text-sm rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300">{'< >'}</button>
                <button onClick={() => setLabelFormat({ prefix: '', suffix: '' })} className="px-3 py-1.5 text-sm rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300">None</button>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowLabelConfig(false)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Done</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Global Template Config */}
      {showGlobalTemplate && (
        <Modal onClose={() => setShowGlobalTemplate(false)} title="Global Template Format">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Format</label>
              <input
                type="text"
                value={editingGlobalTemplate}
                onChange={(e) => setEditingGlobalTemplate(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white"
                placeholder="[{TYPE}-{n}]"
              />
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-sm">
              <p className="text-gray-600 dark:text-gray-400">Preview: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{editingGlobalTemplate.replace('{n}', '1').replace('{type}', 'email').replace('{TYPE}', 'EMAIL').replace('{len}', '15')}</code></p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-xs space-y-2">
              <p className="font-medium text-gray-700 dark:text-gray-300">Available variables:</p>
              <div className="grid grid-cols-2 gap-2 text-gray-600 dark:text-gray-400">
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{n}'}</code> - Counter</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{type}'}</code> - Type name</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{TYPE}'}</code> - TYPE (uppercase)</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{len}'}</code> - Original length</div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowGlobalTemplate(false)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
              <button onClick={() => { setGlobalTemplate(editingGlobalTemplate); setShowGlobalTemplate(false) }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Template</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Custom Rule Modal */}
      {showAddCustom && (
        <Modal onClose={() => setShowAddCustom(false)} title="Add Custom Regex Rule">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
              <input type="text" value={newCustomRule.label} onChange={(e) => setNewCustomRule({ ...newCustomRule, label: e.target.value })} placeholder="e.g. Internal Server ID" className="w-full px-3 py-2 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Regex Pattern</label>
              <input type="text" value={newCustomRule.pattern} onChange={(e) => setNewCustomRule({ ...newCustomRule, pattern: e.target.value })} placeholder="e.g. SRV-\d{4,}" className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white" />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">JavaScript regex syntax. Do not include slashes.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Strategy</label>
              <select value={newCustomRule.strategy} onChange={(e) => setNewCustomRule({ ...newCustomRule, strategy: e.target.value as ReplacementStrategy })} className="w-full px-3 py-2 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white">
                {STRATEGY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddCustom(false)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
              <button onClick={handleAddCustomRule} disabled={!newCustomRule.label.trim() || !newCustomRule.pattern.trim()} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">Add Rule</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Custom Rule Modal */}
      {editingCustomRule && (
        <Modal onClose={() => setEditingCustomRule(null)} title="Edit Custom Rule">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
              <input type="text" value={editingCustomRule.label} onChange={(e) => setEditingCustomRule({ ...editingCustomRule, label: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Regex Pattern</label>
              <input type="text" value={editingCustomRule.pattern} onChange={(e) => setEditingCustomRule({ ...editingCustomRule, pattern: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingCustomRule(null)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
              <button onClick={handleSaveEditedCustomRule} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Plain Text Modal */}
      {showAddPlainText && (
        <Modal onClose={() => setShowAddPlainText(false)} title="Add Plain Text Pattern">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
              <input type="text" value={newPlainText.label} onChange={(e) => setNewPlainText({ ...newPlainText, label: e.target.value })} placeholder="e.g. Internal Hostname" className="w-full px-3 py-2 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Text to Match</label>
              <input type="text" value={newPlainText.text} onChange={(e) => setNewPlainText({ ...newPlainText, text: e.target.value })} placeholder="e.g. server.internal.example.com" className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white" />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Exact text to find and replace. Case-insensitive matching.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddPlainText(false)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
              <button onClick={handleAddPlainText} disabled={!newPlainText.label.trim() || !newPlainText.text.trim()} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed">Add Pattern</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Plain Text Modal */}
      {editingPlainText && (
        <Modal onClose={() => setEditingPlainText(null)} title="Edit Plain Text Pattern">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
              <input type="text" value={editingPlainText.label} onChange={(e) => setEditingPlainText({ ...editingPlainText, label: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Text to Match</label>
              <input type="text" value={editingPlainText.text} onChange={(e) => setEditingPlainText({ ...editingPlainText, text: e.target.value })} className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingPlainText(null)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
              <button onClick={handleSaveEditedPlainText} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
