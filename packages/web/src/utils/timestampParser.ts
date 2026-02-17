export const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
}
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function parseMonth(str: string): number {
  return MONTHS[str.toLowerCase().slice(0, 3)] ?? 0
}

export interface TimestampPattern {
  regex: RegExp
  parser: (m: RegExpExecArray) => Date | null
  format: string
}

export function getTimestampPatterns(): TimestampPattern[] {
  return [
    {
      regex: /(\d{4})-(\d{2})-(\d{2})([T\s])(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|([+-])(\d{2}):?(\d{2}))?/g,
      parser: (m) => new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), parseInt(m[5]), parseInt(m[6]), parseInt(m[7])),
      format: 'iso'
    },
    {
      regex: /\[([A-Za-z]{3})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})\]/g,
      parser: (m) => new Date(parseInt(m[7]), parseMonth(m[2]), parseInt(m[3]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6])),
      format: 'apache-error'
    },
    {
      regex: /\[(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?\]/g,
      parser: (m) => new Date(parseInt(m[3]), parseMonth(m[2]), parseInt(m[1]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6])),
      format: 'apache-access'
    },
    {
      regex: /(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?/g,
      parser: (m) => new Date(parseInt(m[3]), parseMonth(m[2]), parseInt(m[1]), parseInt(m[4]), parseInt(m[5]), parseInt(m[6])),
      format: 'clf-datetime'
    },
    {
      regex: /([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/g,
      parser: (m) => new Date(new Date().getFullYear(), parseMonth(m[1]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4]), parseInt(m[5])),
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
}

export function isAtLineStart(text: string, position: number): boolean {
  if (position === 0) return true
  const charBefore = text[position - 1]
  return charBefore === '\n' || charBefore === '\r'
}

export const pad = (n: number, len = 2) => String(n).padStart(len, '0')

export function formatTimestamp(date: Date, format: string): string {
  switch (format) {
    case 'iso':
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
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

export interface TimestampMatch {
  original: string
  date: Date
  position: number
  format: string
  isLineStart: boolean
}

export function findTimestamps(text: string): TimestampMatch[] {
  const patterns = getTimestampPatterns()
  const matches: TimestampMatch[] = []
  const seenPositions = new Set<number>()

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0
    let match
    while ((match = pattern.regex.exec(text)) !== null) {
      if (seenPositions.has(match.index)) continue
      const date = pattern.parser(match)
      if (date && !isNaN(date.getTime())) {
        seenPositions.add(match.index)
        matches.push({
          original: match[0],
          date,
          position: match.index,
          format: pattern.format,
          isLineStart: isAtLineStart(text, match.index)
        })
      }
    }
  }

  return matches.sort((a, b) => a.position - b.position)
}

export function findLineTimestamp(line: string): Date | null {
  const patterns = getTimestampPatterns()
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0
    const match = pattern.regex.exec(line)
    if (match) {
      const date = pattern.parser(match)
      if (date && !isNaN(date.getTime())) return date
    }
  }
  return null
}

export function hasTimestamps(text: string): boolean {
  if (!text || text.length < 10) return false
  const patterns = getTimestampPatterns()
  const sample = text.slice(0, 5000)
  return patterns.some(p => {
    p.regex.lastIndex = 0
    return p.regex.test(sample)
  })
}
