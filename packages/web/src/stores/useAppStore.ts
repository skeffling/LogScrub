import { create } from 'zustand'
import type { ContextMatch } from '../utils/contextAwareDetector'

// Default model ID for ML Name Detection (inlined to avoid static import of the full module)
const DEFAULT_ML_MODEL_ID = 'Xenova/distilbert-base-NER'
import type { FileEntry, AggregatedStats, BatchProgress } from '../types/multiFile'
import { createEmptyFileEntry, MAX_FILES, MAX_TOTAL_SIZE } from '../types/multiFile'

export type ReplacementStrategy = 'label' | 'realistic' | 'redact' | 'template'
export type ThemeMode = 'light' | 'dark' | 'auto'
export type DocumentType = 'pdf' | 'xlsx' | 'docx' | 'odt' | 'ods' | null
export type MLLoadingState = 'idle' | 'loading' | 'ready' | 'error'

export type SyntaxFormat = 'json' | 'xml' | 'csv' | 'yaml' | 'toml'

export interface SyntaxError {
  format: SyntaxFormat
  message: string
  line?: number
  column?: number
}

export type ValidatedFormat = SyntaxFormat | null

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

export interface SampleSnippet {
  before: string
  match: string
  after: string
  truncatedBefore: boolean
  truncatedAfter: boolean
}

export interface RuleSuggestion {
  id: string
  label: string
  count: number
  samples: SampleSnippet[]
}

export interface RulePreset {
  name: string
  rules: Record<string, Rule>
  customRules: CustomRule[]
  consistencyMode: boolean
  categoryOrder?: string[]
  ruleOrder?: Record<string, string[]>
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
  lineCountWarning: string | null
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
  analysisStage: string
  analysisReplacements: ReplacementInfo[]
  analysisStats: DetectionStats
  analysisMatches: DetectionMatches
  analysisCompleted: boolean
  suggestions: RuleSuggestion[]
  activeMatches: RuleSuggestion[]
  unmatchedRules: Array<{ id: string; label: string }>
  showSuggestions: boolean
  suggestionsInitialTab: 'active' | 'suggestions' | 'ml' | 'context' | null
  analysisLogs: string[]
  contextMatches: ContextMatch[]
  terminalStyle: boolean
  syntaxHighlight: boolean
  themeMode: ThemeMode
  labelFormat: LabelFormat
  globalTemplate: string
  documentType: DocumentType
  syntaxError: SyntaxError | null
  syntaxValidFormat: ValidatedFormat
  preservePrivateIPs: boolean

  // ML Name Detection state
  mlNameDetectionEnabled: boolean
  mlModelId: string
  mlLoadingState: MLLoadingState
  mlLoadProgress: number
  mlError: string | null

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
  setPreservePrivateIPs: (enabled: boolean) => void
  setFileName: (name: string | null) => void
  processText: (text: string) => Promise<void>
  analyzeText: (text: string) => Promise<void>
  clearAnalysis: () => void
  dismissSuggestions: () => void
  setShowSuggestions: (show: boolean, initialTab?: 'active' | 'suggestions' | 'ml' | 'context') => void
  enableSuggestedRule: (id: string) => void
  disableActiveMatch: (id: string) => void
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
  setThemeMode: (mode: ThemeMode) => void
  setLabelFormat: (format: LabelFormat) => void
  setGlobalTemplate: (template: string) => void
  setDocumentType: (type: DocumentType) => void
  addContextMatchAsPattern: (match: ContextMatch) => void
  setSyntaxError: (error: SyntaxError | null) => void
  setSyntaxValidFormat: (format: ValidatedFormat) => void

  // ML Name Detection actions
  setMlNameDetection: (enabled: boolean) => void
  setMlModelId: (modelId: string) => void
  loadMlModel: () => Promise<void>
  unloadMlModel: () => void

  // Multi-file state
  files: FileEntry[]
  selectedFileId: string | null
  isMultiFileMode: boolean
  aggregatedStats: AggregatedStats | null
  isBatchAnalyzing: boolean
  isBatchProcessing: boolean
  batchProgress: BatchProgress

  // Multi-file actions
  addFiles: (files: File[]) => Promise<void>
  addFilesFromZip: (data: Uint8Array, fileName: string) => Promise<void>
  removeFile: (fileId: string) => void
  clearAllFiles: () => void
  selectFile: (fileId: string) => void
  analyzeAllFiles: () => Promise<void>
  processAllFiles: () => Promise<void>
  computeAggregatedStats: () => void
  updateFileResult: (fileId: string, result: Partial<FileEntry>) => void
  exportAllAsZip: () => Promise<void>
}

export type { ContextMatch }

const DEFAULT_RULES: Record<string, Rule> = {
  // ML-detected entities (requires model to be loaded)
  ml_person_name: { label: 'Person Names (ML)', enabled: false, strategy: 'label' },
  ml_location: { label: 'Locations (ML)', enabled: false, strategy: 'label' },
  ml_organization: { label: 'Organizations (ML)', enabled: false, strategy: 'label' },
  // Pattern-based rules
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
  uk_sort_code: { label: 'UK Sort Code', enabled: false, strategy: 'label' },
  uk_bank_account: { label: 'UK Bank Account', enabled: false, strategy: 'label' },
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
  money: { label: 'Money/Currency', enabled: false, strategy: 'label' },
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
  exim_subject: { label: 'Exim Subject', enabled: false, strategy: 'label' },
  exim_sender: { label: 'Exim Sender', enabled: false, strategy: 'label' },
  exim_auth: { label: 'Exim Auth', enabled: false, strategy: 'label' },
  exim_user: { label: 'Exim User', enabled: false, strategy: 'label' },
  exim_dn: { label: 'Exim DN', enabled: false, strategy: 'label' },
  // Postfix
  postfix_from: { label: 'Postfix From', enabled: false, strategy: 'label' },
  postfix_to: { label: 'Postfix To', enabled: false, strategy: 'label' },
  postfix_relay: { label: 'Postfix Relay', enabled: false, strategy: 'label' },
  postfix_sasl: { label: 'Postfix SASL User', enabled: false, strategy: 'label' },
  // Dovecot
  dovecot_user: { label: 'Dovecot User', enabled: false, strategy: 'label' },
  dovecot_rip: { label: 'Dovecot Remote IP', enabled: false, strategy: 'label' },
  dovecot_lip: { label: 'Dovecot Local IP', enabled: false, strategy: 'label' },
  // Sendmail
  sendmail_from: { label: 'Sendmail From', enabled: false, strategy: 'label' },
  sendmail_relay: { label: 'Sendmail Relay', enabled: false, strategy: 'label' },
  sendmail_msgid: { label: 'Sendmail MsgID', enabled: false, strategy: 'label' },
  // SIP/VoIP
  sip_username: { label: 'SIP Username', enabled: false, strategy: 'label' },
  sip_realm: { label: 'SIP Realm', enabled: false, strategy: 'label' },
  sip_nonce: { label: 'SIP Nonce', enabled: false, strategy: 'label' },
  sip_response: { label: 'SIP Response', enabled: false, strategy: 'label' },
  sip_from_display: { label: 'SIP From Name', enabled: false, strategy: 'label' },
  sip_to_display: { label: 'SIP To Name', enabled: false, strategy: 'label' },
  sip_contact: { label: 'SIP Contact', enabled: false, strategy: 'label' },
  sip_uri: { label: 'SIP URI', enabled: false, strategy: 'label' },
  sip_call_id: { label: 'SIP Call-ID', enabled: false, strategy: 'label' },
  sip_branch: { label: 'SIP Branch', enabled: false, strategy: 'label' },
  sip_user_agent: { label: 'SIP User-Agent', enabled: false, strategy: 'label' },
  sip_via: { label: 'SIP Via', enabled: false, strategy: 'label' },
  md5_hash: { label: 'MD5 Hash', enabled: false, strategy: 'label' },
  sha1_hash: { label: 'SHA1 Hash', enabled: false, strategy: 'label' },
  sha256_hash: { label: 'SHA256 Hash', enabled: false, strategy: 'label' },
  docker_container_id: { label: 'Docker Container ID', enabled: false, strategy: 'label' },
  url_params: { label: 'URL Parameters', enabled: false, strategy: 'label' },
}

const PRESETS_STORAGE_KEY = 'logscrub_presets'
const CUSTOM_RULES_STORAGE_KEY = 'logscrub_custom_rules'
const RULES_STORAGE_KEY = 'logscrub_rules'

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

function loadRulesFromStorage(): Record<string, Rule> {
  try {
    const stored = localStorage.getItem(RULES_STORAGE_KEY)
    if (stored) {
      const savedRules = JSON.parse(stored) as Record<string, Rule>
      // Merge with defaults to handle new patterns added since last save
      const merged = { ...DEFAULT_RULES }
      for (const [id, rule] of Object.entries(savedRules)) {
        if (merged[id]) {
          merged[id] = { ...merged[id], enabled: rule.enabled, strategy: rule.strategy, template: rule.template }
        }
      }
      return merged
    }
  } catch {}
  return DEFAULT_RULES
}

function saveRulesToStorage(rules: Record<string, Rule>) {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules))
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
const THEME_MODE_STORAGE_KEY = 'logscrub_theme_mode'

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

function loadThemeModeFromStorage(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'auto') {
      return stored
    }
  } catch {}
  return 'auto'
}

function saveThemeModeToStorage(mode: ThemeMode) {
  localStorage.setItem(THEME_MODE_STORAGE_KEY, mode)
}

function applyTheme(mode: ThemeMode) {
  const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (isDark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

const LABEL_FORMAT_STORAGE_KEY = 'logscrub_label_format'

export interface LabelFormat {
  prefix: string
  suffix: string
}

function loadLabelFormatFromStorage(): LabelFormat {
  try {
    const stored = localStorage.getItem(LABEL_FORMAT_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {}
  return { prefix: '[', suffix: ']' }
}

function saveLabelFormatToStorage(format: LabelFormat) {
  localStorage.setItem(LABEL_FORMAT_STORAGE_KEY, JSON.stringify(format))
}

const GLOBAL_TEMPLATE_STORAGE_KEY = 'logscrub_global_template'
const ML_SETTINGS_STORAGE_KEY = 'logscrub_ml_settings'

function loadGlobalTemplateFromStorage(): string {
  try {
    const stored = localStorage.getItem(GLOBAL_TEMPLATE_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {}
  return '[{TYPE}-{n}]'
}

function saveGlobalTemplateToStorage(template: string) {
  localStorage.setItem(GLOBAL_TEMPLATE_STORAGE_KEY, JSON.stringify(template))
}

interface MLSettings {
  enabled: boolean
  modelId: string
}

function loadMLSettingsFromStorage(): MLSettings {
  try {
    const stored = localStorage.getItem(ML_SETTINGS_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {}
  return { enabled: false, modelId: DEFAULT_ML_MODEL_ID }
}

function saveMLSettingsToStorage(settings: MLSettings) {
  localStorage.setItem(ML_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
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
  lineCountWarning: null,
  consistencyMode: true,
  preservePrivateIPs: false,
  rules: loadRulesFromStorage(),
  customRules: loadCustomRulesFromStorage(),
  plainTextPatterns: loadPlainTextPatternsFromStorage(),
  timeShift: {
    enabled: false,
    mode: 'offset',
    offsetHours: 0,
    offsetMinutes: 0,
    startDate: '',
    startTime: '',
    lineOnly: false
  },
  fileName: null,
  savedPresets: loadPresetsFromStorage(),
  processingProgress: 0,
  canCancel: false,
  isAnalyzing: false,
  analysisStage: '',
  analysisReplacements: [],
  analysisStats: {},
  analysisMatches: {},
  analysisCompleted: false,
  suggestions: [],
  activeMatches: [],
  unmatchedRules: [],
  showSuggestions: false,
  suggestionsInitialTab: null,
  analysisLogs: [],
  contextMatches: [],
  terminalStyle: loadTerminalStyleFromStorage(),
  syntaxHighlight: loadSyntaxHighlightFromStorage(),
  themeMode: loadThemeModeFromStorage(),
  labelFormat: loadLabelFormatFromStorage(),
  globalTemplate: loadGlobalTemplateFromStorage(),
  documentType: null,
  syntaxError: null,
  syntaxValidFormat: null,

  // ML Name Detection
  mlNameDetectionEnabled: loadMLSettingsFromStorage().enabled,
  mlModelId: loadMLSettingsFromStorage().modelId,
  mlLoadingState: 'idle',
  mlLoadProgress: 0,
  mlError: null,

  // Multi-file state
  files: [],
  selectedFileId: null,
  isMultiFileMode: false,
  aggregatedStats: null,
  isBatchAnalyzing: false,
  isBatchProcessing: false,
  batchProgress: { current: 0, total: 0, currentFileName: '' },

  setInput: (input) => set({ input, analysisReplacements: [], analysisStats: {}, analysisMatches: {}, analysisCompleted: false, analysisLogs: [], contextMatches: [], syntaxError: null, syntaxValidFormat: null }),
  setOutput: (output) => set({ output }),
  setStats: (stats) => set({ stats }),
  setMatches: (matches) => set({ matches }),
  setReplacements: (replacements) => set({ replacements }),
  setFileName: (name) => set({ fileName: name }),
  
  cancelProcessing: () => {
    cancelRequested = true
  },

  toggleRule: (id) => {
    const { rules } = get()
    const newRules = {
      ...rules,
      [id]: { ...rules[id], enabled: !rules[id].enabled }
    }
    saveRulesToStorage(newRules)
    set({ rules: newRules })
  },

  setRuleStrategy: (id, strategy) => {
    const { rules } = get()
    const newRules = {
      ...rules,
      [id]: { ...rules[id], strategy }
    }
    saveRulesToStorage(newRules)
    set({ rules: newRules })
  },

  setRuleTemplate: (id, template) => {
    const { rules } = get()
    const newRules = {
      ...rules,
      [id]: { ...rules[id], template }
    }
    saveRulesToStorage(newRules)
    set({ rules: newRules })
  },

  setAllStrategy: (strategy) => {
    const { rules, customRules, plainTextPatterns } = get()
    const newRules = Object.fromEntries(
      Object.entries(rules).map(([id, rule]) => [id, { ...rule, strategy }])
    )
    saveRulesToStorage(newRules)
    set({
      rules: newRules,
      customRules: customRules.map(r => ({ ...r, strategy })),
      plainTextPatterns: plainTextPatterns.map(p => ({ ...p, strategy }))
    })
  },

  setConsistencyMode: (enabled) => set({ consistencyMode: enabled }),
  setPreservePrivateIPs: (enabled) => set({ preservePrivateIPs: enabled }),

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

  setThemeMode: (mode) => {
    saveThemeModeToStorage(mode)
    applyTheme(mode)
    set({ themeMode: mode })
  },

  setLabelFormat: (format) => {
    saveLabelFormatToStorage(format)
    set({ labelFormat: format })
  },

  setGlobalTemplate: (template) => {
    saveGlobalTemplateToStorage(template)
    set({ globalTemplate: template })
  },

  setDocumentType: (type) => set({ documentType: type }),

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
    saveRulesToStorage(mergedRules)
    saveCustomRulesToStorage(customRules)

    // Save ordering if present in preset
    if (preset.categoryOrder) {
      localStorage.setItem('logscrub_category_order', JSON.stringify(preset.categoryOrder))
    }
    if (preset.ruleOrder) {
      localStorage.setItem('logscrub_rule_order', JSON.stringify(preset.ruleOrder))
    }

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
    // Include ordering from localStorage
    let categoryOrder: string[] | undefined
    let ruleOrder: Record<string, string[]> | undefined
    try {
      const catOrderStr = localStorage.getItem('logscrub_category_order')
      if (catOrderStr) categoryOrder = JSON.parse(catOrderStr)
      const ruleOrderStr = localStorage.getItem('logscrub_rule_order')
      if (ruleOrderStr) ruleOrder = JSON.parse(ruleOrderStr)
    } catch {}
    return { name: 'Exported Rules', rules: { ...rules }, customRules: [...customRules], consistencyMode, categoryOrder, ruleOrder }
  },

  resetToDefaults: () => {
    saveRulesToStorage(DEFAULT_RULES)
    saveCustomRulesToStorage([])
    set({ rules: DEFAULT_RULES, customRules: [], consistencyMode: false })
  },

  processText: async (text) => {
    if (!text.trim()) return

    cancelRequested = false
    set({ isProcessing: true, processingProgress: 0, canCancel: true, analysisReplacements: [], analysisStats: {}, analysisCompleted: false })

    try {
      const { rules, customRules, plainTextPatterns, consistencyMode, preservePrivateIPs, timeShift, labelFormat, globalTemplate, fileName } = get()
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
          } else if (e.data.type === 'syntax_error') {
            set({ syntaxError: e.data.payload, syntaxValidFormat: null })
          } else if (e.data.type === 'syntax_valid') {
            set({ syntaxValidFormat: e.data.payload, syntaxError: null })
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
            preservePrivateIPs,
            timeShift: timeShift.enabled ? timeShift : null,
            labelFormat,
            globalTemplate,
            fileName
          }
        })
      })

      if (!cancelRequested) {
        let finalOutput = result.output
        let finalStats = result.stats
        let finalMatches = result.matches || {}
        let finalReplacements = result.replacements || []

        // Run ML NER if enabled and model is ready
        const { mlNameDetectionEnabled, mlLoadingState, rules: currentRules, labelFormat: currentLabelFormat } = get()
        if (mlNameDetectionEnabled && mlLoadingState === 'ready') {
          try {
            const { runNER } = await import('../utils/nerDetection')
            const nerResult = await runNER(text)

            // Collect ML replacements (on original text positions)
            const mlReplacements: ReplacementInfo[] = []
            const mlMatches: DetectionMatches = {
              ml_person_name: [],
              ml_location: [],
              ml_organization: []
            }

            const counters: Record<string, number> = {
              ml_person_name: 0,
              ml_location: 0,
              ml_organization: 0
            }

            for (const entity of nerResult.entities) {
              if (entity.score < 0.85) continue

              // Skip very short words - single letters are false positives
              if (entity.word.length < 2) continue

              let piiType: string
              switch (entity.entityGroup) {
                case 'PER':
                  piiType = 'ml_person_name'
                  break
                case 'LOC':
                  piiType = 'ml_location'
                  break
                case 'ORG':
                  piiType = 'ml_organization'
                  break
                default:
                  continue
              }

              if (!currentRules[piiType]?.enabled) continue

              // Check if this position overlaps with any WASM replacement
              const overlapsWithWasm = finalReplacements.some(r =>
                (entity.start >= r.start && entity.start < r.end) ||
                (entity.end > r.start && entity.end <= r.end) ||
                (entity.start <= r.start && entity.end >= r.end)
              )
              if (overlapsWithWasm) continue // Skip - WASM already handled this region

              // Use the actual text from the source, not the tokenizer's reconstruction
              const originalText = text.slice(entity.start, entity.end)

              counters[piiType]++
              const strategy = currentRules[piiType]?.strategy || 'label'
              const template = currentRules[piiType]?.template || get().globalTemplate

              let replacement: string
              if (strategy === 'redact') {
                replacement = '█'.repeat(originalText.length)
              } else if (strategy === 'realistic') {
                // Use WASM to generate realistic fake data
                try {
                  const { generate_realistic_fake } = await import('../wasm-core/wasm_core')
                  replacement = generate_realistic_fake(piiType, originalText)
                } catch {
                  // Fallback to label if WASM call fails
                  const typeLabel = piiType.replace('ml_', '').toUpperCase()
                  replacement = `${currentLabelFormat.prefix}${typeLabel}-${counters[piiType]}${currentLabelFormat.suffix}`
                }
              } else if (strategy === 'template' && template) {
                const typeLabel = piiType.replace('ml_', '').toUpperCase()
                replacement = template
                  .replace(/\{TYPE\}|\{T\}/gi, typeLabel)
                  .replace(/\{n\}|\{N\}/gi, String(counters[piiType]))
                  .replace(/\{len\}|\{LEN\}/gi, String(originalText.length))
              } else {
                const typeLabel = piiType.replace('ml_', '').toUpperCase()
                replacement = `${currentLabelFormat.prefix}${typeLabel}-${counters[piiType]}${currentLabelFormat.suffix}`
              }

              if (!mlMatches[piiType].includes(originalText)) {
                mlMatches[piiType].push(originalText)
              }

              mlReplacements.push({
                start: entity.start,
                end: entity.end,
                original: originalText,
                replacement,
                pii_type: piiType
              })
            }

            // Apply ML replacements to the WASM output
            // We need to map original positions to output positions using WASM replacements
            if (mlReplacements.length > 0) {
              // Build position offset map from WASM replacements
              const wasmReplacements = [...finalReplacements].sort((a, b) => a.start - b.start)
              let offset = 0
              const offsets: Array<{ originalPos: number; offset: number }> = [{ originalPos: 0, offset: 0 }]

              for (const r of wasmReplacements) {
                const lengthDiff = r.replacement.length - r.original.length
                offset += lengthDiff
                offsets.push({ originalPos: r.end, offset })
              }

              // Function to map original position to output position
              const mapPosition = (origPos: number): number => {
                let currentOffset = 0
                for (const o of offsets) {
                  if (origPos >= o.originalPos) {
                    currentOffset = o.offset
                  } else {
                    break
                  }
                }
                return origPos + currentOffset
              }

              // Apply ML replacements in reverse order (by mapped position)
              const mappedMlReplacements = mlReplacements.map(r => ({
                ...r,
                mappedStart: mapPosition(r.start),
                mappedEnd: mapPosition(r.end)
              })).sort((a, b) => b.mappedStart - a.mappedStart)

              let outputChars = [...finalOutput]
              for (const r of mappedMlReplacements) {
                // Verify the text at this position matches
                const textAtPos = outputChars.slice(r.mappedStart, r.mappedEnd).join('')
                if (textAtPos === r.original) {
                  outputChars.splice(r.mappedStart, r.mappedEnd - r.mappedStart, ...r.replacement)
                } else {
                  console.warn(`ML replacement mismatch at ${r.mappedStart}-${r.mappedEnd}: expected "${r.original}", found "${textAtPos}"`)
                }
              }
              finalOutput = outputChars.join('')

              // Merge stats
              for (const [type, values] of Object.entries(mlMatches)) {
                if (values.length > 0) {
                  finalStats = { ...finalStats, [type]: values.length }
                  finalMatches = { ...finalMatches, [type]: values }
                }
              }
              finalReplacements = [...finalReplacements, ...mlReplacements]
            }
          } catch (err) {
            console.warn('ML NER failed during processing:', err)
          }
        }

        // Validate line count
        const inputLines = text.split('\n').length
        const outputLines = finalOutput.split('\n').length
        let lineCountWarning: string | null = null

        if (outputLines < inputLines) {
          const linesLost = inputLines - outputLines
          lineCountWarning = `Warning: ${linesLost} line${linesLost === 1 ? '' : 's'} ${linesLost === 1 ? 'was' : 'were'} removed during processing. This may indicate a pattern matching issue.`
          console.warn(`Line count mismatch: input had ${inputLines} lines, output has ${outputLines} lines`)
        }

        set({
          output: finalOutput,
          stats: finalStats,
          matches: finalMatches,
          replacements: finalReplacements,
          lineCountWarning
        })
      }
    } catch {
    } finally {
      set({ isProcessing: false, processingProgress: 0, canCancel: false })
    }
  },

  analyzeText: async (text) => {
    if (!text.trim()) return

    cancelRequested = false
    set({ isAnalyzing: true, analysisStage: 'Running pattern detection...', processingProgress: 0, canCancel: true, output: '', replacements: [], stats: {}, suggestions: [], showSuggestions: false, analysisCompleted: false, analysisLogs: [], contextMatches: [], syntaxError: null, syntaxValidFormat: null })

    try {
      const { rules, customRules, plainTextPatterns, consistencyMode, preservePrivateIPs, labelFormat, globalTemplate, fileName } = get()

      const allRules = Object.entries(rules)
        .map(([id, rule]) => ({ id, strategy: rule.strategy, template: rule.template }))

      const allCustomRules = customRules
        .map(rule => ({ id: rule.id, strategy: rule.strategy, pattern: rule.pattern, isCustom: true }))

      const allPlainTextPatterns = plainTextPatterns
        .map(p => ({ id: p.id, strategy: p.strategy, text: p.text, label: p.label }))

      const w = getWorker()

      const result = await new Promise<{ output: string; stats: DetectionStats; matches: DetectionMatches; replacements: ReplacementInfo[]; contextMatches?: ContextMatch[] }>((resolve, reject) => {
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
          } else if (e.data.type === 'syntax_error') {
            set({ syntaxError: e.data.payload, syntaxValidFormat: null })
          } else if (e.data.type === 'syntax_valid') {
            set({ syntaxValidFormat: e.data.payload, syntaxError: null })
          }
        }

        w.addEventListener('message', handler)
        w.postMessage({
          type: 'process',
          payload: { text, rules: allRules, customRules: allCustomRules, plainTextPatterns: allPlainTextPatterns, consistencyMode, preservePrivateIPs, labelFormat, globalTemplate, fileName }
        })
      })

      if (!cancelRequested) {
        const suggestions: RuleSuggestion[] = []
        let matches = result.matches || {}
        let stats = result.stats || {}
        let allReplacements = result.replacements || []

        // Run ML NER if enabled and model is ready
        const { mlNameDetectionEnabled, mlLoadingState } = get()
        if (mlNameDetectionEnabled && mlLoadingState === 'ready') {
          set({ analysisStage: 'Running ML name detection...' })
          try {
            const { runNER } = await import('../utils/nerDetection')
            const nerResult = await runNER(text)

            // Group entities by type
            const mlMatches: DetectionMatches = {
              ml_person_name: [],
              ml_location: [],
              ml_organization: []
            }
            const mlReplacements: ReplacementInfo[] = []

            // Track unique values to avoid duplicates
            const seenValues = new Set<string>()

            for (const entity of nerResult.entities) {
              // Skip low-confidence detections (lowered from 0.85 to 0.7)
              if (entity.score < 0.7) continue

              // Skip very short words - single letters are false positives
              if (entity.word.length < 2) continue

              // Skip if we've already seen this exact value at this position
              const key = `${entity.word}-${entity.start}-${entity.end}`
              if (seenValues.has(key)) continue
              seenValues.add(key)

              let piiType: string
              switch (entity.entityGroup) {
                case 'PER':
                  piiType = 'ml_person_name'
                  break
                case 'LOC':
                  piiType = 'ml_location'
                  break
                case 'ORG':
                  piiType = 'ml_organization'
                  break
                default:
                  continue // Skip MISC
              }

              // Use the actual text from the source, not the tokenizer's reconstruction
              const originalText = text.slice(entity.start, entity.end)

              // Add to matches
              if (!mlMatches[piiType].includes(originalText)) {
                mlMatches[piiType].push(originalText)
              }

              // Get the rule's strategy
              const rule = rules[piiType]
              const strategy = rule?.strategy || 'label'
              const matchIndex = mlMatches[piiType].length

              // Generate replacement based on strategy
              let replacement: string
              if (strategy === 'redact') {
                replacement = '█'.repeat(Math.max(8, originalText.length))
              } else if (strategy === 'realistic') {
                try {
                  const { generate_realistic_fake } = await import('../wasm-core/wasm_core')
                  replacement = generate_realistic_fake(piiType, originalText)
                } catch {
                  // Fallback to label if WASM call fails
                  replacement = `[${piiType.toUpperCase().replace('ML_', '')}-${matchIndex}]`
                }
              } else if (strategy === 'template' && rule?.template) {
                replacement = rule.template
                  .replace('{n}', String(matchIndex))
                  .replace('{TYPE}', piiType.toUpperCase().replace('ML_', ''))
                  .replace('{type}', piiType.replace('ml_', ''))
              } else {
                // Default: label
                replacement = `[${piiType.toUpperCase().replace('ML_', '')}-${matchIndex}]`
              }

              // Add to replacements
              mlReplacements.push({
                start: entity.start,
                end: entity.end,
                original: originalText,
                replacement,
                pii_type: piiType
              })
            }

            // Merge ML results with WASM results
            for (const [type, values] of Object.entries(mlMatches)) {
              if (values.length > 0) {
                matches = { ...matches, [type]: values }
                stats = { ...stats, [type]: values.length }
              }
            }

            // Merge replacements (sort by position to handle overlaps)
            allReplacements = [...allReplacements, ...mlReplacements].sort((a, b) => a.start - b.start)
          } catch (err) {
            console.warn('ML NER failed:', err)
            // Continue with WASM-only results
          }
        }

        set({ analysisStage: 'Computing suggestions...' })

        const extractSamplesWithContext = (piiType: string, maxSamples: number): SampleSnippet[] => {
          const typeReplacements = allReplacements.filter(r => r.pii_type === piiType).slice(0, maxSamples)
          return typeReplacements.map(r => {
            const contextBefore = text.slice(Math.max(0, r.start - 30), r.start)
            const contextAfter = text.slice(r.end, Math.min(text.length, r.end + 30))

            // Respect line boundaries
            let before = contextBefore.includes('\n')
              ? contextBefore.slice(contextBefore.lastIndexOf('\n') + 1)
              : contextBefore
            let after = contextAfter.includes('\n')
              ? contextAfter.slice(0, contextAfter.indexOf('\n'))
              : contextAfter

            // Extend to word boundaries if we're mid-word
            if (before.length > 0 && before.length < contextBefore.length && !/\s/.test(before[0])) {
              const spaceIdx = before.indexOf(' ')
              if (spaceIdx !== -1 && spaceIdx < 10) {
                before = before.slice(spaceIdx + 1)
              }
            }
            if (after.length > 0 && after.length < contextAfter.length && !/\s/.test(after[after.length - 1])) {
              const spaceIdx = after.lastIndexOf(' ')
              if (spaceIdx !== -1 && after.length - spaceIdx < 10) {
                after = after.slice(0, spaceIdx)
              }
            }

            const truncatedBefore = before.length < contextBefore.length
            const truncatedAfter = after.length < contextAfter.length

            return { before, match: r.original, after, truncatedBefore, truncatedAfter }
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

        // Use allReplacements (includes ML) not just result.replacements (WASM only)
        const enabledReplacements = allReplacements.filter(r => {
          const rule = rules[r.pii_type]
          const customRule = customRules.find(cr => cr.id === r.pii_type)
          const plainText = plainTextPatterns.find(p => p.id === r.pii_type)
          return (rule?.enabled) || (customRule?.enabled) || (plainText?.enabled)
        })

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
          showSuggestions: suggestions.length > 0 || activeMatches.length > 0 || (result.contextMatches && result.contextMatches.length > 0),
          contextMatches: result.contextMatches || []
        })
      }
    } catch {
    } finally {
      set({ isAnalyzing: false, analysisStage: '', processingProgress: 0, canCancel: false })
    }
  },

  clearAnalysis: () => set({ analysisReplacements: [], analysisStats: {}, analysisMatches: {}, analysisCompleted: false, suggestions: [], activeMatches: [], unmatchedRules: [], showSuggestions: false, contextMatches: [] }),

  dismissSuggestions: () => set({ showSuggestions: false, suggestionsInitialTab: null }),
  setShowSuggestions: (show, initialTab) => set({ showSuggestions: show, suggestionsInitialTab: initialTab ?? null }),

  enableSuggestedRule: (id) => {
    const { rules, customRules, plainTextPatterns, suggestions, activeMatches } = get()
    const suggestion = suggestions.find(s => s.id === id)
    if (!suggestion) return

    const newSuggestions = suggestions.filter(s => s.id !== id)
    const newActiveMatches = [...activeMatches, suggestion].sort((a, b) => b.count - a.count)

    if (rules[id]) {
      const newRules = { ...rules, [id]: { ...rules[id], enabled: true } }
      saveRulesToStorage(newRules)
      set({
        rules: newRules,
        suggestions: newSuggestions,
        activeMatches: newActiveMatches
      })
    } else {
      const customIdx = customRules.findIndex(r => r.id === id)
      if (customIdx >= 0) {
        const updated = [...customRules]
        updated[customIdx] = { ...updated[customIdx], enabled: true }
        saveCustomRulesToStorage(updated)
        set({
          customRules: updated,
          suggestions: newSuggestions,
          activeMatches: newActiveMatches
        })
      } else {
        const plainIdx = plainTextPatterns.findIndex(p => p.id === id)
        if (plainIdx >= 0) {
          const updated = [...plainTextPatterns]
          updated[plainIdx] = { ...updated[plainIdx], enabled: true }
          savePlainTextPatternsToStorage(updated)
          set({
            plainTextPatterns: updated,
            suggestions: newSuggestions,
            activeMatches: newActiveMatches
          })
        }
      }
    }
  },

  disableActiveMatch: (id) => {
    const { rules, customRules, plainTextPatterns, activeMatches, suggestions } = get()
    const match = activeMatches.find(m => m.id === id)
    if (!match) return

    const newActiveMatches = activeMatches.filter(m => m.id !== id)
    const newSuggestions = [...suggestions, match].sort((a, b) => b.count - a.count)

    if (rules[id]) {
      const newRules = { ...rules, [id]: { ...rules[id], enabled: false } }
      saveRulesToStorage(newRules)
      set({
        rules: newRules,
        activeMatches: newActiveMatches,
        suggestions: newSuggestions
      })
    } else {
      const customIdx = customRules.findIndex(r => r.id === id)
      if (customIdx >= 0) {
        const updated = [...customRules]
        updated[customIdx] = { ...updated[customIdx], enabled: false }
        saveCustomRulesToStorage(updated)
        set({
          customRules: updated,
          activeMatches: newActiveMatches,
          suggestions: newSuggestions
        })
      } else {
        const plainIdx = plainTextPatterns.findIndex(p => p.id === id)
        if (plainIdx >= 0) {
          const updated = [...plainTextPatterns]
          updated[plainIdx] = { ...updated[plainIdx], enabled: false }
          savePlainTextPatternsToStorage(updated)
          set({
            plainTextPatterns: updated,
            activeMatches: newActiveMatches,
            suggestions: newSuggestions
          })
        }
      }
    }
  },

  enableAllSuggested: () => {
    const { rules, customRules, plainTextPatterns, suggestions, activeMatches } = get()
    const suggestedIds = new Set(suggestions.map(s => s.id))

    const newRules = { ...rules }
    suggestedIds.forEach(id => {
      if (newRules[id]) {
        newRules[id] = { ...newRules[id], enabled: true }
      }
    })
    saveRulesToStorage(newRules)

    const newCustomRules = customRules.map(r =>
      suggestedIds.has(r.id) ? { ...r, enabled: true } : r
    )
    saveCustomRulesToStorage(newCustomRules)

    const newPlainText = plainTextPatterns.map(p =>
      suggestedIds.has(p.id) ? { ...p, enabled: true } : p
    )
    savePlainTextPatternsToStorage(newPlainText)

    // Move all suggestions to activeMatches
    const newActiveMatches = [...activeMatches, ...suggestions].sort((a, b) => b.count - a.count)

    set({
      rules: newRules,
      customRules: newCustomRules,
      plainTextPatterns: newPlainText,
      suggestions: [],
      activeMatches: newActiveMatches,
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
    saveRulesToStorage(newRules)

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
  },

  addContextMatchAsPattern: (match: ContextMatch) => {
    const { plainTextPatterns, contextMatches } = get()
    const id = `context_${Date.now()}`
    const newPattern: PlainTextPattern = {
      id,
      text: match.value,
      label: match.key,
      enabled: true,
      strategy: 'redact'
    }
    const updated = [...plainTextPatterns, newPattern]
    savePlainTextPatternsToStorage(updated)

    // Remove this match from contextMatches since it's now a pattern
    const newContextMatches = contextMatches.filter(
      m => !(m.start === match.start && m.end === match.end)
    )

    set({
      plainTextPatterns: updated,
      contextMatches: newContextMatches
    })
  },

  setSyntaxError: (error) => set({ syntaxError: error }),

  setSyntaxValidFormat: (format) => set({ syntaxValidFormat: format }),

  // ML Name Detection actions
  setMlNameDetection: (enabled) => {
    const { mlModelId, rules } = get()
    saveMLSettingsToStorage({ enabled, modelId: mlModelId })

    // Auto-enable/disable the ML rules when toggling ML detection
    const mlRuleIds = ['ml_person_name', 'ml_location', 'ml_organization']
    const newRules = { ...rules }
    for (const id of mlRuleIds) {
      if (newRules[id]) {
        newRules[id] = { ...newRules[id], enabled }
      }
    }
    saveRulesToStorage(newRules)

    set({ mlNameDetectionEnabled: enabled, rules: newRules })

    // If disabling, unload the model to free memory
    if (!enabled) {
      get().unloadMlModel()
    }
  },

  setMlModelId: (modelId) => {
    const { mlNameDetectionEnabled } = get()
    saveMLSettingsToStorage({ enabled: mlNameDetectionEnabled, modelId })
    set({ mlModelId: modelId })

    // If a model is currently loaded and we're changing models, unload the old one
    const { mlLoadingState } = get()
    if (mlLoadingState === 'ready') {
      get().unloadMlModel()
    }
  },

  loadMlModel: async () => {
    const { mlModelId, mlLoadingState } = get()
    if (mlLoadingState === 'loading') return
    if (mlLoadingState === 'ready') return

    set({ mlLoadingState: 'loading', mlLoadProgress: 0, mlError: null })

    try {
      // Dynamic import for lazy loading
      const { loadNERPipeline, onLoadProgress } = await import('../utils/nerDetection')

      // Set up progress tracking
      const unsubscribe = onLoadProgress((progress) => {
        set({ mlLoadProgress: progress })
      })

      await loadNERPipeline(mlModelId)
      unsubscribe()

      set({ mlLoadingState: 'ready', mlLoadProgress: 100 })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load ML model'
      set({
        mlLoadingState: 'error',
        mlError: errorMessage,
        mlLoadProgress: 0
      })
    }
  },

  unloadMlModel: () => {
    // Dynamic import and unload
    import('../utils/nerDetection').then(({ unloadNERPipeline }) => {
      unloadNERPipeline()
    }).catch(() => {})

    set({
      mlLoadingState: 'idle',
      mlLoadProgress: 0,
      mlError: null
    })
  },

  // Multi-file actions
  addFiles: async (fileList) => {
    const { files: existingFiles } = get()

    // Check file count limit
    if (existingFiles.length + fileList.length > MAX_FILES) {
      throw new Error(`Maximum ${MAX_FILES} files allowed`)
    }

    // Read files and check size
    const newEntries: FileEntry[] = []
    let totalSize = existingFiles.reduce((sum, f) => sum + f.size, 0)

    for (const file of fileList) {
      totalSize += file.size
      if (totalSize > MAX_TOTAL_SIZE) {
        throw new Error(`Total file size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB limit`)
      }

      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
        reader.readAsText(file)
      })

      newEntries.push(createEmptyFileEntry(file.name, file.size, text))
    }

    const allFiles = [...existingFiles, ...newEntries]
    const isMultiFileMode = allFiles.length > 1

    // If first file, auto-select it and sync with input
    const firstNewFile = newEntries[0]
    const selectedFileId = existingFiles.length === 0 && firstNewFile
      ? firstNewFile.id
      : get().selectedFileId

    set({
      files: allFiles,
      isMultiFileMode,
      selectedFileId,
      // Sync with single-file mode state
      input: selectedFileId === firstNewFile?.id ? firstNewFile.content : get().input,
      fileName: selectedFileId === firstNewFile?.id ? firstNewFile.name : get().fileName,
      output: '',
      stats: {},
      matches: {},
      replacements: [],
      analysisReplacements: [],
      analysisStats: {},
      analysisMatches: {},
      analysisCompleted: false
    })
  },

  addFilesFromZip: async (data, _zipFileName) => {
    // Extract all text files from the ZIP using WASM decompress_zip_multi
    const { files: existingFiles } = get()
    const { decompress_zip_multi } = await import('../wasm-core/wasm_core')

    try {
      const resultJson = decompress_zip_multi(data)
      const extractedFiles: Array<{ name: string; content: string; size: number }> = JSON.parse(resultJson)

      if (extractedFiles.length === 0) {
        throw new Error('No text files found in ZIP archive')
      }

      // Check file count limit
      const totalFileCount = existingFiles.length + extractedFiles.length
      if (totalFileCount > MAX_FILES) {
        throw new Error(`Cannot add ${extractedFiles.length} files: would exceed limit of ${MAX_FILES} files (currently have ${existingFiles.length})`)
      }

      // Check total size limit
      const existingTotalSize = existingFiles.reduce((sum, f) => sum + f.size, 0)
      const newTotalSize = extractedFiles.reduce((sum, f) => sum + f.size, 0)
      if (existingTotalSize + newTotalSize > MAX_TOTAL_SIZE) {
        throw new Error(`Cannot add files: would exceed total size limit of ${Math.round(MAX_TOTAL_SIZE / 1024 / 1024)}MB`)
      }

      // Create FileEntry for each extracted file
      const newEntries = extractedFiles.map(f => createEmptyFileEntry(f.name, f.size, f.content))
      const allFiles = [...existingFiles, ...newEntries]
      const isMultiFileMode = allFiles.length > 1

      // Select the first new file if no files were previously loaded
      const firstNewFile = newEntries[0]

      set({
        files: allFiles,
        isMultiFileMode,
        selectedFileId: existingFiles.length === 0 ? firstNewFile.id : get().selectedFileId,
        input: existingFiles.length === 0 ? firstNewFile.content : get().input,
        fileName: existingFiles.length === 0 ? firstNewFile.name : get().fileName
      })
    } catch (e) {
      if (e instanceof Error) {
        throw e
      }
      // WASM errors come as strings or JsValue
      const message = typeof e === 'string' ? e : String(e)
      throw new Error(message || 'Failed to extract ZIP contents')
    }
  },

  removeFile: (fileId) => {
    const { files, selectedFileId } = get()
    const newFiles = files.filter(f => f.id !== fileId)
    const isMultiFileMode = newFiles.length > 1

    // If we removed the selected file, select another one
    let newSelectedFileId = selectedFileId
    if (selectedFileId === fileId) {
      newSelectedFileId = newFiles.length > 0 ? newFiles[0].id : null
    }

    // Sync with single-file state
    const selectedFile = newFiles.find(f => f.id === newSelectedFileId)

    set({
      files: newFiles,
      isMultiFileMode,
      selectedFileId: newSelectedFileId,
      input: selectedFile?.content || '',
      fileName: selectedFile?.name || null,
      output: selectedFile?.scrubbedContent || '',
      stats: selectedFile?.stats || {},
      matches: selectedFile?.matches || {},
      replacements: selectedFile?.replacements || [],
      analysisStats: selectedFile?.analysisStats || {},
      analysisMatches: selectedFile?.analysisMatches || {},
      analysisReplacements: selectedFile?.analysisReplacements || []
    })

    // Recompute aggregated stats
    if (newFiles.length > 0) {
      get().computeAggregatedStats()
    } else {
      set({ aggregatedStats: null })
    }
  },

  clearAllFiles: () => {
    set({
      files: [],
      selectedFileId: null,
      isMultiFileMode: false,
      aggregatedStats: null,
      isBatchAnalyzing: false,
      isBatchProcessing: false,
      batchProgress: { current: 0, total: 0, currentFileName: '' },
      input: '',
      output: '',
      fileName: null,
      stats: {},
      matches: {},
      replacements: [],
      analysisStats: {},
      analysisMatches: {},
      analysisReplacements: [],
      analysisCompleted: false
    })
  },

  selectFile: (fileId) => {
    const { files } = get()
    const file = files.find(f => f.id === fileId)
    if (!file) return

    set({
      selectedFileId: fileId,
      input: file.content,
      fileName: file.name,
      output: file.scrubbedContent || '',
      stats: file.stats,
      matches: file.matches,
      replacements: file.replacements,
      analysisStats: file.analysisStats,
      analysisMatches: file.analysisMatches,
      analysisReplacements: file.analysisReplacements,
      analysisCompleted: Object.keys(file.analysisStats).length > 0 || Object.keys(file.stats).length > 0
    })
  },

  analyzeAllFiles: async () => {
    const { files, rules, customRules, plainTextPatterns, consistencyMode, preservePrivateIPs, labelFormat, globalTemplate } = get()
    if (files.length === 0) return

    set({
      isBatchAnalyzing: true,
      batchProgress: { current: 0, total: files.length, currentFileName: '' }
    })

    const w = getWorker()

    // Shared consistency map for cross-file consistency
    const allRules = Object.entries(rules)
      .map(([id, rule]) => ({ id, strategy: rule.strategy, template: rule.template }))
    const allCustomRules = customRules
      .map(rule => ({ id: rule.id, strategy: rule.strategy, pattern: rule.pattern, isCustom: true }))
    const allPlainTextPatterns = plainTextPatterns
      .map(p => ({ id: p.id, strategy: p.strategy, text: p.text, label: p.label }))

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      set({
        batchProgress: { current: i + 1, total: files.length, currentFileName: file.name }
      })

      try {
        // Update file status
        get().updateFileResult(file.id, { status: 'analyzing' })

        const result = await new Promise<{ output: string; stats: DetectionStats; matches: DetectionMatches; replacements: ReplacementInfo[] }>((resolve, reject) => {
          const handler = (e: MessageEvent) => {
            if (e.data.type === 'result') {
              w.removeEventListener('message', handler)
              resolve(e.data.payload)
            } else if (e.data.type === 'error') {
              w.removeEventListener('message', handler)
              reject(new Error(e.data.payload))
            }
          }

          w.addEventListener('message', handler)
          w.postMessage({
            type: 'process',
            payload: {
              text: file.content,
              rules: allRules,
              customRules: allCustomRules,
              plainTextPatterns: allPlainTextPatterns,
              consistencyMode,
              preservePrivateIPs,
              labelFormat,
              globalTemplate,
              fileName: file.name
            }
          })
        })

        // Filter to enabled rules only for analysis display
        const enabledStats: DetectionStats = {}
        const enabledMatches: DetectionMatches = {}
        const enabledReplacements: ReplacementInfo[] = []

        Object.entries(result.stats).forEach(([id, count]) => {
          const rule = rules[id]
          const customRule = customRules.find(r => r.id === id)
          const plainText = plainTextPatterns.find(p => p.id === id)
          if ((rule?.enabled) || (customRule?.enabled) || (plainText?.enabled)) {
            enabledStats[id] = count
            if (result.matches[id]) {
              enabledMatches[id] = result.matches[id]
            }
          }
        })

        result.replacements?.forEach(r => {
          const rule = rules[r.pii_type]
          const customRule = customRules.find(cr => cr.id === r.pii_type)
          const plainText = plainTextPatterns.find(p => p.id === r.pii_type)
          if ((rule?.enabled) || (customRule?.enabled) || (plainText?.enabled)) {
            enabledReplacements.push(r)
          }
        })

        get().updateFileResult(file.id, {
          status: 'analyzed',
          analysisStats: enabledStats,
          analysisMatches: enabledMatches,
          analysisReplacements: enabledReplacements
        })
      } catch (err) {
        get().updateFileResult(file.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Analysis failed'
        })
      }
    }

    // Compute aggregated stats
    get().computeAggregatedStats()

    // Update selected file's state in main store
    const { selectedFileId, files: updatedFiles } = get()
    const selectedFile = updatedFiles.find(f => f.id === selectedFileId)
    if (selectedFile) {
      set({
        analysisStats: selectedFile.analysisStats,
        analysisMatches: selectedFile.analysisMatches,
        analysisReplacements: selectedFile.analysisReplacements,
        analysisCompleted: true
      })
    }

    set({
      isBatchAnalyzing: false,
      batchProgress: { current: 0, total: 0, currentFileName: '' }
    })
  },

  processAllFiles: async () => {
    const { files, rules, customRules, plainTextPatterns, consistencyMode, preservePrivateIPs, timeShift, labelFormat, globalTemplate } = get()
    if (files.length === 0) return

    set({
      isBatchProcessing: true,
      batchProgress: { current: 0, total: files.length, currentFileName: '' }
    })

    const w = getWorker()

    const enabledRules = Object.entries(rules)
      .filter(([, rule]) => rule.enabled)
      .map(([id, rule]) => ({ id, strategy: rule.strategy, template: rule.template }))
    const enabledCustomRules = customRules
      .filter(rule => rule.enabled)
      .map(rule => ({ id: rule.id, strategy: rule.strategy, pattern: rule.pattern, isCustom: true }))
    const enabledPlainTextPatterns = plainTextPatterns
      .filter(p => p.enabled)
      .map(p => ({ id: p.id, strategy: p.strategy, text: p.text, label: p.label }))

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      set({
        batchProgress: { current: i + 1, total: files.length, currentFileName: file.name }
      })

      try {
        get().updateFileResult(file.id, { status: 'processing' })

        const result = await new Promise<{ output: string; stats: DetectionStats; matches: DetectionMatches; replacements: ReplacementInfo[] }>((resolve, reject) => {
          const handler = (e: MessageEvent) => {
            if (e.data.type === 'result') {
              w.removeEventListener('message', handler)
              resolve(e.data.payload)
            } else if (e.data.type === 'error') {
              w.removeEventListener('message', handler)
              reject(new Error(e.data.payload))
            }
          }

          w.addEventListener('message', handler)
          w.postMessage({
            type: 'process',
            payload: {
              text: file.content,
              rules: enabledRules,
              customRules: enabledCustomRules,
              plainTextPatterns: enabledPlainTextPatterns,
              consistencyMode,
              preservePrivateIPs,
              timeShift: timeShift.enabled ? timeShift : null,
              labelFormat,
              globalTemplate,
              fileName: file.name
            }
          })
        })

        get().updateFileResult(file.id, {
          status: 'processed',
          scrubbedContent: result.output,
          stats: result.stats,
          matches: result.matches || {},
          replacements: result.replacements || []
        })
      } catch (err) {
        get().updateFileResult(file.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Processing failed'
        })
      }
    }

    // Compute aggregated stats
    get().computeAggregatedStats()

    // Update selected file's state in main store
    const { selectedFileId, files: updatedFiles } = get()
    const selectedFile = updatedFiles.find(f => f.id === selectedFileId)
    if (selectedFile) {
      set({
        output: selectedFile.scrubbedContent || '',
        stats: selectedFile.stats,
        matches: selectedFile.matches,
        replacements: selectedFile.replacements
      })
    }

    set({
      isBatchProcessing: false,
      batchProgress: { current: 0, total: 0, currentFileName: '' }
    })
  },

  computeAggregatedStats: () => {
    const { files } = get()
    if (files.length === 0) {
      set({ aggregatedStats: null })
      return
    }

    const byType: DetectionStats = {}
    const byFile: Record<string, number> = {}
    const allMatches: DetectionMatches = {}
    const allReplacements: ReplacementInfo[] = []

    for (const file of files) {
      // Use processed stats if available, otherwise analysis stats
      const fileStats = Object.keys(file.stats).length > 0 ? file.stats : file.analysisStats
      const fileMatches = Object.keys(file.matches).length > 0 ? file.matches : file.analysisMatches
      const fileReplacements = file.replacements.length > 0 ? file.replacements : file.analysisReplacements

      let fileTotal = 0
      for (const [type, count] of Object.entries(fileStats)) {
        byType[type] = (byType[type] || 0) + count
        fileTotal += count

        if (fileMatches[type]) {
          allMatches[type] = [...(allMatches[type] || []), ...fileMatches[type]]
        }
      }
      byFile[file.id] = fileTotal
      allReplacements.push(...fileReplacements)
    }

    const totalDetections = Object.values(byType).reduce((sum, count) => sum + count, 0)

    set({
      aggregatedStats: {
        totalDetections,
        byType,
        byFile,
        allMatches,
        allReplacements
      }
    })
  },

  updateFileResult: (fileId, result) => {
    const { files } = get()
    const updatedFiles = files.map(f =>
      f.id === fileId ? { ...f, ...result } : f
    )
    set({ files: updatedFiles })
  },

  exportAllAsZip: async () => {
    const { files } = get()
    const processedFiles = files.filter(f => f.scrubbedContent !== null)

    if (processedFiles.length === 0) {
      throw new Error('No processed files to export')
    }

    // Import WASM create_multi_zip
    const { create_multi_zip } = await import('../wasm-core/wasm_core')

    // Prepare files for ZIP
    const zipFiles = processedFiles.map(f => ({
      name: `scrubbed_${f.name}`,
      content: f.scrubbedContent || ''
    }))

    // Create ZIP
    const zipData = create_multi_zip(JSON.stringify(zipFiles))

    // Download the ZIP
    const blob = new Blob([zipData], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'scrubbed_files.zip'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}))
