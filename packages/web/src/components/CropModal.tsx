import { useState, useMemo } from 'react'
import { Modal } from './Modal'
import { findLineTimestamp } from '../utils/timestampParser'

interface CropModalProps {
  onClose: () => void
  input: string
  onCrop: (croppedText: string) => void
}

const DURATION_PRESETS = [
  { label: '1m', minutes: 1 },
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '4h', minutes: 240 },
  { label: '8h', minutes: 480 },
  { label: '12h', minutes: 720 },
  { label: '24h', minutes: 1440 },
]

function dateToDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function CropModal({ onClose, input, onCrop }: CropModalProps) {
  const [mode, setMode] = useState<'range' | 'duration'>('range')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [durationStart, setDurationStart] = useState('')
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null)

  const lines = useMemo(() => input.split('\n'), [input])

  // Parse timestamps for every line
  const lineTimestamps = useMemo(() => {
    return lines.map(line => findLineTimestamp(line))
  }, [lines])

  // Compute effective timestamps (lines without timestamps inherit previous)
  const effectiveTimestamps = useMemo(() => {
    const effective: (Date | null)[] = []
    let lastTs: Date | null = null
    for (const ts of lineTimestamps) {
      if (ts) lastTs = ts
      effective.push(lastTs)
    }
    return effective
  }, [lineTimestamps])

  // Find overall log time range
  const logRange = useMemo(() => {
    let first: Date | null = null
    let last: Date | null = null
    for (const ts of lineTimestamps) {
      if (!ts) continue
      if (!first || ts < first) first = ts
      if (!last || ts > last) last = ts
    }
    return { first, last }
  }, [lineTimestamps])

  // Initialize range inputs on first render
  useMemo(() => {
    if (logRange.first && logRange.last) {
      const startStr = dateToDatetimeLocal(logRange.first)
      const endStr = dateToDatetimeLocal(logRange.last)
      if (!rangeStart) setRangeStart(startStr)
      if (!rangeEnd) setRangeEnd(endStr)
      if (!durationStart) setDurationStart(startStr)
    }
  }, [logRange.first, logRange.last]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute the crop range based on current mode
  const cropRange = useMemo(() => {
    if (mode === 'range') {
      const start = rangeStart ? new Date(rangeStart) : null
      const end = rangeEnd ? new Date(rangeEnd) : null
      if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return { start, end }
      }
      return null
    } else {
      const start = durationStart ? new Date(durationStart) : null
      if (start && selectedDuration !== null && !isNaN(start.getTime())) {
        const end = new Date(start.getTime() + selectedDuration * 60 * 1000)
        return { start, end }
      }
      return null
    }
  }, [mode, rangeStart, rangeEnd, durationStart, selectedDuration])

  // Preview: count lines kept/removed
  const preview = useMemo(() => {
    if (!cropRange) return null

    const firstTimestampIdx = effectiveTimestamps.findIndex(ts => ts !== null)
    let kept = 0
    for (let i = 0; i < lines.length; i++) {
      const ts = effectiveTimestamps[i]
      if (ts === null) {
        // Leading lines before any timestamp — include if first timestamped line is in range
        if (i < firstTimestampIdx || firstTimestampIdx === -1) {
          const firstTs = effectiveTimestamps[firstTimestampIdx]
          if (firstTs && firstTs >= cropRange.start && firstTs <= cropRange.end) {
            kept++
          }
        }
        continue
      }
      if (ts >= cropRange.start && ts <= cropRange.end) kept++
    }

    return { kept, removed: lines.length - kept }
  }, [cropRange, effectiveTimestamps, lines])

  const handleCrop = () => {
    if (!cropRange) return

    const firstTimestampIdx = effectiveTimestamps.findIndex(ts => ts !== null)
    const kept: boolean[] = effectiveTimestamps.map(ts => {
      if (ts === null) return false
      return ts >= cropRange.start && ts <= cropRange.end
    })

    // Include leading lines if first timestamped line is kept
    if (firstTimestampIdx > 0 && kept[firstTimestampIdx]) {
      for (let i = 0; i < firstTimestampIdx; i++) {
        kept[i] = true
      }
    }

    const croppedLines = lines.filter((_, i) => kept[i])
    if (croppedLines.length > 0) {
      onCrop(croppedLines.join('\n'))
    }
  }

  if (!logRange.first || !logRange.last) {
    return (
      <Modal onClose={onClose} title="Crop Log" maxWidth="max-w-lg">
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            No parseable timestamps found in the log. Crop requires log lines with recognisable timestamps.
          </p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  const totalDuration = logRange.last.getTime() - logRange.first.getTime()
  const timestampedLineCount = lineTimestamps.filter(ts => ts !== null).length
  const canCrop = cropRange && preview && preview.kept > 0 && preview.kept < lines.length

  return (
    <Modal onClose={onClose} title="Crop Log" maxWidth="max-w-lg">
      <div className="space-y-5">
        {/* Log info */}
        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Start</span>
            <span className="font-mono text-gray-800 dark:text-gray-200">{logRange.first.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">End</span>
            <span className="font-mono text-gray-800 dark:text-gray-200">{logRange.last.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Duration</span>
            <span className="font-mono text-gray-800 dark:text-gray-200">{formatDuration(totalDuration)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Lines</span>
            <span className="font-mono text-gray-800 dark:text-gray-200">
              {lines.length.toLocaleString()} total ({timestampedLineCount.toLocaleString()} with timestamps)
            </span>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('range')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
              mode === 'range'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Custom Range
          </button>
          <button
            onClick={() => setMode('duration')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
              mode === 'duration'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Start + Duration
          </button>
        </div>

        {/* Inputs */}
        {mode === 'range' ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Keep from</label>
              <input
                type="datetime-local"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                step="1"
                className="w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Keep until</label>
              <input
                type="datetime-local"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                step="1"
                className="w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Start from</label>
              <input
                type="datetime-local"
                value={durationStart}
                onChange={(e) => {
                  setDurationStart(e.target.value)
                  setSelectedDuration(null)
                }}
                step="1"
                className="w-full px-3 py-2 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Duration</label>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.minutes}
                    onClick={() => setSelectedDuration(preset.minutes)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      selectedDuration === preset.minutes
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className={`p-3 rounded-lg text-sm ${
            preview.kept === 0
              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
          }`}>
            {preview.kept === 0 ? (
              'No lines match the selected time range'
            ) : preview.kept === lines.length ? (
              'All lines are within the selected range (nothing to crop)'
            ) : (
              <>
                Keeping <strong>{preview.kept.toLocaleString()}</strong> of {lines.length.toLocaleString()} lines
                <span className="text-gray-500 dark:text-gray-400"> (removing {preview.removed.toLocaleString()})</span>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCrop}
            disabled={!canCrop}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            Crop
          </button>
        </div>
      </div>
    </Modal>
  )
}
