import { useState, useMemo } from 'react'
import { useAppStore } from '../stores/useAppStore'

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parseMonth(str: string): number {
  return MONTHS[str.toLowerCase().slice(0, 3)] ?? 0
}

interface TimestampPattern {
  regex: RegExp
  parser: (m: RegExpExecArray) => Date | null
  format: string
}

const TIMESTAMP_PATTERNS: TimestampPattern[] = [
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

function isAtLineStart(text: string, position: number): boolean {
  if (position === 0) return true
  const charBefore = text[position - 1]
  return charBefore === '\n' || charBefore === '\r'
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0')

function formatTimestamp(date: Date, format: string): string {
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

interface TimestampMatch {
  original: string
  date: Date
  position: number
  format: string
  isLineStart: boolean
}

function findTimestamps(text: string): TimestampMatch[] {
  const matches: TimestampMatch[] = []
  const seenPositions = new Set<number>()

  for (const pattern of TIMESTAMP_PATTERNS) {
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

function hasTimestamps(text: string): boolean {
  if (!text || text.length < 10) return false
  const sample = text.slice(0, 5000)
  return TIMESTAMP_PATTERNS.some(p => {
    p.regex.lastIndex = 0
    return p.regex.test(sample)
  })
}

export function TimeShift() {
  const { timeShift, setTimeShift, input } = useAppStore()
  const [expanded, setExpanded] = useState(false)

  const showComponent = useMemo(() => hasTimestamps(input), [input])

  // Find all timestamps and compute counts
  const timestampAnalysis = useMemo(() => {
    if (!input) return { all: [], lineStart: [], allCount: 0, lineStartCount: 0 }
    const all = findTimestamps(input)
    const lineStart = all.filter(m => m.isLineStart)
    return {
      all,
      lineStart,
      allCount: all.length,
      lineStartCount: lineStart.length
    }
  }, [input])

  // Compute preview of first 3 matches with before/after
  const preview = useMemo(() => {
    const matches = timeShift.lineOnly ? timestampAnalysis.lineStart : timestampAnalysis.all
    if (matches.length === 0) return []

    // Calculate offset
    let offsetMs = 0
    if (timeShift.mode === 'offset') {
      offsetMs = (timeShift.offsetHours * 60 + timeShift.offsetMinutes) * 60 * 1000
    } else if (timeShift.mode === 'start' && timeShift.startDate) {
      const firstMatch = matches[0]
      const targetDate = new Date(`${timeShift.startDate}T${timeShift.startTime || '00:00:00'}`)
      if (!isNaN(targetDate.getTime())) {
        offsetMs = targetDate.getTime() - firstMatch.date.getTime()
      }
    }

    return matches.slice(0, 3).map(match => {
      const shiftedDate = new Date(match.date.getTime() + offsetMs)
      return {
        original: match.original,
        shifted: formatTimestamp(shiftedDate, match.format),
        format: match.format
      }
    })
  }, [timestampAnalysis, timeShift])

  if (!showComponent) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          Time Shift
          {timeShift.enabled && (
            <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
              On
            </span>
          )}
        </button>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={timeShift.enabled}
            onChange={(e) => setTimeShift({ enabled: e.target.checked })}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400">Enable</span>
        </label>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Shift timestamps in your logs to anonymize temporal data while preserving relative timing.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setTimeShift({ mode: 'offset' })}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                  timeShift.mode === 'offset'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Offset
              </button>
              <button
                onClick={() => setTimeShift({ mode: 'start' })}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                  timeShift.mode === 'start'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Start From
              </button>
            </div>
          </div>

          {timeShift.mode === 'offset' ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Shift by (hours:minutes)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={timeShift.offsetHours}
                  onChange={(e) => setTimeShift({ offsetHours: parseInt(e.target.value) || 0 })}
                  className="w-20 px-2 py-1.5 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                  placeholder="Hours"
                />
                <span className="text-gray-500">:</span>
                <input
                  type="number"
                  value={timeShift.offsetMinutes}
                  onChange={(e) => setTimeShift({ offsetMinutes: parseInt(e.target.value) || 0 })}
                  min="-59"
                  max="59"
                  className="w-20 px-2 py-1.5 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                  placeholder="Min"
                />
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Use negative values to shift backwards. Relative timing between events is preserved.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Start Date
                </label>
                <input
                  type="date"
                  value={timeShift.startDate}
                  onChange={(e) => setTimeShift({ startDate: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Start Time
                </label>
                <input
                  type="time"
                  value={timeShift.startTime}
                  onChange={(e) => setTimeShift({ startTime: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                The first timestamp will become this date/time. All other timestamps shift accordingly.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Scope</label>
            <div className="flex gap-2">
              <button
                onClick={() => setTimeShift({ lineOnly: true })}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                  timeShift.lineOnly
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                title="Only shift timestamps at the start of lines (log timestamps). Dates within log messages are left for sanitization rules."
              >
                Line Start
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${
                  timeShift.lineOnly
                    ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                }`}>
                  {timestampAnalysis.lineStartCount}
                </span>
              </button>
              <button
                onClick={() => setTimeShift({ lineOnly: false })}
                className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-colors ${
                  !timeShift.lineOnly
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                title="Shift ALL timestamps found anywhere in the text, including dates within log messages."
              >
                All Timestamps
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs ${
                  !timeShift.lineOnly
                    ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                }`}>
                  {timestampAnalysis.allCount}
                </span>
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {timeShift.lineOnly
                ? 'Only timestamps at line start are shifted. Use date/time rules to scrub dates in content.'
                : 'All timestamps are shifted, including dates within log messages.'}
            </p>
          </div>

          {timeShift.enabled && (
            <div className="space-y-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300">
                {timeShift.mode === 'offset' ? (
                  <>
                    Timestamps will be shifted by{' '}
                    <strong>
                      {timeShift.offsetHours >= 0 ? '+' : ''}{timeShift.offsetHours}h {timeShift.offsetMinutes >= 0 ? '+' : ''}{timeShift.offsetMinutes}m
                    </strong>
                  </>
                ) : (
                  <>
                    First timestamp will become{' '}
                    <strong>{timeShift.startDate || 'not set'} {timeShift.startTime || ''}</strong>
                  </>
                )}
              </div>

              {/* Preview section */}
              {preview.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Preview (first {preview.length} of {timeShift.lineOnly ? timestampAnalysis.lineStartCount : timestampAnalysis.allCount})
                  </label>
                  <div className="space-y-1.5">
                    {preview.map((item, idx) => (
                      <div key={idx} className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-red-600 dark:text-red-400 line-through">{item.original}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-green-600 dark:text-green-400">{item.shifted}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-xs text-gray-600 dark:text-gray-400">
                Date/time detection rules are automatically skipped when Time Shift is enabled.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
