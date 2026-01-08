import { useState, useMemo } from 'react'
import { useAppStore } from '../stores/useAppStore'

const TIMESTAMP_CHECK_PATTERNS = [
  /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/,
  /\d{4}-\d{2}-\d{2}/,
  /\[[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4}\]/,
  /\[\d{1,2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}/,
  /\d{1,2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}/,
  /[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/,
  /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/,
  /\d{2}\/\d{2}\/\d{4}/,
]

function hasTimestamps(text: string): boolean {
  if (!text || text.length < 10) return false
  const sample = text.slice(0, 5000)
  return TIMESTAMP_CHECK_PATTERNS.some(pattern => pattern.test(sample))
}

export function TimeShift() {
  const { timeShift, setTimeShift, input } = useAppStore()
  const [expanded, setExpanded] = useState(false)

  const showComponent = useMemo(() => hasTimestamps(input), [input])

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
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">Enable</span>
        </label>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
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
                  className="w-20 px-2 py-1.5 text-sm border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  placeholder="Hours"
                />
                <span className="text-gray-500">:</span>
                <input
                  type="number"
                  value={timeShift.offsetMinutes}
                  onChange={(e) => setTimeShift({ offsetMinutes: parseInt(e.target.value) || 0 })}
                  min="-59"
                  max="59"
                  className="w-20 px-2 py-1.5 text-sm border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  placeholder="Min"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
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
                  className="w-full px-2 py-1.5 text-sm border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
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
                  className="w-full px-2 py-1.5 text-sm border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
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
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {timeShift.lineOnly 
                ? 'Only timestamps at line start are shifted. Use date/time rules to sanitize dates in content.'
                : 'All timestamps are shifted, including dates within log messages.'}
            </p>
          </div>

          {timeShift.enabled && (
            <div className="space-y-2">
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
