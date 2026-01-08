import init, { sanitize } from 'wasm-core'

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

interface ProcessRequest {
  text: string
  rules: Array<{ id: string; strategy: string; template?: string }>
  customRules?: Array<{ id: string; strategy: string; pattern: string; isCustom: boolean; template?: string }>
  plainTextPatterns?: Array<{ id: string; strategy: string; text: string; label: string }>
  consistencyMode: boolean
  timeShift?: TimeShiftConfig | null
}

interface Match {
  type: string
  value: string
  start: number
  end: number
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

interface TimestampMatch {
  start: number
  end: number
  original: string
  date: Date
  format: string
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
}

function parseMonth(str: string): number {
  return MONTHS[str.toLowerCase().slice(0, 3)] ?? 0
}

const TIMESTAMP_PATTERNS: Array<{ regex: RegExp; parser: (m: RegExpExecArray) => Date | null; format: string }> = [
  {
    regex: /(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(?:Z|([+-])(\d{2}):?(\d{2}))?/g,
    parser: (m) => {
      const date = new Date(
        parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]),
        parseInt(m[4]), parseInt(m[5]), parseInt(m[6]), parseInt(m[7] || '0')
      )
      if (m[8]) {
        const sign = m[8] === '+' ? -1 : 1
        date.setHours(date.getHours() + sign * parseInt(m[9]))
        date.setMinutes(date.getMinutes() + sign * parseInt(m[10]))
      }
      return date
    },
    format: 'iso'
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

function formatTimestamp(date: Date, format: string): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  
  switch (format) {
    case 'iso':
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}Z`
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
            format: pattern.format
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
    const newTimestamp = formatTimestamp(newDate, m.format)
    result = result.slice(0, m.start) + newTimestamp + result.slice(m.end)
  }

  return result
}

function processPlainTextPatterns(
  text: string,
  patterns: Array<{ id: string; strategy: string; text: string; label: string }>,
  consistencyMode: boolean
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
        replacement = `[${label.toUpperCase()}-${typeCounters[m.type]}]`
      } else if (strategy === 'redact') {
        replacement = '█'.repeat(Math.min(m.value.length, 16))
      } else {
        replacement = `[${label.toUpperCase()}]`
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
  consistencyMode: boolean
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
        replacement = `[${m.type.toUpperCase()}-${typeCounters[m.type]}]`
      } else if (strategy === 'redact') {
        replacement = '█'.repeat(Math.min(m.value.length, 16))
      } else {
        replacement = `[${m.type.toUpperCase()}]`
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

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type === 'process') {
    try {
      self.postMessage({ type: 'progress', payload: 10 })
      
      await initWasm()
      
      self.postMessage({ type: 'progress', payload: 30 })
      
      const { text, rules, customRules = [], plainTextPatterns = [], consistencyMode, timeShift } = e.data.payload as ProcessRequest
      
      const TIMESTAMP_RULES = ['date_mdy', 'date_dmy', 'date_iso', 'time', 'datetime_iso', 'datetime_clf', 'timestamp_unix']
      const filteredRules = timeShift?.enabled 
        ? rules.filter(r => !TIMESTAMP_RULES.includes(r.id))
        : rules
      
      const wasmResult = sanitize(
        text,
        JSON.stringify(filteredRules),
        consistencyMode
      )
      
      self.postMessage({ type: 'progress', payload: 60 })
      
      let parsed = JSON.parse(wasmResult)
      
      if (customRules.length > 0) {
        const customResult = processCustomRules(parsed.output, customRules, consistencyMode)
        
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
        const plainTextResult = processPlainTextPatterns(parsed.output, plainTextPatterns, consistencyMode)
        
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
        parsed.output = shiftTimestamps(parsed.output, timeShift)
      }
      
      self.postMessage({ type: 'progress', payload: 100 })
      
      self.postMessage({
        type: 'result',
        payload: {
          output: parsed.output,
          stats: parsed.stats,
          matches: parsed.matches,
          replacements: parsed.replacements || []
        }
      })
    } catch (error) {
      self.postMessage({
        type: 'error',
        payload: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
}
