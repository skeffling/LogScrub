import { useState, useMemo } from 'react'
import { useAppStore, type ReplacementInfo } from '../stores/useAppStore'
import { Modal } from './Modal'

export const TYPE_LABELS: Record<string, string> = {
  email: 'Emails',
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  mac_address: 'MAC',
  hostname: 'Hostnames',
  url: 'URLs',
  phone_us: 'Phone (US)',
  phone_uk: 'Phone (UK)',
  phone_intl: 'Phone (Intl)',
  ssn: 'SSN',
  credit_card: 'Credit Cards',
  iban: 'IBAN',
  uuid: 'UUIDs',
  jwt: 'JWT',
  bearer_token: 'Bearer',
  aws_access_key: 'AWS Key',
  aws_secret_key: 'AWS Secret',
  stripe_key: 'Stripe',
  gcp_api_key: 'GCP Key',
  github_token: 'GitHub',
  slack_token: 'Slack',
  generic_secret: 'Secrets',
  private_key: 'Priv Key',
  basic_auth: 'Basic Auth',
  url_credentials: 'URL Creds',
  btc_address: 'BTC',
  eth_address: 'ETH',
  money: 'Money',
  gps_coordinates: 'GPS',
  file_path_unix: 'Path (Unix)',
  file_path_windows: 'Path (Win)',
  postcode_uk: 'UK Post',
  postcode_us: 'US Zip',
  passport: 'Passport',
  drivers_license: 'DL',
  session_id: 'Session',
  // Mail servers
  postfix_from: 'Postfix From',
  postfix_to: 'Postfix To',
  postfix_relay: 'Postfix Relay',
  postfix_sasl: 'Postfix SASL',
  dovecot_user: 'Dovecot User',
  dovecot_rip: 'Dovecot RIP',
  dovecot_lip: 'Dovecot LIP',
  sendmail_from: 'Sendmail From',
  sendmail_relay: 'Sendmail Relay',
  sendmail_msgid: 'Sendmail MsgID',
  ca_sin: 'CA SIN',
  vin: 'VIN',
}

// Color palette for the chart - grouped by category
const TYPE_COLORS: Record<string, string> = {
  // Contact - Blues
  email: '#3b82f6',
  phone_us: '#60a5fa',
  phone_uk: '#93c5fd',
  phone_intl: '#2563eb',
  // Network - Greens
  ipv4: '#22c55e',
  ipv6: '#4ade80',
  mac_address: '#86efac',
  hostname: '#16a34a',
  url: '#15803d',
  // Identity - Purples
  ssn: '#a855f7',
  passport: '#c084fc',
  drivers_license: '#d8b4fe',
  uk_nhs: '#9333ea',
  uk_nino: '#7c3aed',
  // Financial - Reds/Oranges
  credit_card: '#ef4444',
  iban: '#f87171',
  btc_address: '#f97316',
  eth_address: '#fb923c',
  money: '#dc2626',
  // Tokens/Secrets - Yellows/Ambers
  jwt: '#eab308',
  bearer_token: '#facc15',
  aws_access_key: '#fbbf24',
  aws_secret_key: '#f59e0b',
  stripe_key: '#d97706',
  gcp_api_key: '#b45309',
  github_token: '#92400e',
  slack_token: '#78350f',
  generic_secret: '#fcd34d',
  private_key: '#fde047',
  basic_auth: '#fef08a',
  url_credentials: '#ca8a04',
  session_id: '#a16207',
  // Other - Grays/Teals
  uuid: '#14b8a6',
  gps_coordinates: '#2dd4bf',
  file_path_unix: '#64748b',
  file_path_windows: '#94a3b8',
  postcode_uk: '#5eead4',
  postcode_us: '#99f6e4',
  // Mail servers - Purple shades
  postfix_from: '#8b5cf6',
  postfix_to: '#a78bfa',
  postfix_relay: '#c4b5fd',
  postfix_sasl: '#7c3aed',
  dovecot_user: '#6d28d9',
  dovecot_rip: '#5b21b6',
  dovecot_lip: '#4c1d95',
  sendmail_from: '#9333ea',
  sendmail_relay: '#a855f7',
  sendmail_msgid: '#d8b4fe',
  // Canadian / Vehicle
  ca_sin: '#c084fc',
  vin: '#0ea5e9',
}

const getTypeColor = (type: string): string => {
  return TYPE_COLORS[type] || '#6b7280'
}

// Category definitions for grouping
const CATEGORIES: Record<string, string[]> = {
  'Contact': ['email', 'phone_us', 'phone_uk', 'phone_intl'],
  'Network': ['ipv4', 'ipv6', 'mac_address', 'hostname', 'url', 'url_params'],
  'Identity (US)': ['ssn', 'us_itin', 'passport', 'drivers_license'],
  'Identity (UK)': ['uk_nhs', 'uk_nino'],
  'Identity (Intl)': ['au_tfn', 'in_pan', 'sg_nric', 'ca_sin'],
  'Financial': ['credit_card', 'iban', 'btc_address', 'eth_address', 'money'],
  'Tokens & Keys': ['jwt', 'bearer_token', 'aws_access_key', 'aws_secret_key', 'stripe_key', 'gcp_api_key', 'github_token', 'slack_token', 'openai_key', 'anthropic_key', 'xai_key', 'cerebras_key'],
  'Secrets': ['generic_secret', 'high_entropy_secret', 'private_key', 'basic_auth', 'url_credentials', 'session_id'],
  'Location': ['gps_coordinates', 'postcode_uk', 'postcode_us'],
  'Date & Time': ['date_mdy', 'date_dmy', 'date_iso', 'time', 'datetime_iso', 'datetime_clf', 'datetime_human', 'timestamp_unix'],
  'SQL': ['sql_tables', 'sql_strings', 'sql_identifiers'],
  'Exim': ['exim_subject', 'exim_sender', 'exim_auth', 'exim_user', 'exim_dn'],
  'Postfix': ['postfix_from', 'postfix_to', 'postfix_relay', 'postfix_sasl'],
  'Dovecot': ['dovecot_user', 'dovecot_rip', 'dovecot_lip'],
  'Sendmail': ['sendmail_from', 'sendmail_relay', 'sendmail_msgid'],
  'Hashes': ['md5_hash', 'sha1_hash', 'sha256_hash', 'docker_container_id'],
  'Other': ['uuid', 'email_message_id', 'file_path_unix', 'file_path_windows', 'vin'],
}

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  'Contact': '#3b82f6',
  'Network': '#22c55e',
  'Identity (US)': '#a855f7',
  'Identity (UK)': '#9333ea',
  'Identity (Intl)': '#7c3aed',
  'Financial': '#ef4444',
  'Tokens & Keys': '#eab308',
  'Secrets': '#f59e0b',
  'Location': '#14b8a6',
  'Date & Time': '#6366f1',
  'SQL': '#ec4899',
  'Exim': '#8b5cf6',
  'Postfix': '#7c3aed',
  'Dovecot': '#a78bfa',
  'Sendmail': '#c4b5fd',
  'Hashes': '#64748b',
  'Other': '#6b7280',
}

const getCategoryColor = (category: string): string => {
  return CATEGORY_COLORS[category] || '#6b7280'
}

// Find category for a type
const getCategoryForType = (type: string): string | null => {
  for (const [category, types] of Object.entries(CATEGORIES)) {
    if (types.includes(type)) return category
  }
  return null
}

interface MatchesModalProps {
  type: string
  matches: string[]
  onClose: () => void
}

function MatchesModal({ type, matches, onClose }: MatchesModalProps) {
  const uniqueMatches = [...new Set(matches)]
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[60vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {TYPE_LABELS[type] || type} ({matches.length} found, {uniqueMatches.length} unique)
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {uniqueMatches.map((match, i) => (
              <div 
                key={i}
                className="font-mono text-sm p-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-800 dark:text-gray-200 break-all"
              >
                {match}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface MappingEntry {
  replacement: string
  original: string
  pii_type: string
  count: number
  lines: number[]
}

function buildMappingTable(replacements: ReplacementInfo[], inputText: string): MappingEntry[] {
  const lineOffsets: number[] = []
  let offset = 0
  const lines = inputText.split('\n')
  for (const line of lines) {
    lineOffsets.push(offset)
    offset += line.length + 1
  }

  const findLineNumber = (position: number): number => {
    for (let i = 0; i < lineOffsets.length; i++) {
      const lineStart = lineOffsets[i]
      const lineEnd = i < lineOffsets.length - 1 ? lineOffsets[i + 1] - 1 : Infinity
      if (position >= lineStart && position <= lineEnd) {
        return i + 1
      }
    }
    return -1
  }

  const map = new Map<string, MappingEntry>()

  for (const rep of replacements) {
    const key = rep.replacement
    const existing = map.get(key)
    const lineNum = rep.start >= 0 ? findLineNumber(rep.start) : -1

    if (existing) {
      existing.count++
      if (lineNum > 0 && !existing.lines.includes(lineNum)) {
        existing.lines.push(lineNum)
      }
    } else {
      map.set(key, {
        replacement: rep.replacement,
        original: rep.original,
        pii_type: rep.pii_type,
        count: 1,
        lines: lineNum > 0 ? [lineNum] : []
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const typeCompare = a.pii_type.localeCompare(b.pii_type)
    if (typeCompare !== 0) return typeCompare
    return a.replacement.localeCompare(b.replacement)
  })
}

function getRuleSource(ruleId: string): 'Builtin' | 'Custom' | 'ML' | 'Context' {
  if (ruleId.startsWith('custom_rule_') || ruleId.startsWith('plain_')) return 'Custom'
  if (ruleId.startsWith('ml_')) return 'ML'
  if (ruleId.startsWith('csv_') || ruleId.startsWith('json_')) return 'Context'
  return 'Builtin'
}

const SOURCE_COLORS: Record<string, string> = {
  Builtin: 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300',
  Custom: 'bg-blue-200 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  ML: 'bg-purple-200 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
  Context: 'bg-teal-200 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300',
}

function SourceBadge({ ruleId }: { ruleId: string }) {
  const source = getRuleSource(ruleId)
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${SOURCE_COLORS[source]}`}>
      {source}
    </span>
  )
}

function StrategyPill({ strategy }: { strategy: string }) {
  return (
    <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
      {strategy}
    </span>
  )
}

export function Stats() {
  const { stats, matches, fileName, analysisStats, analysisMatches, replacements, analysisReplacements, input, files, isMultiFileMode, aggregatedStats, selectedFileId, rules } = useAppStore()
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [showAuditReport, setShowAuditReport] = useState(false)
  const [activeTab, setActiveTab] = useState<'stats' | 'mapping'>('stats')
  const [statsView, setStatsView] = useState<'chart' | 'category' | 'list'>('chart')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [mappingSearch, setMappingSearch] = useState('')
  const [showMappingExport, setShowMappingExport] = useState(false)
  const [statsScope, setStatsScope] = useState<'all' | 'current'>('current')

  // For multi-file mode, determine which stats to display
  const currentFile = files.find(f => f.id === selectedFileId)
  const currentFileStats = currentFile
    ? (Object.keys(currentFile.stats).length > 0 ? currentFile.stats : currentFile.analysisStats)
    : {}
  const currentFileMatches = currentFile
    ? (Object.keys(currentFile.matches).length > 0 ? currentFile.matches : currentFile.analysisMatches)
    : {}
  const currentFileReplacements = currentFile
    ? (currentFile.replacements.length > 0 ? currentFile.replacements : currentFile.analysisReplacements)
    : []

  // Decide which stats to display based on scope
  const displayStats = isMultiFileMode && statsScope === 'all' && aggregatedStats
    ? aggregatedStats.byType
    : (Object.keys(stats).length > 0 ? stats : (isMultiFileMode ? currentFileStats : analysisStats))
  const displayMatches = isMultiFileMode && statsScope === 'all' && aggregatedStats
    ? aggregatedStats.allMatches
    : (Object.keys(matches).length > 0 ? matches : (isMultiFileMode ? currentFileMatches : analysisMatches))
  const displayReplacements = isMultiFileMode && statsScope === 'all' && aggregatedStats
    ? aggregatedStats.allReplacements
    : (replacements.length > 0 ? replacements : (isMultiFileMode ? currentFileReplacements : analysisReplacements))
  const isPreview = Object.keys(stats).length === 0 && Object.keys(analysisStats).length > 0

  const total = Object.values(displayStats).reduce((sum, count) => sum + count, 0)
  const entries = Object.entries(displayStats).filter(([, count]) => count > 0)

  // Group entries by category
  const categoryGroupings = useMemo(() => {
    const groups: Record<string, { types: Array<{ type: string; count: number }>; total: number }> = {}

    for (const [type, count] of entries) {
      const category = getCategoryForType(type) || 'Other'
      if (!groups[category]) {
        groups[category] = { types: [], total: 0 }
      }
      groups[category].types.push({ type, count })
      groups[category].total += count
    }

    // Sort types within each category by count
    for (const group of Object.values(groups)) {
      group.types.sort((a, b) => b.count - a.count)
    }

    // Convert to array and sort by total
    return Object.entries(groups)
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.total - a.total)
  }, [entries])

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const mappingTable = useMemo(() => buildMappingTable(displayReplacements, input), [displayReplacements, input])

  const filteredMappingTable = useMemo(() => {
    if (!mappingSearch.trim()) return mappingTable
    const search = mappingSearch.toLowerCase()
    return mappingTable.filter(entry =>
      entry.replacement.toLowerCase().includes(search) ||
      entry.original.toLowerCase().includes(search) ||
      entry.pii_type.toLowerCase().includes(search)
    )
  }, [mappingTable, mappingSearch])

  const generateMappingExport = (format: 'json' | 'csv') => {
    if (format === 'json') {
      const data: Record<string, { original: string; type: string; count: number; lines: number[] }> = {}
      for (const entry of mappingTable) {
        data[entry.replacement] = {
          original: entry.original,
          type: entry.pii_type,
          count: entry.count,
          lines: entry.lines
        }
      }
      const content = JSON.stringify(data, null, 2)
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mapping-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const rows = [['Replacement', 'Original', 'Type', 'Count', 'Lines']]
      for (const entry of mappingTable) {
        rows.push([
          `"${entry.replacement}"`,
          `"${entry.original.replace(/"/g, '""')}"`,
          entry.pii_type,
          String(entry.count),
          `"${entry.lines.join(', ')}"`
        ])
      }
      const content = rows.map(r => r.join(',')).join('\n')
      const blob = new Blob([content], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mapping-${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const copyMappingToClipboard = async () => {
    const data: Record<string, string> = {}
    for (const entry of mappingTable) {
      data[entry.replacement] = entry.original
    }
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
  }

  const generateAuditReport = (format: 'json' | 'txt' | 'html') => {
    const timestamp = new Date().toISOString()
    const reportData = {
      timestamp,
      fileName: fileName || 'untitled',
      summary: {
        totalDetections: total,
        uniqueTypes: entries.length,
        byType: Object.fromEntries(entries.map(([type, count]) => [TYPE_LABELS[type] || type, count]))
      },
      detections: Object.fromEntries(
        entries.map(([type, count]) => [
          TYPE_LABELS[type] || type,
          {
            count,
            uniqueValues: [...new Set(displayMatches[type] || [])].slice(0, 100)
          }
        ])
      )
    }

    let content: string
    let mimeType: string
    let extension: string

    if (format === 'json') {
      content = JSON.stringify(reportData, null, 2)
      mimeType = 'application/json'
      extension = 'json'
    } else if (format === 'html') {
      content = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PII Audit Report</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#f5f5f5}
.card{background:white;border-radius:8px;padding:16px;margin:16px 0;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
h1{color:#1a1a1a}h2{color:#333;border-bottom:1px solid #eee;padding-bottom:8px}
.stat{display:flex;justify-content:space-between;padding:4px 0}
.type{color:#2563eb}.count{font-weight:600}
.values{font-family:monospace;font-size:12px;background:#f0f0f0;padding:8px;border-radius:4px;word-break:break-all}
.meta{color:#666;font-size:12px}</style></head>
<body><h1>PII Audit Report</h1>
<div class="card"><p class="meta">Generated: ${timestamp}</p><p class="meta">File: ${fileName || 'untitled'}</p></div>
<div class="card"><h2>Summary</h2>
<div class="stat"><span>Total Detections</span><span class="count">${total}</span></div>
<div class="stat"><span>Detection Types</span><span class="count">${entries.length}</span></div></div>
<div class="card"><h2>Detections by Type</h2>
${entries.map(([type, count]) => `<div class="stat"><span class="type">${TYPE_LABELS[type] || type}</span><span class="count">${count}</span></div>`).join('\n')}</div>
<div class="card"><h2>Detected Values</h2>
${entries.map(([type]) => {
  const uniqueVals = [...new Set(displayMatches[type] || [])].slice(0, 20)
  return `<h3>${TYPE_LABELS[type] || type}</h3><div class="values">${uniqueVals.join('<br>')}</div>`
}).join('\n')}</div></body></html>`
      mimeType = 'text/html'
      extension = 'html'
    } else {
      content = `PII AUDIT REPORT
================
Generated: ${timestamp}
File: ${fileName || 'untitled'}

SUMMARY
-------
Total Detections: ${total}
Detection Types: ${entries.length}

DETECTIONS BY TYPE
------------------
${entries.map(([type, count]) => `${(TYPE_LABELS[type] || type).padEnd(20)} ${count}`).join('\n')}

DETECTED VALUES
---------------
${entries.map(([type]) => {
  const uniqueVals = [...new Set(displayMatches[type] || [])].slice(0, 20)
  return `\n${TYPE_LABELS[type] || type}:\n${uniqueVals.map(v => `  - ${v}`).join('\n')}`
}).join('\n')}`
      mimeType = 'text/plain'
      extension = 'txt'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-report-${Date.now()}.${extension}`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (total === 0) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400">
        <p>No PII detected yet.</p>
        <p className="text-sm mt-1">Run Analyze or Scrub to see statistics.</p>
      </div>
    )
  }

  return (
    <>
      <div>
        {/* Multi-file scope toggle */}
        {isMultiFileMode && (
          <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <span className="text-xs text-blue-700 dark:text-blue-300">Show stats for:</span>
            <div className="flex rounded-lg overflow-hidden border border-blue-200 dark:border-blue-700">
              <button
                onClick={() => setStatsScope('current')}
                className={`px-2 py-1 text-xs font-medium transition-colors ${
                  statsScope === 'current'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                }`}
              >
                Current File
              </button>
              <button
                onClick={() => setStatsScope('all')}
                className={`px-2 py-1 text-xs font-medium transition-colors ${
                  statsScope === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                }`}
              >
                All Files ({files.length})
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 mb-4 border-b dark:border-gray-700">
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'stats'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Statistics
          </button>
          <button
            onClick={() => setActiveTab('mapping')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'mapping'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Mapping ({mappingTable.length})
          </button>
          <div className="flex-1" />
          {isPreview && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded">
              Preview
            </span>
          )}
        </div>

        {activeTab === 'stats' ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                <button
                  onClick={() => setStatsView('chart')}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    statsView === 'chart'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  title="Chart view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setStatsView('category')}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    statsView === 'category'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  title="Category groupings"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </button>
                <button
                  onClick={() => setStatsView('list')}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    statsView === 'list'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                  title="List view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>
              {!isPreview && (
                <button
                  onClick={() => setShowAuditReport(true)}
                  className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50"
                  title="Download a detailed audit report"
                >
                  Audit Report
                </button>
              )}
            </div>

            {statsView === 'chart' ? (
              <div className="space-y-2">
                {/* Horizontal bar chart */}
                <div className="space-y-1.5">
                  {entries
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => {
                      const percentage = total > 0 ? (count / total) * 100 : 0
                      const color = getTypeColor(type)
                      return (
                        <button
                          key={type}
                          onClick={() => setSelectedType(type)}
                          className="w-full group"
                        >
                          <div className="flex items-center gap-2 text-xs mb-0.5">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-gray-700 dark:text-gray-300 truncate flex-1 text-left group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center gap-1">
                              {TYPE_LABELS[type] || type}
                              <SourceBadge ruleId={type} />
                            </span>
                            <span className="text-gray-600 dark:text-gray-400 tabular-nums">
                              {count} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300 group-hover:opacity-80"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: color,
                                minWidth: count > 0 ? '4px' : '0'
                              }}
                            />
                          </div>
                        </button>
                      )
                    })}
                </div>

                {/* Summary row */}
                <div className="flex items-center justify-between pt-2 mt-2 border-t dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Total
                  </span>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {total} detections
                  </span>
                </div>

                {/* Pie chart visualization */}
                {entries.length > 1 && (
                  <div className="flex items-center justify-center pt-2">
                    <svg viewBox="0 0 100 100" className="w-32 h-32">
                      {(() => {
                        let cumulativePercent = 0
                        return entries
                          .sort((a, b) => b[1] - a[1])
                          .map(([type, count]) => {
                            const percentage = total > 0 ? (count / total) * 100 : 0
                            const startAngle = cumulativePercent * 3.6 // 360 / 100
                            cumulativePercent += percentage
                            const endAngle = cumulativePercent * 3.6

                            // Convert angles to radians and calculate arc
                            const startRad = (startAngle - 90) * Math.PI / 180
                            const endRad = (endAngle - 90) * Math.PI / 180
                            const largeArc = percentage > 50 ? 1 : 0

                            const x1 = 50 + 40 * Math.cos(startRad)
                            const y1 = 50 + 40 * Math.sin(startRad)
                            const x2 = 50 + 40 * Math.cos(endRad)
                            const y2 = 50 + 40 * Math.sin(endRad)

                            // Handle case where one type is 100%
                            if (percentage >= 99.9) {
                              return (
                                <circle
                                  key={type}
                                  cx="50"
                                  cy="50"
                                  r="40"
                                  fill={getTypeColor(type)}
                                  className="hover:opacity-80 cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); setSelectedType(type) }}
                                >
                                  <title>{TYPE_LABELS[type] || type}: {count} ({percentage.toFixed(1)}%)</title>
                                </circle>
                              )
                            }

                            return (
                              <path
                                key={type}
                                d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                fill={getTypeColor(type)}
                                className="hover:opacity-80 cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); setSelectedType(type) }}
                              >
                                <title>{TYPE_LABELS[type] || type}: {count} ({percentage.toFixed(1)}%)</title>
                              </path>
                            )
                          })
                      })()}
                      <circle cx="50" cy="50" r="20" className="fill-white dark:fill-gray-800" />
                      <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" className="fill-gray-900 dark:fill-white text-[8px] font-semibold">
                        {entries.length}
                      </text>
                      <text x="50" y="58" textAnchor="middle" dominantBaseline="middle" className="fill-gray-500 dark:fill-gray-400 text-[5px]">
                        types
                      </text>
                    </svg>
                  </div>
                )}
              </div>
            ) : statsView === 'category' ? (
              <div className="space-y-2">
                {categoryGroupings.map(({ category, types, total: categoryTotal }) => {
                  const isExpanded = expandedCategories.has(category)
                  const percentage = total > 0 ? (categoryTotal / total) * 100 : 0
                  const color = getCategoryColor(category)

                  return (
                    <div key={category} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <svg
                          className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="flex-1 text-left text-sm font-medium text-gray-900 dark:text-white">
                          {category}
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {types.length} type{types.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                          {categoryTotal}
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-400 w-12 text-right">
                          {percentage.toFixed(1)}%
                        </span>
                      </button>

                      {/* Category bar */}
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700">
                        <div
                          className="h-full transition-all duration-300"
                          style={{ width: `${percentage}%`, backgroundColor: color }}
                        />
                      </div>

                      {/* Expanded types */}
                      {isExpanded && (
                        <div className="bg-gray-50 dark:bg-gray-800/50 divide-y dark:divide-gray-700">
                          {types.map(({ type, count }) => {
                            const typePercentage = categoryTotal > 0 ? (count / categoryTotal) * 100 : 0
                            return (
                              <button
                                key={type}
                                onClick={(e) => { e.stopPropagation(); setSelectedType(type) }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 pl-8 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: getTypeColor(type) }}
                                />
                                <span className="flex-1 text-left text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1">
                                  {TYPE_LABELS[type] || type}
                                  <StrategyPill strategy={rules[type]?.strategy || 'label'} />
                                </span>
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                                  {count}
                                </span>
                                <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${typePercentage}%`, backgroundColor: getTypeColor(type) }}
                                  />
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Summary */}
                <div className="flex items-center justify-between pt-2 mt-2 border-t dark:border-gray-700">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {categoryGroupings.length} categories
                  </span>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {total} total
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {entries.map(([type, count]) => (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className="w-full flex items-center justify-between text-sm hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getTypeColor(type) }}
                      />
                      <span className="text-blue-600 dark:text-blue-400 hover:underline truncate">
                        {TYPE_LABELS[type] || type}
                      </span>
                      <SourceBadge ruleId={type} />
                      <StrategyPill strategy={rules[type]?.strategy || 'label'} />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white ml-2">{count}</span>
                  </button>
                ))}

                <hr className="my-3 dark:border-gray-700" />

                <div className="flex items-center justify-between text-sm font-semibold">
                  <span className="text-gray-900 dark:text-white">Total Detections</span>
                  <span className="text-blue-600 dark:text-blue-400">{total}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={mappingSearch}
                onChange={(e) => setMappingSearch(e.target.value)}
                placeholder="Search mappings..."
                className="flex-1 px-2 py-1 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <button
                onClick={() => setShowMappingExport(true)}
                className="text-xs px-2 py-1 rounded bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/50"
                title="Export mapping dictionary"
              >
                Export
              </button>
              <button
                onClick={copyMappingToClipboard}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                title="Copy mapping to clipboard"
              >
                Copy
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr className="text-left text-xs text-gray-600 dark:text-gray-400">
                    <th className="pb-2 pr-2">Replacement</th>
                    <th className="pb-2 pr-2">Original</th>
                    <th className="pb-2 pr-2 text-center">#</th>
                    <th className="pb-2">Lines</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {filteredMappingTable.map((entry, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-1.5 pr-2">
                        <code className="text-xs px-1 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 rounded">
                          {entry.replacement}
                        </code>
                      </td>
                      <td className="py-1.5 pr-2">
                        <code className="text-xs text-gray-700 dark:text-gray-300 break-all" title={entry.original}>
                          {entry.original.length > 25 ? entry.original.slice(0, 25) + '...' : entry.original}
                        </code>
                      </td>
                      <td className="py-1.5 pr-2 text-center text-gray-600 dark:text-gray-400">
                        {entry.count}
                      </td>
                      <td className="py-1.5 text-xs text-gray-600 dark:text-gray-400">
                        {entry.lines.length > 0 ? (
                          entry.lines.length > 3
                            ? `${entry.lines.slice(0, 3).join(', ')}...`
                            : entry.lines.join(', ')
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredMappingTable.length === 0 && (
                <div className="text-center py-4 text-gray-600 dark:text-gray-400 text-sm">
                  {mappingSearch ? 'No matches found' : 'No mappings available'}
                </div>
              )}
            </div>

            <hr className="my-3 dark:border-gray-700" />

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Unique replacements</span>
              <span className="font-medium text-gray-900 dark:text-white">{mappingTable.length}</span>
            </div>
          </>
        )}
      </div>
      
      {selectedType && displayMatches[selectedType] && (
        <MatchesModal
          type={selectedType}
          matches={displayMatches[selectedType]}
          onClose={() => setSelectedType(null)}
        />
      )}

      {showAuditReport && (
        <Modal onClose={() => setShowAuditReport(false)} title="Download Audit Report">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Download a detailed report of all PII detections found in your document.
            </p>
            
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => { generateAuditReport('txt'); setShowAuditReport(false) }}
                className="p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-center"
              >
                <div className="text-2xl mb-1">📄</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">Text</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">.txt</div>
              </button>
              <button
                onClick={() => { generateAuditReport('json'); setShowAuditReport(false) }}
                className="p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-center"
              >
                <div className="text-2xl mb-1">📋</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">JSON</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">.json</div>
              </button>
              <button
                onClick={() => { generateAuditReport('html'); setShowAuditReport(false) }}
                className="p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-center"
              >
                <div className="text-2xl mb-1">🌐</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">HTML</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">.html</div>
              </button>
            </div>
            
            <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-2 rounded">
              Report includes: {total} detections across {entries.length} types
            </div>
          </div>
        </Modal>
      )}

      {showMappingExport && (
        <Modal onClose={() => setShowMappingExport(false)} title="Export Mapping Dictionary">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Download the replacement mapping to reverse-lookup original values from scrubbed output.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { generateMappingExport('json'); setShowMappingExport(false) }}
                className="p-4 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-center"
              >
                <div className="text-2xl mb-1">📋</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">JSON</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">For programmatic use</div>
              </button>
              <button
                onClick={() => { generateMappingExport('csv'); setShowMappingExport(false) }}
                className="p-4 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-center"
              >
                <div className="text-2xl mb-1">📊</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">CSV</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">For spreadsheets</div>
              </button>
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-2 rounded">
              Includes {mappingTable.length} unique replacements with original values and line numbers
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
