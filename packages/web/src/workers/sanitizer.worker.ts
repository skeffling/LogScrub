import init, { sanitize, validate_syntax } from 'wasm-core'
import { detectJsonSecrets, isLikelyJson, detectCsvNameColumns, isLikelyCsv, type ContextMatch } from '../utils/contextAwareDetector'

let wasmInitialized = false

async function initWasm() {
  if (!wasmInitialized) {
    await init()
    wasmInitialized = true
  }
}

interface TimeShiftConfig {
  enabled: boolean
  mode: 'offset' | 'start'
  offsetHours: number
  offsetMinutes: number
  startDate: string
  startTime: string
  lineOnly: boolean
}

interface LabelFormat {
  prefix: string
  suffix: string
}

interface ProcessRequest {
  text: string
  rules: Array<{ id: string; strategy: string; template?: string }>
  customRules?: Array<{ id: string; strategy: string; pattern: string; isCustom: boolean; template?: string }>
  plainTextPatterns?: Array<{ id: string; strategy: string; text: string; label: string }>
  consistencyMode: boolean
  preservePrivateIPs?: boolean
  timeShift?: TimeShiftConfig | null
  labelFormat?: LabelFormat
  globalTemplate?: string
  fileName?: string
}

interface Match {
  type: string
  value: string
  start: number
  end: number
}

interface ValidationResult {
  valid: boolean
  format: string
  error_message?: string
  line?: number
  column?: number
}

interface ReplacementInfo {
  start: number
  end: number
  original: string
  replacement: string
  pii_type: string
}

function applyTemplate(template: string, vars: { n: number; type: string; original: string }): string {
  return template
    .replace(/\{n\}/g, String(vars.n))
    .replace(/\{type\}/g, vars.type)
    .replace(/\{TYPE\}/g, vars.type.toUpperCase())
    .replace(/\{original\}/g, vars.original)
    .replace(/\{len\}/g, String(vars.original.length))
}

// Check if an IPv4 address is in a private/reserved range (RFC1918 + loopback + link-local)
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return false

  const [a, b] = parts

  // 10.0.0.0/8 - Private
  if (a === 10) return true
  // 172.16.0.0/12 - Private (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16 - Private
  if (a === 192 && b === 168) return true
  // 127.0.0.0/8 - Loopback
  if (a === 127) return true
  // 169.254.0.0/16 - Link-local
  if (a === 169 && b === 254) return true

  return false
}

// Check if an IPv6 address is in a private/reserved range
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()

  // ::1 - Loopback
  if (normalized === '::1') return true

  // fe80::/10 - Link-local
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb')) return true

  // fc00::/7 - Unique local (fc00::/8 and fd00::/8)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true

  // :: or ::ffff:x.x.x.x (IPv4-mapped) - check the IPv4 part
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.slice(7)
    if (ipv4Part.includes('.')) {
      return isPrivateIPv4(ipv4Part)
    }
  }

  return false
}

interface TimestampFormatDetails {
  separator?: string      // 'T' or ' ' for ISO
  hasMilliseconds?: boolean
  hasTimezone?: boolean
  timezoneValue?: string  // e.g., 'Z', '+00:00', '-05:00'
}

interface TimestampMatch {
  start: number
  end: number
  original: string
  date: Date
  format: string
  formatDetails?: TimestampFormatDetails
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
}

function parseMonth(str: string): number {
  return MONTHS[str.toLowerCase().slice(0, 3)] ?? 0
}

const TIMESTAMP_PATTERNS: Array<{ regex: RegExp; parser: (m: RegExpExecArray) => Date | null; format: string; getFormatDetails?: (m: RegExpExecArray) => TimestampFormatDetails }> = [
  {
    regex: /(\d{4})-(\d{2})-(\d{2})([T\s])(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|([+-])(\d{2}):?(\d{2}))?/g,
    parser: (m) => {
      const date = new Date(
        parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]),
        parseInt(m[5]), parseInt(m[6]), parseInt(m[7]), parseInt(m[8] || '0')
      )
      if (m[10]) {
        const sign = m[10] === '+' ? -1 : 1
        date.setHours(date.getHours() + sign * parseInt(m[11]))
        date.setMinutes(date.getMinutes() + sign * parseInt(m[12]))
      }
      return date
    },
    format: 'iso',
    getFormatDetails: (m) => ({
      separator: m[4],
      hasMilliseconds: !!m[8],
      hasTimezone: !!m[9],
      timezoneValue: m[9] || undefined
    })
  },
  {
    regex: /\[([A-Za-z]{3})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})\]/g,
    parser: (m) => new Date(
      parseInt(m[7]), parseMonth(m[2]), parseInt(m[3]),
      parseInt(m[4]), parseInt(m[5]), parseInt(m[6])
    ),
    format: 'apache-error'
  },
  {
    regex: /\[(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?\]/g,
    parser: (m) => new Date(
      parseInt(m[3]), parseMonth(m[2]), parseInt(m[1]),
      parseInt(m[4]), parseInt(m[5]), parseInt(m[6])
    ),
    format: 'apache-access'
  },
  {
    regex: /(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?/g,
    parser: (m) => new Date(
      parseInt(m[3]), parseMonth(m[2]), parseInt(m[1]),
      parseInt(m[4]), parseInt(m[5]), parseInt(m[6])
    ),
    format: 'clf-datetime'
  },
  {
    regex: /([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/g,
    parser: (m) => {
      const now = new Date()
      return new Date(now.getFullYear(), parseMonth(m[1]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4]), parseInt(m[5]))
    },
    format: 'syslog'
  },
  {
    regex: /(\d{4})-(\d{2})-(\d{2})/g,
    parser: (m) => new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])),
    format: 'date-iso'
  },
  {
    regex: /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/g,
    parser: (m) => new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6])),
    format: 'us-datetime'
  },
  {
    regex: /(\d{2})\/(\d{2})\/(\d{4})/g,
    parser: (m) => new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2])),
    format: 'us-date'
  }
]

function formatTimestamp(date: Date, format: string, formatDetails?: TimestampFormatDetails): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  switch (format) {
    case 'iso': {
      const sep = formatDetails?.separator || 'T'
      let result = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}${sep}${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
      if (formatDetails?.hasMilliseconds) {
        result += `.${pad(date.getMilliseconds(), 3)}`
      }
      if (formatDetails?.hasTimezone) {
        result += formatDetails.timezoneValue || 'Z'
      }
      return result
    }
    case 'date-iso':
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    case 'apache-error':
      return `[${DAY_NAMES[date.getDay()]} ${MONTH_NAMES[date.getMonth()]} ${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${date.getFullYear()}]`
    case 'apache-access':
      return `[${pad(date.getDate())}/${MONTH_NAMES[date.getMonth()]}/${date.getFullYear()}:${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} +0000]`
    case 'clf-datetime':
      return `${pad(date.getDate())}/${MONTH_NAMES[date.getMonth()]}/${date.getFullYear()}:${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} +0000`
    case 'syslog':
      return `${MONTH_NAMES[date.getMonth()]} ${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    case 'us-datetime':
      return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    case 'us-date':
      return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`
    default:
      return date.toISOString()
  }
}

function isAtLineStart(text: string, position: number): boolean {
  if (position === 0) return true
  const charBefore = text[position - 1]
  return charBefore === '\n' || charBefore === '\r'
}

function shiftTimestamps(text: string, config: TimeShiftConfig): string {
  if (!config.enabled) return text

  let allMatches: TimestampMatch[] = []

  for (const pattern of TIMESTAMP_PATTERNS) {
    pattern.regex.lastIndex = 0
    let match
    while ((match = pattern.regex.exec(text)) !== null) {
      const date = pattern.parser(match)
      if (date && !isNaN(date.getTime())) {
        const overlaps = allMatches.some(
          m => (match!.index >= m.start && match!.index < m.end) ||
               (match!.index + match![0].length > m.start && match!.index + match![0].length <= m.end)
        )
        if (!overlaps) {
          allMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            original: match[0],
            date,
            format: pattern.format,
            formatDetails: pattern.getFormatDetails?.(match)
          })
        }
      }
    }
  }

  if (config.lineOnly) {
    allMatches = allMatches.filter(m => isAtLineStart(text, m.start))
  }

  if (allMatches.length === 0) return text

  allMatches.sort((a, b) => a.start - b.start)

  let offsetMs: number
  if (config.mode === 'offset') {
    offsetMs = (config.offsetHours * 60 + config.offsetMinutes) * 60 * 1000
  } else {
    const firstTimestamp = allMatches[0].date
    const targetStart = new Date(`${config.startDate}T${config.startTime || '00:00'}:00`)
    if (isNaN(targetStart.getTime())) return text
    offsetMs = targetStart.getTime() - firstTimestamp.getTime()
  }

  allMatches.sort((a, b) => b.start - a.start)
  
  let result = text
  for (const m of allMatches) {
    const newDate = new Date(m.date.getTime() + offsetMs)
    const newTimestamp = formatTimestamp(newDate, m.format, m.formatDetails)
    result = result.slice(0, m.start) + newTimestamp + result.slice(m.end)
  }

  return result
}

function processUrlParams(
  text: string,
  strategy: string,
  consistencyMode: boolean,
  labelPrefix: string,
  labelSuffix: string
): { output: string; stats: Record<string, number>; matches: Record<string, string[]>; replacements: ReplacementInfo[] } {
  const stats: Record<string, number> = {}
  const matches: Record<string, string[]> = {}
  const allMatches: Array<{ start: number; end: number; key: string; value: string; prefix: string }> = []

  // Match URL query parameters: ?key=value or &key=value
  // Also handles parameters in the middle of URLs
  const paramRegex = /([?&])([a-zA-Z_][a-zA-Z0-9_]*)=([^&\s"'<>]*)/g
  let match
  while ((match = paramRegex.exec(text)) !== null) {
    const [full, prefix, key, value] = match
    if (value.length > 0) {  // Only match if there's a value
      allMatches.push({
        start: match.index,
        end: match.index + full.length,
        key,
        value,
        prefix  // ? or &
      })
    }
  }

  if (allMatches.length === 0) {
    return { output: text, stats: {}, matches: {}, replacements: [] }
  }

  const consistencyMap: Record<string, string> = {}
  let counter = 0
  const replacements: ReplacementInfo[] = []

  for (const m of allMatches) {
    stats['url_params'] = (stats['url_params'] || 0) + 1
    if (!matches['url_params']) matches['url_params'] = []
    matches['url_params'].push(`${m.key}=${m.value}`)

    let replacementValue: string
    if (consistencyMode && consistencyMap[m.value]) {
      replacementValue = consistencyMap[m.value]
    } else {
      counter++
      if (strategy === 'redact') {
        replacementValue = '█'.repeat(Math.min(m.value.length, 16))
      } else {
        // label strategy - preserve key, replace value
        replacementValue = `${labelPrefix}PARAM-${counter}${labelSuffix}`
      }
      if (consistencyMode) {
        consistencyMap[m.value] = replacementValue
      }
    }

    // The replacement preserves the prefix (? or &) and key, only replaces value
    const fullReplacement = `${m.prefix}${m.key}=${replacementValue}`
    replacements.push({
      start: m.start,
      end: m.end,
      original: `${m.prefix}${m.key}=${m.value}`,
      replacement: fullReplacement,
      pii_type: 'url_params'
    })
  }

  // Apply replacements in reverse order
  allMatches.sort((a, b) => b.start - a.start)
  let output = text
  for (const m of allMatches) {
    const rep = replacements.find(r => r.start === m.start && r.end === m.end)
    if (rep) {
      output = output.slice(0, m.start) + rep.replacement + output.slice(m.end)
    }
  }

  return { output, stats, matches, replacements }
}

function processPlainTextPatterns(
  text: string,
  patterns: Array<{ id: string; strategy: string; text: string; label: string }>,
  consistencyMode: boolean,
  labelPrefix: string,
  labelSuffix: string
): { output: string; stats: Record<string, number>; matches: Record<string, string[]>; replacements: ReplacementInfo[] } {
  const stats: Record<string, number> = {}
  const matches: Record<string, string[]> = {}
  const allMatches: Match[] = []

  for (const pattern of patterns) {
    let searchIndex = 0
    while (true) {
      const idx = text.toLowerCase().indexOf(pattern.text.toLowerCase(), searchIndex)
      if (idx === -1) break
      
      const matchedText = text.slice(idx, idx + pattern.text.length)
      allMatches.push({
        type: pattern.id,
        value: matchedText,
        start: idx,
        end: idx + pattern.text.length
      })
      stats[pattern.id] = (stats[pattern.id] || 0) + 1
      if (!matches[pattern.id]) matches[pattern.id] = []
      matches[pattern.id].push(matchedText)
      
      searchIndex = idx + pattern.text.length
    }
  }

  allMatches.sort((a, b) => a.start - b.start)

  const consistencyMap: Record<string, string> = {}
  const typeCounters: Record<string, number> = {}
  const replacements: ReplacementInfo[] = []

  for (const m of allMatches) {
    const pattern = patterns.find(p => p.id === m.type)
    const strategy = pattern?.strategy || 'label'
    const label = pattern?.label || m.type

    let replacement: string
    if (consistencyMode && consistencyMap[m.value.toLowerCase()]) {
      replacement = consistencyMap[m.value.toLowerCase()]
    } else {
      typeCounters[m.type] = (typeCounters[m.type] || 0) + 1
      
      if (strategy === 'label') {
        replacement = `${labelPrefix}${label.toUpperCase()}-${typeCounters[m.type]}${labelSuffix}`
      } else if (strategy === 'redact') {
        replacement = '█'.repeat(Math.min(m.value.length, 16))
      } else {
        replacement = `${labelPrefix}${label.toUpperCase()}${labelSuffix}`
      }
      
      if (consistencyMode) {
        consistencyMap[m.value.toLowerCase()] = replacement
      }
    }

    replacements.push({
      start: m.start,
      end: m.end,
      original: m.value,
      replacement,
      pii_type: m.type
    })
  }

  allMatches.sort((a, b) => b.start - a.start)
  let output = text
  for (const m of allMatches) {
    const rep = replacements.find(r => r.start === m.start && r.end === m.end)
    if (rep) {
      output = output.slice(0, m.start) + rep.replacement + output.slice(m.end)
    }
  }

  return { output, stats, matches, replacements }
}

function processCustomRules(
  text: string,
  customRules: Array<{ id: string; strategy: string; pattern: string; template?: string }>,
  consistencyMode: boolean,
  labelPrefix: string,
  labelSuffix: string
): { output: string; stats: Record<string, number>; matches: Record<string, string[]>; replacements: ReplacementInfo[] } {
  const stats: Record<string, number> = {}
  const matches: Record<string, string[]> = {}
  const allMatches: Match[] = []

  for (const rule of customRules) {
    try {
      const regex = new RegExp(rule.pattern, 'gi')
      let match
      while ((match = regex.exec(text)) !== null) {
        allMatches.push({
          type: rule.id,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length
        })
        stats[rule.id] = (stats[rule.id] || 0) + 1
        if (!matches[rule.id]) matches[rule.id] = []
        matches[rule.id].push(match[0])
      }
    } catch {
    }
  }

  allMatches.sort((a, b) => a.start - b.start)

  const consistencyMap: Record<string, string> = {}
  const typeCounters: Record<string, number> = {}
  const replacements: ReplacementInfo[] = []

  for (const m of allMatches) {
    const rule = customRules.find(r => r.id === m.type)
    const strategy = rule?.strategy || 'label'

    let replacement: string
    if (consistencyMode && consistencyMap[m.value]) {
      replacement = consistencyMap[m.value]
    } else {
      typeCounters[m.type] = (typeCounters[m.type] || 0) + 1
      
      if (strategy === 'template' && rule?.template) {
        replacement = applyTemplate(rule.template, { n: typeCounters[m.type], type: m.type, original: m.value })
      } else if (strategy === 'label') {
        replacement = `${labelPrefix}${m.type.toUpperCase()}-${typeCounters[m.type]}${labelSuffix}`
      } else if (strategy === 'redact') {
        replacement = '█'.repeat(Math.min(m.value.length, 16))
      } else {
        replacement = `${labelPrefix}${m.type.toUpperCase()}${labelSuffix}`
      }
      
      if (consistencyMode) {
        consistencyMap[m.value] = replacement
      }
    }

    replacements.push({
      start: m.start,
      end: m.end,
      original: m.value,
      replacement,
      pii_type: m.type
    })
  }

  allMatches.sort((a, b) => b.start - a.start)
  let output = text
  for (const m of allMatches) {
    const rep = replacements.find(r => r.start === m.start && r.end === m.end)
    if (rep) {
      output = output.slice(0, m.start) + rep.replacement + output.slice(m.end)
    }
  }

  return { output, stats, matches, replacements }
}

function log(message: string) {
  self.postMessage({ type: 'log', payload: message })
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type === 'process') {
    try {
      const startTime = performance.now()
      log('Starting analysis...')
      self.postMessage({ type: 'progress', payload: 10 })

      log('Initializing WASM module...')
      await initWasm()
      log(`WASM initialized in ${(performance.now() - startTime).toFixed(0)}ms`)

      self.postMessage({ type: 'progress', payload: 30 })

      const { text, rules, customRules = [], plainTextPatterns = [], consistencyMode, preservePrivateIPs = false, timeShift, labelFormat, globalTemplate, fileName } = e.data.payload as ProcessRequest

      // Run syntax validation
      log('Running syntax validation...')
      const validationResultJson = validate_syntax(text, fileName || undefined)
      const validationResult: ValidationResult = JSON.parse(validationResultJson)

      if (!validationResult.valid && validationResult.format !== 'unknown') {
        log(`Syntax error detected in ${validationResult.format}: ${validationResult.error_message}`)
        self.postMessage({
          type: 'syntax_error',
          payload: {
            format: validationResult.format,
            message: validationResult.error_message,
            line: validationResult.line,
            column: validationResult.column
          }
        })
      } else if (validationResult.valid && validationResult.format !== 'unknown') {
        log(`Syntax valid: ${validationResult.format}`)
        self.postMessage({ type: 'syntax_valid', payload: validationResult.format })
      }
      const labelPrefix = labelFormat?.prefix ?? '['
      const labelSuffix = labelFormat?.suffix ?? ']'
      const defaultTemplate = globalTemplate ?? '[{TYPE}-{n}]'

      log(`Processing ${text.length.toLocaleString()} characters with ${rules.length} rules`)

      const TIMESTAMP_RULES = ['date_mdy', 'date_dmy', 'date_iso', 'time', 'datetime_iso', 'datetime_clf', 'timestamp_unix']
      const filteredRules = (timeShift?.enabled
        ? rules.filter(r => !TIMESTAMP_RULES.includes(r.id))
        : rules
      ).map(r => ({
        ...r,
        template: r.strategy === 'template' && !r.template ? defaultTemplate : r.template
      }))

      log(`Running ${filteredRules.length} pattern rules...`)
      const sanitizeStart = performance.now()

      const wasmResult = sanitize(
        text,
        JSON.stringify(filteredRules),
        consistencyMode,
        labelPrefix,
        labelSuffix
      )

      log(`Pattern matching completed in ${(performance.now() - sanitizeStart).toFixed(0)}ms`)
      self.postMessage({ type: 'progress', payload: 60 })

      let parsed = JSON.parse(wasmResult)

      // Send pattern logs to Info pane
      if (parsed.logs && Array.isArray(parsed.logs)) {
        for (const logEntry of parsed.logs) {
          log(logEntry)
        }
      }

      // Filter out private IPs if preservePrivateIPs is enabled
      if (preservePrivateIPs && parsed.replacements) {
        const filteredReplacements: ReplacementInfo[] = []
        let ipv4Preserved = 0
        let ipv6Preserved = 0

        for (const r of parsed.replacements as ReplacementInfo[]) {
          if (r.pii_type === 'ipv4' && isPrivateIPv4(r.original)) {
            ipv4Preserved++
            // Decrement stats
            if (parsed.stats.ipv4) parsed.stats.ipv4--
            // Remove from matches
            if (parsed.matches.ipv4) {
              parsed.matches.ipv4 = parsed.matches.ipv4.filter((m: string) => m !== r.original)
            }
          } else if (r.pii_type === 'ipv6' && isPrivateIPv6(r.original)) {
            ipv6Preserved++
            // Decrement stats
            if (parsed.stats.ipv6) parsed.stats.ipv6--
            // Remove from matches
            if (parsed.matches.ipv6) {
              parsed.matches.ipv6 = parsed.matches.ipv6.filter((m: string) => m !== r.original)
            }
          } else {
            filteredReplacements.push(r)
          }
        }

        // Reapply replacements to get correct output (since WASM already applied them)
        if (ipv4Preserved > 0 || ipv6Preserved > 0) {
          log(`Preserving private IPs: ${ipv4Preserved} IPv4, ${ipv6Preserved} IPv6`)

          // We need to regenerate the output since we're keeping some IPs
          // Sort by position descending to apply in reverse order
          const sortedReplacements = [...filteredReplacements].sort((a, b) => b.start - a.start)
          let output = text
          for (const r of sortedReplacements) {
            if (r.start >= 0 && r.end >= 0) {
              output = output.slice(0, r.start) + r.replacement + output.slice(r.end)
            }
          }
          parsed.output = output
          parsed.replacements = filteredReplacements
        }
      }

      const matchCount = Object.values(parsed.stats as Record<string, number>).reduce((a, b) => a + b, 0)
      log(`Found ${matchCount} matches across ${Object.keys(parsed.stats).length} pattern types`)

      // Process URL parameters if enabled
      const urlParamsRule = rules.find(r => r.id === 'url_params')
      if (urlParamsRule) {
        log('Processing URL parameters...')
        const urlParamsResult = processUrlParams(
          parsed.output,
          urlParamsRule.strategy,
          consistencyMode,
          labelPrefix,
          labelSuffix
        )

        const adjustedUrlParamsReplacements = urlParamsResult.replacements.map(r => ({
          ...r,
          start: -1,
          end: -1
        }))

        parsed = {
          output: urlParamsResult.output,
          stats: { ...parsed.stats, ...urlParamsResult.stats },
          matches: { ...parsed.matches, ...urlParamsResult.matches },
          replacements: [...(parsed.replacements || []), ...adjustedUrlParamsReplacements]
        }

        const urlParamCount = urlParamsResult.stats['url_params'] || 0
        if (urlParamCount > 0) {
          log(`Found ${urlParamCount} URL parameters`)
        }
      }

      if (customRules.length > 0) {
        log(`Processing ${customRules.length} custom regex rules...`)
        const rulesWithGlobalTemplate = customRules.map(r => ({
          ...r,
          template: r.strategy === 'template' && !r.template ? defaultTemplate : r.template
        }))
        const customResult = processCustomRules(parsed.output, rulesWithGlobalTemplate, consistencyMode, labelPrefix, labelSuffix)

        const adjustedCustomReplacements = customResult.replacements.map(r => ({
          ...r,
          start: -1,
          end: -1
        }))

        parsed = {
          output: customResult.output,
          stats: { ...parsed.stats, ...customResult.stats },
          matches: { ...parsed.matches, ...customResult.matches },
          replacements: [...(parsed.replacements || []), ...adjustedCustomReplacements]
        }
      }

      self.postMessage({ type: 'progress', payload: 80 })

      if (plainTextPatterns.length > 0) {
        log(`Processing ${plainTextPatterns.length} plain text patterns...`)
        const plainTextResult = processPlainTextPatterns(parsed.output, plainTextPatterns, consistencyMode, labelPrefix, labelSuffix)

        const adjustedPlainTextReplacements = plainTextResult.replacements.map(r => ({
          ...r,
          start: -1,
          end: -1
        }))

        parsed = {
          output: plainTextResult.output,
          stats: { ...parsed.stats, ...plainTextResult.stats },
          matches: { ...parsed.matches, ...plainTextResult.matches },
          replacements: [...(parsed.replacements || []), ...adjustedPlainTextReplacements]
        }
      }

      self.postMessage({ type: 'progress', payload: 90 })

      if (timeShift && timeShift.enabled) {
        log('Applying time shift...')
        parsed.output = shiftTimestamps(parsed.output, timeShift)
      }

      // Run context-aware detection on the original text
      let contextMatches: ContextMatch[] = []
      if (isLikelyJson(text)) {
        log('Detecting JSON key-based secrets...')
        contextMatches = detectJsonSecrets(text)
        if (contextMatches.length > 0) {
          log(`Found ${contextMatches.length} potential secrets via JSON key analysis`)
        }
      }

      // Run CSV/spreadsheet name column detection
      if (isLikelyCsv(text)) {
        log('Detecting CSV/spreadsheet name columns...')
        const csvMatches = detectCsvNameColumns(text)
        if (csvMatches.length > 0) {
          log(`Found ${csvMatches.length} names via CSV column header analysis`)
          contextMatches = [...contextMatches, ...csvMatches]
        }
      }

      const totalTime = performance.now() - startTime
      log(`Analysis complete in ${totalTime.toFixed(0)}ms`)

      self.postMessage({ type: 'progress', payload: 100 })

      self.postMessage({
        type: 'result',
        payload: {
          output: parsed.output,
          stats: parsed.stats,
          matches: parsed.matches,
          replacements: parsed.replacements || [],
          contextMatches
        }
      })
    } catch (error) {
      log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      self.postMessage({
        type: 'error',
        payload: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}
