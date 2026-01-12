import { useState, useRef, useMemo, memo, useEffect } from 'react'
import { useAppStore, type ReplacementStrategy, type RulePreset, type CustomRule, type PlainTextPattern } from '../stores/useAppStore'
import { Modal } from './Modal'
import { BUILTIN_PATTERNS } from '../data/patterns'
import { BUILTIN_PRESETS, type BuiltinPreset } from '../data/presets'
import { Stats } from './Stats'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
  'Contact': ['email', 'phone_us', 'phone_uk', 'phone_intl'],
  'Network': ['ipv4', 'ipv6', 'mac_address', 'hostname', 'url', 'url_params'],
  'Identity (US)': ['ssn', 'us_itin', 'passport', 'drivers_license'],
  'Identity (UK)': ['uk_nhs', 'uk_nino'],
  'Identity (Intl)': ['au_tfn', 'in_pan', 'sg_nric'],
  'Financial': ['credit_card', 'iban', 'btc_address', 'eth_address', 'money'],
  'Tokens & Keys': ['jwt', 'bearer_token', 'aws_access_key', 'aws_secret_key', 'stripe_key', 'gcp_api_key', 'github_token', 'slack_token', 'openai_key', 'anthropic_key', 'xai_key', 'cerebras_key'],
  'Secrets': ['generic_secret', 'high_entropy_secret', 'private_key', 'basic_auth', 'url_credentials', 'session_id'],
  'Location': ['gps_coordinates', 'postcode_uk', 'postcode_us'],
  'Date & Time': ['date_mdy', 'date_dmy', 'date_iso', 'time', 'datetime_iso', 'datetime_clf', 'timestamp_unix'],
  'SQL': ['sql_tables', 'sql_strings', 'sql_identifiers'],
  'Exim': ['exim_subject', 'exim_sender', 'exim_auth', 'exim_user', 'exim_dn'],
  'Postfix': ['postfix_from', 'postfix_to', 'postfix_relay', 'postfix_sasl'],
  'Dovecot': ['dovecot_user', 'dovecot_rip', 'dovecot_lip'],
  'Sendmail': ['sendmail_from', 'sendmail_relay', 'sendmail_msgid'],
  'SIP/VoIP': ['sip_username', 'sip_realm', 'sip_nonce', 'sip_response', 'sip_from_display', 'sip_to_display', 'sip_contact', 'sip_uri', 'sip_call_id', 'sip_branch', 'sip_user_agent', 'sip_via'],
  'Hashes': ['md5_hash', 'sha1_hash', 'sha256_hash', 'docker_container_id'],
  'Other': ['uuid', 'email_message_id', 'file_path_unix', 'file_path_windows'],
}

const DEFAULT_CATEGORY_ORDER = Object.keys(CATEGORIES)
const CATEGORY_ORDER_STORAGE_KEY = 'logscrub_category_order'
const RULE_ORDER_STORAGE_KEY = 'logscrub_rule_order'

interface RuleOrderMap {
  [category: string]: string[]
}

function loadCategoryOrder(): string[] {
  try {
    const stored = localStorage.getItem(CATEGORY_ORDER_STORAGE_KEY)
    if (stored) {
      const order = JSON.parse(stored) as string[]
      const allCategories = Object.keys(CATEGORIES)
      const validOrder = order.filter(c => allCategories.includes(c))
      const newCategories = allCategories.filter(c => !validOrder.includes(c))
      return [...validOrder, ...newCategories]
    }
  } catch {}
  return DEFAULT_CATEGORY_ORDER
}

function saveCategoryOrder(order: string[]) {
  localStorage.setItem(CATEGORY_ORDER_STORAGE_KEY, JSON.stringify(order))
}

function loadRuleOrder(): RuleOrderMap {
  try {
    const stored = localStorage.getItem(RULE_ORDER_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored) as RuleOrderMap
    }
  } catch {}
  return {}
}

function saveRuleOrder(order: RuleOrderMap) {
  localStorage.setItem(RULE_ORDER_STORAGE_KEY, JSON.stringify(order))
}

function getRulesInOrder(category: string, ruleOrderMap: RuleOrderMap): string[] {
  const defaultOrder = CATEGORIES[category] || []
  const customOrder = ruleOrderMap[category]
  if (!customOrder) return defaultOrder

  // Merge: use custom order for known rules, append any new rules
  const validOrder = customOrder.filter(r => defaultOrder.includes(r))
  const newRules = defaultOrder.filter(r => !validOrder.includes(r))
  return [...validOrder, ...newRules]
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
  strategyOptions?: { value: ReplacementStrategy; label: string }[]
}

const RuleRow = memo(function RuleRow({
  label, enabled, strategy, matchCount, onToggle, onStrategyChange, onViewPattern, onEditTemplate,
  strategyOptions = STRATEGY_OPTIONS
}: RuleRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
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
        aria-label="Replacement strategy"
        className="text-xs border dark:border-gray-600 rounded px-1 py-0.5 disabled:opacity-50 w-16 bg-white dark:bg-gray-700 dark:text-gray-300"
      >
        {strategyOptions.map((opt) => (
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

// Sortable rule item within a category
interface SortableRuleItemProps {
  id: string
  category: string
  rule: { label: string; enabled: boolean; strategy: ReplacementStrategy; template?: string }
  matchCount?: number
  onToggle: () => void
  onStrategyChange: (strategy: ReplacementStrategy) => void
  onViewPattern: () => void
  onEditTemplate: () => void
  isDragDisabled?: boolean
  strategyOptions?: { value: ReplacementStrategy; label: string }[]
}

function SortableRuleItem({
  id, rule, matchCount, onToggle, onStrategyChange, onViewPattern, onEditTemplate, isDragDisabled,
  strategyOptions
}: SortableRuleItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isDragDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      {!isDragDisabled && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 select-none text-xs touch-none"
          title="Drag to reorder"
        >
          ⋮
        </button>
      )}
      <div className="flex-1">
        <RuleRow
          label={rule.label}
          enabled={rule.enabled}
          strategy={rule.strategy}
          matchCount={matchCount}
          onToggle={onToggle}
          onStrategyChange={onStrategyChange}
          onViewPattern={onViewPattern}
          onEditTemplate={onEditTemplate}
          strategyOptions={strategyOptions}
        />
      </div>
    </div>
  )
}

// Sortable category item
interface SortableCategoryItemProps {
  id: string
  isExpanded: boolean
  enabledCount: number
  totalCount: number
  isDragDisabled?: boolean
  onToggleExpand: () => void
  onEnableAll: () => void
  onDisableAll: () => void
  children: React.ReactNode
}

function SortableCategoryItem({
  id, isExpanded, enabledCount, totalCount, isDragDisabled, onToggleExpand, onEnableAll, onDisableAll, children
}: SortableCategoryItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isDragDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-b dark:border-gray-700 pb-2 last:border-b-0"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          {!isDragDisabled && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 select-none px-0.5 touch-none"
              title="Drag to reorder category"
            >
              ⋮⋮
            </button>
          )}
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
              ▶
            </span>
            {id}
            <span className="text-xs text-gray-600 dark:text-gray-400">
              ({enabledCount}/{totalCount})
            </span>
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEnableAll}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            title={`Enable all rules in ${id}`}
          >
            All
          </button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <button
            onClick={onDisableAll}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            title={`Disable all rules in ${id}`}
          >
            None
          </button>
        </div>
      </div>
      {isExpanded && children}
    </div>
  )
}

export function RulePanel() {
  const {
    rules, toggleRule, setRuleStrategy, setRuleTemplate, setAllStrategy,
    consistencyMode, setConsistencyMode,
    savedPresets, loadPreset, deletePreset, importPreset, exportCurrentRules, resetToDefaults,
    customRules, addCustomRule, updateCustomRule, deleteCustomRule, toggleCustomRule, setCustomRuleStrategy,
    plainTextPatterns, addPlainTextPattern, updatePlainTextPattern, deletePlainTextPattern, togglePlainTextPattern, setPlainTextPatternStrategy,
    stats, analysisStats,
    labelFormat, setLabelFormat,
    globalTemplate, setGlobalTemplate,
    documentType
  } = useAppStore()
  
  // Filter strategy options for document types (PDF only supports redact)
  const filteredStrategyOptions = useMemo(() => {
    if (documentType === 'pdf') {
      return STRATEGY_OPTIONS.filter(opt => opt.value === 'redact')
    }
    return STRATEGY_OPTIONS
  }, [documentType])

  const [showStats, setShowStats] = useState(false)
  const [categoryOrder, setCategoryOrder] = useState<string[]>(loadCategoryOrder)
  const [ruleOrderMap, setRuleOrderMap] = useState<RuleOrderMap>(loadRuleOrder)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeRule, setActiveRule] = useState<{ category: string; ruleId: string } | null>(null)

  // @dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

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
  const [showLabelConfig, setShowLabelConfig] = useState(false)
  const [showGlobalTemplateConfig, setShowGlobalTemplateConfig] = useState(false)
  const [editingGlobalTemplate, setEditingGlobalTemplate] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Close label config on ESC
  useEffect(() => {
    if (!showLabelConfig) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        setShowLabelConfig(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showLabelConfig])

  // Initialize and close global template config
  useEffect(() => {
    if (showGlobalTemplateConfig) {
      setEditingGlobalTemplate(globalTemplate)
    }
  }, [showGlobalTemplateConfig, globalTemplate])

  useEffect(() => {
    if (!showGlobalTemplateConfig) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowGlobalTemplateConfig(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showGlobalTemplateConfig])

  const testResults = useMemo(() => {
    if (!testText.trim()) return []
    return testPatternAgainstText(testText, BUILTIN_PATTERNS, rules, customRules)
  }, [testText, rules, customRules])

  const filteredCategories = useMemo(() => {
    const result: Record<string, string[]> = {}

    // Use category order for iteration
    for (const category of categoryOrder) {
      if (!CATEGORIES[category]) continue

      // Get rules in custom order
      const ruleIds = getRulesInOrder(category, ruleOrderMap)

      if (!searchQuery) {
        result[category] = ruleIds
      } else {
        const matchingRules = ruleIds.filter(id => {
          const rule = rules[id]
          if (!rule) return false
          return fuzzyMatch(searchQuery, id) || fuzzyMatch(searchQuery, rule.label) || fuzzyMatch(searchQuery, category)
        })
        if (matchingRules.length > 0) {
          result[category] = matchingRules
        }
      }
    }
    return result
  }, [searchQuery, rules, categoryOrder, ruleOrderMap])

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

  // @dnd-kit handlers for categories
  const handleCategoryDragStart = (event: DragStartEvent) => {
    setActiveCategory(event.active.id as string)
  }

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveCategory(null)

    if (over && active.id !== over.id) {
      const oldIndex = categoryOrder.indexOf(active.id as string)
      const newIndex = categoryOrder.indexOf(over.id as string)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = [...categoryOrder]
        newOrder.splice(oldIndex, 1)
        newOrder.splice(newIndex, 0, active.id as string)
        setCategoryOrder(newOrder)
        saveCategoryOrder(newOrder)
      }
    }
  }

  // @dnd-kit handlers for rules within a category
  const handleRuleDragStart = (event: DragStartEvent, category: string) => {
    setActiveRule({ category, ruleId: event.active.id as string })
  }

  const handleRuleDragEnd = (event: DragEndEvent, category: string) => {
    const { active, over } = event
    setActiveRule(null)

    if (over && active.id !== over.id) {
      const currentOrder = getRulesInOrder(category, ruleOrderMap)
      const oldIndex = currentOrder.indexOf(active.id as string)
      const newIndex = currentOrder.indexOf(over.id as string)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = [...currentOrder]
        newOrder.splice(oldIndex, 1)
        newOrder.splice(newIndex, 0, active.id as string)
        setRuleOrderMap(prev => ({ ...prev, [category]: newOrder }))
        saveRuleOrder({ ...ruleOrderMap, [category]: newOrder })
      }
    }
  }

  const handleSavePreset = () => {
    const name = newPresetName.trim()
    if (!name) return
    // Save current ordering to the preset
    const preset = exportCurrentRules()
    preset.name = name
    preset.categoryOrder = categoryOrder
    preset.ruleOrder = ruleOrderMap
    // Use importPreset to save with ordering
    importPreset(preset)
    setNewPresetName('')
  }

  const handleLoadUserPreset = (preset: RulePreset) => {
    loadPreset(preset)
    // Reload ordering from localStorage (which loadPreset just updated)
    if (preset.categoryOrder) {
      setCategoryOrder(preset.categoryOrder)
    }
    if (preset.ruleOrder) {
      setRuleOrderMap(preset.ruleOrder)
    }
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
        aria-label="Search detection rules"
        className="w-full px-3 py-1.5 text-sm border dark:border-gray-600 rounded-md mb-3 bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 flex-shrink-0"
      />
      
      <div className="flex-1 min-h-0 overflow-y-auto">
      
      <div className="flex gap-1 mb-3">
        <span className="text-xs text-gray-600 dark:text-gray-400 mr-1">Set all:</span>
        {filteredStrategyOptions.map((opt) => (
          opt.value === 'label' ? (
            <div key={opt.value} className="relative flex">
              <button
                onClick={() => setAllStrategy(opt.value)}
                className="text-xs px-2 py-1 rounded-l bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                title={`Set all enabled rules to use ${opt.label.toLowerCase()} replacement strategy`}
              >
                {opt.label}
              </button>
              <button
                onClick={() => setShowLabelConfig(!showLabelConfig)}
                className="text-xs px-1 py-1 rounded-r bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 border-l border-gray-200 dark:border-gray-600"
                title="Configure label format"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
          ) : opt.value === 'template' ? (
            <div key={opt.value} className="relative flex">
              <button
                onClick={() => setAllStrategy(opt.value)}
                className="text-xs px-2 py-1 rounded-l bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                title={`Set all enabled rules to use ${opt.label.toLowerCase()} replacement strategy`}
              >
                {opt.label}
              </button>
              <button
                onClick={() => setShowGlobalTemplateConfig(!showGlobalTemplateConfig)}
                className="text-xs px-1 py-1 rounded-r bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 border-l border-gray-200 dark:border-gray-600"
                title="Configure global template format"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              key={opt.value}
              onClick={() => setAllStrategy(opt.value)}
              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              title={`Set all enabled rules to use ${opt.label.toLowerCase()} replacement strategy`}
            >
              {opt.label}
            </button>
          )
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
          aria-label="Import preset file"
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
                className="flex-1 px-2 py-1 text-xs border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
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
                      onClick={() => handleLoadUserPreset(preset)}
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
              <p className="text-xs text-gray-600 dark:text-gray-400">No saved presets yet</p>
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
                className="text-xs px-2 py-1 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
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
                      className="rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500 bg-white dark:bg-gray-700"
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
                    aria-label="Replacement strategy"
                    className="text-xs border dark:border-gray-600 rounded px-1 py-0.5 disabled:opacity-50 w-16 bg-white dark:bg-gray-700 dark:text-gray-300"
                  >
                    {filteredStrategyOptions.map((opt) => (
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
                      className="rounded border-gray-300 dark:border-gray-600 text-orange-600 focus:ring-orange-500 bg-white dark:bg-gray-700"
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
                    aria-label="Replacement strategy"
                    className="text-xs border dark:border-gray-600 rounded px-1 py-0.5 disabled:opacity-50 w-16 bg-white dark:bg-gray-700 dark:text-gray-300"
                  >
                    {filteredStrategyOptions.filter(opt => opt.value !== 'fake' && opt.value !== 'template').map((opt) => (
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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleCategoryDragStart}
          onDragEnd={handleCategoryDragEnd}
        >
          <SortableContext items={categoryOrder} strategy={verticalListSortingStrategy}>
            {Object.entries(filteredCategories).map(([category, ruleIds]) => {
              const categoryRules = ruleIds.filter(id => rules[id])
              if (categoryRules.length === 0) return null

              const enabledCount = categoryRules.filter(id => rules[id]?.enabled).length
              const isExpanded = searchQuery ? true : expandedCategories[category]

              return (
                <SortableCategoryItem
                  key={category}
                  id={category}
                  isExpanded={isExpanded}
                  enabledCount={enabledCount}
                  totalCount={categoryRules.length}
                  isDragDisabled={!!searchQuery}
                  onToggleExpand={() => toggleCategory(category)}
                  onEnableAll={() => toggleAllInCategory(category, true)}
                  onDisableAll={() => toggleAllInCategory(category, false)}
                >
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={(e) => handleRuleDragStart(e, category)}
                    onDragEnd={(e) => handleRuleDragEnd(e, category)}
                  >
                    <SortableContext items={categoryRules} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1 ml-4">
                        {categoryRules.map(id => {
                          const rule = rules[id]
                          if (!rule) return null

                          return (
                            <SortableRuleItem
                              key={id}
                              id={id}
                              category={category}
                              rule={rule}
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
                              isDragDisabled={!!searchQuery}
                              strategyOptions={filteredStrategyOptions}
                            />
                          )
                        })}
                      </div>
                    </SortableContext>
                    <DragOverlay>
                      {activeRule?.category === category && activeRule?.ruleId && rules[activeRule.ruleId] && (
                        <div className="bg-white dark:bg-gray-800 shadow-lg rounded p-1 border dark:border-gray-600">
                          <RuleRow
                            label={rules[activeRule.ruleId].label}
                            enabled={rules[activeRule.ruleId].enabled}
                            strategy={rules[activeRule.ruleId].strategy}
                            matchCount={displayStats[activeRule.ruleId]}
                            onToggle={() => {}}
                            onStrategyChange={() => {}}
                            onViewPattern={() => {}}
                            onEditTemplate={() => {}}
                            strategyOptions={filteredStrategyOptions}
                          />
                        </div>
                      )}
                    </DragOverlay>
                  </DndContext>
                </SortableCategoryItem>
              )
            })}
          </SortableContext>
          <DragOverlay>
            {activeCategory && filteredCategories[activeCategory] && (
              <div className="bg-white dark:bg-gray-800 shadow-lg rounded p-3 border dark:border-gray-600 opacity-90">
                <div className="flex items-center gap-1 mb-2">
                  <span className="text-gray-400 px-0.5">⋮⋮</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    ▶ {activeCategory}
                    <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">
                      ({filteredCategories[activeCategory].filter(id => rules[id]?.enabled).length}/{filteredCategories[activeCategory].length})
                    </span>
                  </span>
                </div>
                <div className="space-y-1 ml-4 max-h-48 overflow-hidden">
                  {filteredCategories[activeCategory].slice(0, 5).map(id => {
                    const rule = rules[id]
                    if (!rule) return null
                    return (
                      <div key={id} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-300 dark:text-gray-600 text-xs">⋮</span>
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          readOnly
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 bg-white dark:bg-gray-700 pointer-events-none"
                        />
                        <span className="text-gray-700 dark:text-gray-300 truncate">{rule.label}</span>
                      </div>
                    )
                  })}
                  {filteredCategories[activeCategory].length > 5 && (
                    <div className="text-xs text-gray-600 dark:text-gray-400 ml-5">
                      +{filteredCategories[activeCategory].length - 5} more...
                    </div>
                  )}
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {Object.keys(filteredCategories).length === 0 && filteredCustomRules.length === 0 && searchQuery && (
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center py-4">
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
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Consistency Mode</span>
        </label>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 ml-6">
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400"
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
                          <span className="text-xs text-gray-600 dark:text-gray-400">
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
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                            Other rules that also match:
                          </p>
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {otherMatches.map(result => (
                              <div key={result.ruleId} className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{result.ruleLabel}</span>
                                  <span className="text-xs text-gray-600 dark:text-gray-400">
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

            <p className="text-xs text-gray-600 dark:text-gray-400">
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white"
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white"
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white"
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white"
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white"
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white"
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

      {showLabelConfig && (
        <Modal onClose={() => setShowLabelConfig(false)} title="Label Format">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prefix</label>
                <input
                  type="text"
                  value={labelFormat.prefix}
                  onChange={(e) => setLabelFormat({ ...labelFormat, prefix: e.target.value })}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white"
                  placeholder="["
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Suffix</label>
                <input
                  type="text"
                  value={labelFormat.suffix}
                  onChange={(e) => setLabelFormat({ ...labelFormat, suffix: e.target.value })}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white"
                  placeholder="]"
                />
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                Preview: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{labelFormat.prefix}EMAIL-1{labelFormat.suffix}</code>
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quick presets:</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setLabelFormat({ prefix: '[', suffix: ']' })}
                  className="px-3 py-1.5 text-sm rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  [ ]
                </button>
                <button
                  onClick={() => setLabelFormat({ prefix: '{{', suffix: '}}' })}
                  className="px-3 py-1.5 text-sm rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  {'{{ }}'}
                </button>
                <button
                  onClick={() => setLabelFormat({ prefix: '<', suffix: '>' })}
                  className="px-3 py-1.5 text-sm rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  {'< >'}
                </button>
                <button
                  onClick={() => setLabelFormat({ prefix: '', suffix: '' })}
                  className="px-3 py-1.5 text-sm rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  None
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowLabelConfig(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Done
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white"
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
              <p className="text-gray-600 dark:text-gray-400 mt-2">
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

      {showGlobalTemplateConfig && (
        <Modal onClose={() => setShowGlobalTemplateConfig(false)} title="Global Template Format">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Template Format
              </label>
              <input
                type="text"
                value={editingGlobalTemplate}
                onChange={(e) => setEditingGlobalTemplate(e.target.value)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 dark:text-white"
                placeholder="[{TYPE}-{n}]"
              />
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-sm">
              <p className="text-gray-600 dark:text-gray-400">
                Preview: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{editingGlobalTemplate.replace('{n}', '1').replace('{type}', 'email').replace('{TYPE}', 'EMAIL').replace('{len}', '15').replace('{original}', 'user@example.com')}</code>
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg text-xs space-y-2">
              <p className="font-medium text-gray-700 dark:text-gray-300">Available variables:</p>
              <div className="grid grid-cols-2 gap-2 text-gray-600 dark:text-gray-400">
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{n}'}</code> - Counter (1, 2, 3...)</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{type}'}</code> - Type name</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{TYPE}'}</code> - TYPE (uppercase)</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{len}'}</code> - Original length</div>
                <div><code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{'{original}'}</code> - Original value</div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowGlobalTemplateConfig(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setGlobalTemplate(editingGlobalTemplate)
                  setShowGlobalTemplateConfig(false)
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
