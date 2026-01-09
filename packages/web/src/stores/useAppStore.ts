import { create } from 'zustand'

export type ReplacementStrategy = 'label' | 'fake' | 'redact' | 'template'

export interface Rule {
  label: string
  enabled: boolean
  strategy: ReplacementStrategy
  template?: string
}

export interface CustomRule extends Rule {
  id: string
  pattern: string
}

export interface PlainTextPattern {
  id: string
  text: string
  label: string
  enabled: boolean
  strategy: ReplacementStrategy
}

export interface TimeShiftConfig {
  enabled: boolean
  mode: 'offset' | 'start'
  offsetHours: number
  offsetMinutes: number
  startDate: string
  startTime: string
  lineOnly: boolean
}

export interface RuleSuggestion {
  id: string
  label: string
  count: number
  samples: string[]
}

export interface RulePreset {
  name: string
  rules: Record<string, Rule>
  customRules: CustomRule[]
  consistencyMode: boolean
}

export type DetectionStats = Record<string, number>
export type DetectionMatches = Record<string, string[]>

export interface ReplacementInfo {
  start: number
  end: number
  original: string
  replacement: string
  pii_type: string
}

interface AppState {
  input: string
  output: string
  isProcessing: boolean
  stats: DetectionStats
  matches: DetectionMatches
  replacements: ReplacementInfo[]
  consistencyMode: boolean
  rules: Record<string, Rule>
  customRules: CustomRule[]
  plainTextPatterns: PlainTextPattern[]
  timeShift: TimeShiftConfig
  fileName: string | null
  savedPresets: RulePreset[]
  processingProgress: number
  canCancel: boolean
  isAnalyzing: boolean
  analysisReplacements: ReplacementInfo[]
  analysisStats: DetectionStats
  analysisMatches: DetectionMatches
  analysisCompleted: boolean
  suggestions: RuleSuggestion[]
  activeMatches: RuleSuggestion[]
  unmatchedRules: Array<{ id: string; label: string }>
  showSuggestions: boolean
  analysisLogs: string[]
  terminalStyle: boolean
  syntaxHighlight: boolean

  setInput: (input: string) => void
  setOutput: (output: string) => void
  setStats: (stats: DetectionStats) => void
  setMatches: (matches: DetectionMatches) => void
  setReplacements: (replacements: ReplacementInfo[]) => void
  cancelProcessing: () => void
  toggleRule: (id: string) => void
  setRuleStrategy: (id: string, strategy: ReplacementStrategy) => void
  setRuleTemplate: (id: string, template: string) => void
  setAllStrategy: (strategy: ReplacementStrategy) => void
  setConsistencyMode: (enabled: boolean) => void
  setFileName: (name: string | null) => void
  processText: (text: string) => Promise<void>
  analyzeText: (text: string) => Promise<void>
  clearAnalysis: () => void
  dismissSuggestions: () => void
  enableSuggestedRule: (id: string) => void
  enableAllSuggested: () => void
  disableUnmatchedRules: () => void
  savePreset: (name: string) => void
  loadPreset: (preset: RulePreset) => void
  deletePreset: (name: string) => void
  importPreset: (preset: RulePreset) => void
  exportCurrentRules: () => RulePreset
  resetToDefaults: () => void
  addCustomRule: (rule: CustomRule) => void
  updateCustomRule: (id: string, updates: Partial<CustomRule>) => void
  deleteCustomRule: (id: string) => void
  toggleCustomRule: (id: string) => void
  setCustomRuleStrategy: (id: string, strategy: ReplacementStrategy) => void
  addPlainTextPattern: (pattern: PlainTextPattern) => void
  updatePlainTextPattern: (id: string, updates: Partial<PlainTextPattern>) => void
  deletePlainTextPattern: (id: string) => void
  togglePlainTextPattern: (id: string) => void
  setPlainTextPatternStrategy: (id: string, strategy: ReplacementStrategy) => void
  setTimeShift: (config: Partial<TimeShiftConfig>) => void
  setTerminalStyle: (enabled: boolean) => void
  setSyntaxHighlight: (enabled: boolean) => void
}

const DEFAULT_RULES: Record<string, Rule> = {
  email: { label: 'Emails', enabled: true, strategy: 'label' },
  email_message_id: { label: 'Email Message-ID', enabled: false, strategy: 'label' },
  ipv4: { label: 'IPv4 Addresses', enabled: true, strategy: 'label' },
  ipv6: { label: 'IPv6 Addresses', enabled: true, strategy: 'label' },
  mac_address: { label: 'MAC Addresses', enabled: true, strategy: 'label' },
  hostname: { label: 'Hostnames', enabled: false, strategy: 'label' },
  url: { label: 'URLs', enabled: false, strategy: 'label' },
  phone_us: { label: 'Phone (US)', enabled: true, strategy: 'label' },
  phone_uk: { label: 'Phone (UK)', enabled: true, strategy: 'label' },
  phone_intl: { label: 'Phone (Intl)', enabled: true, strategy: 'label' },
  ssn: { label: 'SSN', enabled: true, strategy: 'label' },
  us_itin: { label: 'US ITIN', enabled: false, strategy: 'label' },
  uk_nhs: { label: 'UK NHS Number', enabled: false, strategy: 'label' },
  uk_nino: { label: 'UK National Insurance', enabled: false, strategy: 'label' },
  au_tfn: { label: 'AU Tax File Number', enabled: false, strategy: 'label' },
  in_pan: { label: 'India PAN', enabled: false, strategy: 'label' },
  sg_nric: { label: 'Singapore NRIC', enabled: false, strategy: 'label' },
  credit_card: { label: 'Credit Cards', enabled: true, strategy: 'redact' },
  iban: { label: 'IBAN', enabled: true, strategy: 'label' },
  uuid: { label: 'UUIDs', enabled: true, strategy: 'label' },
  jwt: { label: 'JWT Tokens', enabled: true, strategy: 'label' },
  bearer_token: { label: 'Bearer Tokens', enabled: true, strategy: 'label' },
  aws_access_key: { label: 'AWS Access Keys', enabled: true, strategy: 'redact' },
  aws_secret_key: { label: 'AWS Secret Keys', enabled: true, strategy: 'redact' },
  stripe_key: { label: 'Stripe Keys', enabled: true, strategy: 'redact' },
  gcp_api_key: { label: 'GCP API Keys', enabled: true, strategy: 'redact' },
  github_token: { label: 'GitHub Tokens', enabled: true, strategy: 'redact' },
  slack_token: { label: 'Slack Tokens', enabled: true, strategy: 'redact' },
  npm_token: { label: 'NPM Tokens', enabled: true, strategy: 'redact' },
  sendgrid_key: { label: 'SendGrid Keys', enabled: true, strategy: 'redact' },
  twilio_key: { label: 'Twilio Keys', enabled: true, strategy: 'redact' },
  openai_key: { label: 'OpenAI API Keys', enabled: true, strategy: 'redact' },
  anthropic_key: { label: 'Anthropic API Keys', enabled: true, strategy: 'redact' },
  xai_key: { label: 'X AI API Keys', enabled: true, strategy: 'redact' },
  cerebras_key: { label: 'Cerebras API Keys', enabled: true, strategy: 'redact' },
  db_connection: { label: 'Database URLs', enabled: true, strategy: 'redact' },
  generic_secret: { label: 'Generic Secrets', enabled: true, strategy: 'redact' },
  high_entropy_secret: { label: 'High Entropy Secrets', enabled: false, strategy: 'redact' },
  private_key: { label: 'Private Keys', enabled: true, strategy: 'redact' },
  basic_auth: { label: 'Basic Auth', enabled: true, strategy: 'redact' },
  url_credentials: { label: 'URL Credentials', enabled: true, strategy: 'redact' },
  btc_address: { label: 'Bitcoin Addresses', enabled: true, strategy: 'label' },
  eth_address: { label: 'Ethereum Addresses', enabled: true, strategy: 'label' },
  gps_coordinates: { label: 'GPS Coordinates', enabled: false, strategy: 'label' },
  file_path_unix: { label: 'File Paths (Unix)', enabled: false, strategy: 'label' },
  file_path_windows: { label: 'File Paths (Win)', enabled: false, strategy: 'label' },
  postcode_uk: { label: 'UK Postcodes', enabled: false, strategy: 'label' },
  postcode_us: { label: 'US Zip Codes', enabled: false, strategy: 'label' },
  passport: { label: 'Passport Numbers', enabled: false, strategy: 'label' },
  drivers_license: { label: "Driver's License", enabled: false, strategy: 'label' },
  session_id: { label: 'Session IDs', enabled: true, strategy: 'label' },
  date_mdy: { label: 'Date (MM/DD/YY)', enabled: false, strategy: 'label' },
  date_dmy: { label: 'Date (DD/MM/YY)', enabled: false, strategy: 'label' },
  date_iso: { label: 'Date (ISO)', enabled: false, strategy: 'label' },
  time: { label: 'Time', enabled: false, strategy: 'label' },
  datetime_iso: { label: 'DateTime (ISO)', enabled: false, strategy: 'label' },
  datetime_clf: { label: 'DateTime (CLF)', enabled: false, strategy: 'label' },
  timestamp_unix: { label: 'Unix Timestamp', enabled: false, strategy: 'label' },
  sql_tables: { label: 'SQL Tables', enabled: false, strategy: 'label' },
  sql_strings: { label: 'SQL Strings', enabled: false, strategy: 'label' },
  sql_identifiers: { label: 'SQL Identifiers', enabled: false, strategy: 'label' },
}

const PRESETS_STORAGE_KEY = 'logscrub_presets'
const CUSTOM_RULES_STORAGE_KEY = 'logscrub_custom_rules'

function loadPresetsFromStorage(): RulePreset[] {
  try {
    const stored = localStorage.getItem(PRESETS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function savePresetsToStorage(presets: RulePreset[]) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets))
}

function loadCustomRulesFromStorage(): CustomRule[] {
  try {
    const stored = localStorage.getItem(CUSTOM_RULES_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveCustomRulesToStorage(rules: CustomRule[]) {
  localStorage.setItem(CUSTOM_RULES_STORAGE_KEY, JSON.stringify(rules))
}

const PLAIN_TEXT_STORAGE_KEY = 'logscrub_plain_text'
const TERMINAL_STYLE_STORAGE_KEY = 'logscrub_terminal_style'
const SYNTAX_HIGHLIGHT_STORAGE_KEY = 'logscrub_syntax_highlight'

function loadPlainTextPatternsFromStorage(): PlainTextPattern[] {
  try {
    const stored = localStorage.getItem(PLAIN_TEXT_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function savePlainTextPatternsToStorage(patterns: PlainTextPattern[]) {
  localStorage.setItem(PLAIN_TEXT_STORAGE_KEY, JSON.stringify(patterns))
}

function loadTerminalStyleFromStorage(): boolean {
  try {
    const stored = localStorage.getItem(TERMINAL_STYLE_STORAGE_KEY)
    return stored === 'true'
  } catch {
    return false
  }
}

function saveTerminalStyleToStorage(enabled: boolean) {
  localStorage.setItem(TERMINAL_STYLE_STORAGE_KEY, String(enabled))
}

function loadSyntaxHighlightFromStorage(): boolean {
  try {
    const stored = localStorage.getItem(SYNTAX_HIGHLIGHT_STORAGE_KEY)
    return stored === 'true'
  } catch {
    return false
  }
}

function saveSyntaxHighlightToStorage(enabled: boolean) {
  localStorage.setItem(SYNTAX_HIGHLIGHT_STORAGE_KEY, String(enabled))
}

let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('../workers/sanitizer.worker.ts', import.meta.url),
      { type: 'module' }
    )
  }
  return worker
}

let cancelRequested = false

export const useAppStore = create<AppState>((set, get) => ({
  input: '',
  output: '',
  isProcessing: false,
  stats: {},
  matches: {},
  replacements: [],
  consistencyMode: true,
  rules: DEFAULT_RULES,
  customRules: loadCustomRulesFromStorage(),
  plainTextPatterns: loadPlainTextPatternsFromStorage(),
  timeShift: {
    enabled: false,
    mode: 'offset',
    offsetHours: 0,
    offsetMinutes: 0,
    startDate: '',
    startTime: '',
    lineOnly: true
  },
  fileName: null,
  savedPresets: loadPresetsFromStorage(),
  processingProgress: 0,
  canCancel: false,
  isAnalyzing: false,
  analysisReplacements: [],
  analysisStats: {},
  analysisMatches: {},
  analysisCompleted: false,
  suggestions: [],
  activeMatches: [],
  unmatchedRules: [],
  showSuggestions: false,
  analysisLogs: [],
  terminalStyle: loadTerminalStyleFromStorage(),
  syntaxHighlight: loadSyntaxHighlightFromStorage(),

  setInput: (input) => set({ input, analysisReplacements: [], analysisStats: {}, analysisMatches: {}, analysisCompleted: false, analysisLogs: [] }),
  setOutput: (output) => set({ output }),
  setStats: (stats) => set({ stats }),
  setMatches: (matches) => set({ matches }),
  setReplacements: (replacements) => set({ replacements }),
  setFileName: (name) => set({ fileName: name }),
  
  cancelProcessing: () => {
    cancelRequested = true
  },

  toggleRule: (id) => set((state) => ({
    rules: {
      ...state.rules,
      [id]: { ...state.rules[id], enabled: !state.rules[id].enabled }
    }
  })),

  setRuleStrategy: (id, strategy) => set((state) => ({
    rules: {
      ...state.rules,
      [id]: { ...state.rules[id], strategy }
    }
  })),

  setRuleTemplate: (id, template) => set((state) => ({
    rules: {
      ...state.rules,
      [id]: { ...state.rules[id], template }
    }
  })),

  setAllStrategy: (strategy) => set((state) => ({
    rules: Object.fromEntries(
      Object.entries(state.rules).map(([id, rule]) => [id, { ...rule, strategy }])
    ),
    customRules: state.customRules.map(r => ({ ...r, strategy })),
    plainTextPatterns: state.plainTextPatterns.map(p => ({ ...p, strategy }))
  })),

  setConsistencyMode: (enabled) => set({ consistencyMode: enabled }),

  addCustomRule: (rule) => {
    const { customRules } = get()
    const updated = [...customRules, rule]
    saveCustomRulesToStorage(updated)
    set({ customRules: updated })
  },

  updateCustomRule: (id, updates) => {
    const { customRules } = get()
    const updated = customRules.map(r => r.id === id ? { ...r, ...updates } : r)
    saveCustomRulesToStorage(updated)
    set({ customRules: updated })
  },

  deleteCustomRule: (id) => {
    const { customRules } = get()
    const updated = customRules.filter(r => r.id !== id)
    saveCustomRulesToStorage(updated)
    set({ customRules: updated })
  },

  toggleCustomRule: (id) => {
    const { customRules } = get()
    const updated = customRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    saveCustomRulesToStorage(updated)
    set({ customRules: updated })
  },

  setCustomRuleStrategy: (id, strategy) => {
    const { customRules } = get()
    const updated = customRules.map(r => r.id === id ? { ...r, strategy } : r)
    saveCustomRulesToStorage(updated)
    set({ customRules: updated })
  },

  addPlainTextPattern: (pattern) => {
    const { plainTextPatterns } = get()
    const updated = [...plainTextPatterns, pattern]
    savePlainTextPatternsToStorage(updated)
    set({ plainTextPatterns: updated })
  },

  updatePlainTextPattern: (id, updates) => {
    const { plainTextPatterns } = get()
    const updated = plainTextPatterns.map(p => p.id === id ? { ...p, ...updates } : p)
    savePlainTextPatternsToStorage(updated)
    set({ plainTextPatterns: updated })
  },

  deletePlainTextPattern: (id) => {
    const { plainTextPatterns } = get()
    const updated = plainTextPatterns.filter(p => p.id !== id)
    savePlainTextPatternsToStorage(updated)
    set({ plainTextPatterns: updated })
  },

  togglePlainTextPattern: (id) => {
    const { plainTextPatterns } = get()
    const updated = plainTextPatterns.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p)
    savePlainTextPatternsToStorage(updated)
    set({ plainTextPatterns: updated })
  },

  setPlainTextPatternStrategy: (id, strategy) => {
    const { plainTextPatterns } = get()
    const updated = plainTextPatterns.map(p => p.id === id ? { ...p, strategy } : p)
    savePlainTextPatternsToStorage(updated)
    set({ plainTextPatterns: updated })
  },

  setTimeShift: (config) => set((state) => ({
    timeShift: { ...state.timeShift, ...config }
  })),

  setTerminalStyle: (enabled) => {
    saveTerminalStyleToStorage(enabled)
    set({ terminalStyle: enabled })
  },

  setSyntaxHighlight: (enabled) => {
    saveSyntaxHighlightToStorage(enabled)
    set({ syntaxHighlight: enabled })
  },

  savePreset: (name) => {
    const { rules, customRules, consistencyMode, savedPresets } = get()
    const newPreset: RulePreset = { name, rules: { ...rules }, customRules: [...customRules], consistencyMode }
    const existingIndex = savedPresets.findIndex(p => p.name === name)
    
    let updated: RulePreset[]
    if (existingIndex >= 0) {
      updated = [...savedPresets]
      updated[existingIndex] = newPreset
    } else {
      updated = [...savedPresets, newPreset]
    }
    
    savePresetsToStorage(updated)
    set({ savedPresets: updated })
  },

  loadPreset: (preset) => {
    const currentRules = get().rules
    const mergedRules = { ...currentRules }
    
    Object.entries(preset.rules).forEach(([id, rule]) => {
      if (mergedRules[id]) {
        mergedRules[id] = { ...mergedRules[id], enabled: rule.enabled, strategy: rule.strategy }
      }
    })
    
    const customRules = preset.customRules || []
    saveCustomRulesToStorage(customRules)
    set({ rules: mergedRules, customRules, consistencyMode: preset.consistencyMode })
  },

  deletePreset: (name) => {
    const { savedPresets } = get()
    const updated = savedPresets.filter(p => p.name !== name)
    savePresetsToStorage(updated)
    set({ savedPresets: updated })
  },

  importPreset: (preset) => {
    const { savedPresets } = get()
    const existingIndex = savedPresets.findIndex(p => p.name === preset.name)
    
    let updated: RulePreset[]
    if (existingIndex >= 0) {
      updated = [...savedPresets]
      updated[existingIndex] = preset
    } else {
      updated = [...savedPresets, preset]
    }
    
    savePresetsToStorage(updated)
    set({ savedPresets: updated })
  },

  exportCurrentRules: () => {
    const { rules, customRules, consistencyMode } = get()
    return { name: 'Exported Rules', rules: { ...rules }, customRules: [...customRules], consistencyMode }
  },

  resetToDefaults: () => {
    set({ rules: DEFAULT_RULES, customRules: [], consistencyMode: false })
    saveCustomRulesToStorage([])
  },

  processText: async (text) => {
    if (!text.trim()) return

    cancelRequested = false
    set({ isProcessing: true, processingProgress: 0, canCancel: true, analysisReplacements: [], analysisStats: {}, analysisCompleted: false })

    try {
      const { rules, customRules, plainTextPatterns, consistencyMode, timeShift } = get()
      const enabledRules = Object.entries(rules)
        .filter(([, rule]) => rule.enabled)
        .map(([id, rule]) => ({ id, strategy: rule.strategy, template: rule.template }))

      const enabledCustomRules = customRules
        .filter(rule => rule.enabled)
        .map(rule => ({ id: rule.id, strategy: rule.strategy, pattern: rule.pattern, isCustom: true }))

      const enabledPlainTextPatterns = plainTextPatterns
        .filter(p => p.enabled)
        .map(p => ({ id: p.id, strategy: p.strategy, text: p.text, label: p.label }))

      const w = getWorker()
      
      const result = await new Promise<{ output: string; stats: DetectionStats; matches: DetectionMatches; replacements: ReplacementInfo[] }>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'result') {
            w.removeEventListener('message', handler)
            resolve(e.data.payload)
          } else if (e.data.type === 'error') {
            w.removeEventListener('message', handler)
            reject(new Error(e.data.payload))
          } else if (e.data.type === 'progress') {
            set({ processingProgress: e.data.payload })
          }
        }
        
        w.addEventListener('message', handler)
        w.postMessage({
          type: 'process',
          payload: { 
            text, 
            rules: enabledRules, 
            customRules: enabledCustomRules, 
            plainTextPatterns: enabledPlainTextPatterns, 
            consistencyMode,
            timeShift: timeShift.enabled ? timeShift : null
          }
        })
      })

      if (!cancelRequested) {
        set({ output: result.output, stats: result.stats, matches: result.matches || {}, replacements: result.replacements || [] })
      }
    } catch {
    } finally {
      set({ isProcessing: false, processingProgress: 0, canCancel: false })
    }
  },

  analyzeText: async (text) => {
    if (!text.trim()) return

    cancelRequested = false
    set({ isAnalyzing: true, processingProgress: 0, canCancel: true, output: '', replacements: [], stats: {}, suggestions: [], showSuggestions: false, analysisCompleted: false, analysisLogs: [] })

    try {
      const { rules, customRules, plainTextPatterns, consistencyMode } = get()
      
      const allRules = Object.entries(rules)
        .map(([id, rule]) => ({ id, strategy: rule.strategy, template: rule.template }))

      const allCustomRules = customRules
        .map(rule => ({ id: rule.id, strategy: rule.strategy, pattern: rule.pattern, isCustom: true }))

      const allPlainTextPatterns = plainTextPatterns
        .map(p => ({ id: p.id, strategy: p.strategy, text: p.text, label: p.label }))

      const w = getWorker()
      
      const result = await new Promise<{ output: string; stats: DetectionStats; matches: DetectionMatches; replacements: ReplacementInfo[] }>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'result') {
            w.removeEventListener('message', handler)
            resolve(e.data.payload)
          } else if (e.data.type === 'error') {
            w.removeEventListener('message', handler)
            reject(new Error(e.data.payload))
          } else if (e.data.type === 'progress') {
            set({ processingProgress: e.data.payload })
          } else if (e.data.type === 'log') {
            const { analysisLogs } = get()
            set({ analysisLogs: [...analysisLogs, e.data.payload] })
          }
        }

        w.addEventListener('message', handler)
        w.postMessage({
          type: 'process',
          payload: { text, rules: allRules, customRules: allCustomRules, plainTextPatterns: allPlainTextPatterns, consistencyMode }
        })
      })

      if (!cancelRequested) {
        const suggestions: RuleSuggestion[] = []
        const matches = result.matches || {}
        const stats = result.stats || {}
        const allReplacements = result.replacements || []
        
        const extractSamplesWithContext = (piiType: string, maxSamples: number): string[] => {
          const typeReplacements = allReplacements.filter(r => r.pii_type === piiType).slice(0, maxSamples)
          return typeReplacements.map(r => {
            const contextBefore = text.slice(Math.max(0, r.start - 20), r.start)
            const contextAfter = text.slice(r.end, Math.min(text.length, r.end + 20))
            const before = contextBefore.includes('\n') ? contextBefore.slice(contextBefore.lastIndexOf('\n') + 1) : contextBefore
            const after = contextAfter.includes('\n') ? contextAfter.slice(0, contextAfter.indexOf('\n')) : contextAfter
            return `${before.length < contextBefore.length ? '' : '…'}${before}${r.original}${after}${after.length < contextAfter.length ? '' : '…'}`
          })
        }
        
        Object.entries(stats).forEach(([id, count]) => {
          if (count > 0) {
            const rule = rules[id]
            const customRule = customRules.find(r => r.id === id)
            const plainText = plainTextPatterns.find(p => p.id === id)
            
            const isDisabled = (rule && !rule.enabled) || 
                              (customRule && !customRule.enabled) || 
                              (plainText && !plainText.enabled)
            
            if (isDisabled) {
              const label = rule?.label || customRule?.label || plainText?.label || id
              const samples = extractSamplesWithContext(id, 3)
              suggestions.push({ id, label, count, samples })
            }
          }
        })
        
        suggestions.sort((a, b) => b.count - a.count)

        // Compute active matches (enabled rules that found matches)
        const activeMatches: RuleSuggestion[] = []
        Object.entries(stats).forEach(([id, count]) => {
          if (count > 0) {
            const rule = rules[id]
            const customRule = customRules.find(r => r.id === id)
            const plainText = plainTextPatterns.find(p => p.id === id)

            const isEnabled = (rule?.enabled) || (customRule?.enabled) || (plainText?.enabled)

            if (isEnabled) {
              const label = rule?.label || customRule?.label || plainText?.label || id
              const samples = extractSamplesWithContext(id, 3)
              activeMatches.push({ id, label, count, samples })
            }
          }
        })
        activeMatches.sort((a, b) => b.count - a.count)

        // Compute unmatched rules (enabled rules with no matches)
        const unmatchedRules: Array<{ id: string; label: string }> = []
        Object.entries(rules).forEach(([id, rule]) => {
          if (rule.enabled && (!stats[id] || stats[id] === 0)) {
            unmatchedRules.push({ id, label: rule.label })
          }
        })
        customRules.forEach(rule => {
          if (rule.enabled && (!stats[rule.id] || stats[rule.id] === 0)) {
            unmatchedRules.push({ id: rule.id, label: rule.label })
          }
        })
        plainTextPatterns.forEach(p => {
          if (p.enabled && (!stats[p.id] || stats[p.id] === 0)) {
            unmatchedRules.push({ id: p.id, label: p.label })
          }
        })

        const enabledReplacements = result.replacements?.filter(r => {
          const rule = rules[r.pii_type]
          const customRule = customRules.find(cr => cr.id === r.pii_type)
          const plainText = plainTextPatterns.find(p => p.id === r.pii_type)
          return (rule?.enabled) || (customRule?.enabled) || (plainText?.enabled)
        }) || []

        const enabledStats: DetectionStats = {}
        const enabledMatches: DetectionMatches = {}
        Object.entries(stats).forEach(([id, count]) => {
          const rule = rules[id]
          const customRule = customRules.find(r => r.id === id)
          const plainText = plainTextPatterns.find(p => p.id === id)
          if ((rule?.enabled) || (customRule?.enabled) || (plainText?.enabled)) {
            enabledStats[id] = count
            if (matches[id]) {
              enabledMatches[id] = matches[id]
            }
          }
        })

        set({
          analysisReplacements: enabledReplacements,
          analysisStats: enabledStats,
          analysisMatches: enabledMatches,
          analysisCompleted: true,
          suggestions,
          activeMatches,
          unmatchedRules,
          showSuggestions: suggestions.length > 0 || activeMatches.length > 0
        })
      }
    } catch {
    } finally {
      set({ isAnalyzing: false, processingProgress: 0, canCancel: false })
    }
  },

  clearAnalysis: () => set({ analysisReplacements: [], analysisStats: {}, analysisMatches: {}, analysisCompleted: false, suggestions: [], activeMatches: [], unmatchedRules: [], showSuggestions: false }),

  dismissSuggestions: () => set({ showSuggestions: false }),

  enableSuggestedRule: (id) => {
    const { rules, customRules, plainTextPatterns } = get()
    
    if (rules[id]) {
      set({ 
        rules: { ...rules, [id]: { ...rules[id], enabled: true } },
        suggestions: get().suggestions.filter(s => s.id !== id)
      })
    } else {
      const customIdx = customRules.findIndex(r => r.id === id)
      if (customIdx >= 0) {
        const updated = [...customRules]
        updated[customIdx] = { ...updated[customIdx], enabled: true }
        saveCustomRulesToStorage(updated)
        set({ 
          customRules: updated,
          suggestions: get().suggestions.filter(s => s.id !== id)
        })
      } else {
        const plainIdx = plainTextPatterns.findIndex(p => p.id === id)
        if (plainIdx >= 0) {
          const updated = [...plainTextPatterns]
          updated[plainIdx] = { ...updated[plainIdx], enabled: true }
          savePlainTextPatternsToStorage(updated)
          set({ 
            plainTextPatterns: updated,
            suggestions: get().suggestions.filter(s => s.id !== id)
          })
        }
      }
    }
  },

  enableAllSuggested: () => {
    const { rules, customRules, plainTextPatterns, suggestions } = get()
    const suggestedIds = new Set(suggestions.map(s => s.id))
    
    const newRules = { ...rules }
    suggestedIds.forEach(id => {
      if (newRules[id]) {
        newRules[id] = { ...newRules[id], enabled: true }
      }
    })
    
    const newCustomRules = customRules.map(r => 
      suggestedIds.has(r.id) ? { ...r, enabled: true } : r
    )
    saveCustomRulesToStorage(newCustomRules)
    
    const newPlainText = plainTextPatterns.map(p => 
      suggestedIds.has(p.id) ? { ...p, enabled: true } : p
    )
    savePlainTextPatternsToStorage(newPlainText)
    
    set({
      rules: newRules,
      customRules: newCustomRules,
      plainTextPatterns: newPlainText,
      suggestions: [],
      showSuggestions: false
    })
  },

  disableUnmatchedRules: () => {
    const { rules, customRules, plainTextPatterns, unmatchedRules } = get()
    const unmatchedIds = new Set(unmatchedRules.map(r => r.id))

    const newRules = { ...rules }
    unmatchedIds.forEach(id => {
      if (newRules[id]) {
        newRules[id] = { ...newRules[id], enabled: false }
      }
    })

    const newCustomRules = customRules.map(r =>
      unmatchedIds.has(r.id) ? { ...r, enabled: false } : r
    )
    saveCustomRulesToStorage(newCustomRules)

    const newPlainText = plainTextPatterns.map(p =>
      unmatchedIds.has(p.id) ? { ...p, enabled: false } : p
    )
    savePlainTextPatternsToStorage(newPlainText)

    set({
      rules: newRules,
      customRules: newCustomRules,
      plainTextPatterns: newPlainText,
      unmatchedRules: []
    })
  }
}))
