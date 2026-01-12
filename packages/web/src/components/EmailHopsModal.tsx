import { useMemo } from 'react'
import { Modal } from './Modal'

interface EmailHop {
  from: string
  by: string
  timestamp: Date | null
  rawTimestamp: string
  delay: number | null // delay from previous hop in seconds
  timezone: string | null
  rawBlock: string // original Received header content
}

interface EmailHopsModalProps {
  rawHeaders: string
  onClose: () => void
}

function parseReceivedHeaders(headers: string): EmailHop[] {
  const hops: EmailHop[] = []

  // Split headers into individual header blocks
  // A header starts at beginning of line with Name: and continues on indented lines
  const lines = headers.split(/\r?\n/)
  const headerBlocks: { name: string; content: string }[] = []
  let currentHeader: { name: string; content: string } | null = null

  for (const line of lines) {
    // Check if this is a new header (starts with HeaderName:)
    const headerMatch = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/)
    if (headerMatch) {
      if (currentHeader) {
        headerBlocks.push(currentHeader)
      }
      currentHeader = { name: headerMatch[1], content: headerMatch[2] }
    } else if (currentHeader && /^\s+/.test(line)) {
      // Continuation line (starts with whitespace)
      currentHeader.content += ' ' + line.trim()
    }
  }
  if (currentHeader) {
    headerBlocks.push(currentHeader)
  }

  // Process only Received headers
  const receivedHeaders = headerBlocks.filter(h => h.name.toLowerCase() === 'received')

  for (const header of receivedHeaders) {
    const receivedBlock = header.content

    // Extract "from" server
    const fromMatch = receivedBlock.match(/from\s+([^\s(]+)/i)
    const from = fromMatch ? fromMatch[1] : 'unknown'

    // Extract "by" server
    const byMatch = receivedBlock.match(/by\s+([^\s(]+)/i)
    const by = byMatch ? byMatch[1] : 'unknown'

    // Extract timestamp - RFC 2822 format, can appear anywhere in the block
    // Examples: "Mon, 12 Jan 2026 16:27:44 +0000", "Mon, 12 Jan 2026 15:32:01 +0000 (GMT)"
    // Also handles sanitized versions where placeholders might be present
    const timestampPatterns = [
      // Standard RFC 2822: Mon, 12 Jan 2026 14:08:30 +0000
      /([A-Z][a-z]{2},\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+([+-]\d{4})(?:\s+\([A-Z]+\))?)/i,
      // Without day name: 12 Jan 2026 14:08:30 +0000
      /(\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+([+-]\d{4})(?:\s+\([A-Z]+\))?)/i,
    ]

    let timestamp: Date | null = null
    let rawTimestamp = ''
    let timezone: string | null = null

    for (const pattern of timestampPatterns) {
      const timestampMatch = receivedBlock.match(pattern)
      if (timestampMatch) {
        rawTimestamp = timestampMatch[1].trim()
        timezone = timestampMatch[2] || null
        // Remove timezone name in parentheses for parsing
        const cleanTimestamp = rawTimestamp.replace(/\s+\([A-Z]+\)$/, '')
        const parsed = new Date(cleanTimestamp)
        if (!isNaN(parsed.getTime())) {
          timestamp = parsed
          break
        }
      }
    }

    hops.push({ from, by, timestamp, rawTimestamp, delay: null, timezone, rawBlock: receivedBlock })
  }

  // Received headers are in reverse order (most recent first)
  // So we reverse to get chronological order
  hops.reverse()

  // Build the actual flow: origin server → receiving servers
  // Each Received header shows: from=sender, by=receiver
  // So the flow is: first.from → first.by → second.by → ...
  const flow: EmailHop[] = []

  if (hops.length > 0) {
    // Add the origin server (the "from" of the first hop)
    const firstHop = hops[0]
    if (firstHop.from !== 'unknown') {
      flow.push({
        from: 'origin',
        by: firstHop.from,
        timestamp: null, // We don't have the send time
        rawTimestamp: '',
        delay: null,
        timezone: null,
        rawBlock: `Origin server: ${firstHop.from}`
      })
    }

    // Add all the receiving servers
    for (const hop of hops) {
      flow.push(hop)
    }
  }

  // Calculate delays between hops
  for (let i = 1; i < flow.length; i++) {
    const prev = flow[i - 1]
    const curr = flow[i]
    if (prev.timestamp && curr.timestamp) {
      curr.delay = Math.round((curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000)
    }
  }

  return flow
}

function formatDuration(seconds: number): string {
  if (seconds < 0) {
    return `-${formatDuration(Math.abs(seconds))}`
  }
  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

function formatTime(date: Date, showTimezone?: string | null): string {
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  if (showTimezone) {
    return `${time} ${showTimezone}`
  }
  return time
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function getDelayColor(seconds: number | null): string {
  if (seconds === null) return 'text-gray-400'
  if (seconds < 0) return 'text-purple-600 dark:text-purple-400'
  if (seconds > 300) return 'text-red-600 dark:text-red-400' // >5 min
  if (seconds > 60) return 'text-orange-600 dark:text-orange-400' // >1 min
  if (seconds > 10) return 'text-yellow-600 dark:text-yellow-400' // >10s
  return 'text-green-600 dark:text-green-400'
}

function getDelayBgColor(seconds: number | null): string {
  if (seconds === null) return 'bg-gray-100 dark:bg-gray-700'
  if (seconds < 0) return 'bg-purple-100 dark:bg-purple-900/30'
  if (seconds > 300) return 'bg-red-100 dark:bg-red-900/30'
  if (seconds > 60) return 'bg-orange-100 dark:bg-orange-900/30'
  if (seconds > 10) return 'bg-yellow-100 dark:bg-yellow-900/30'
  return 'bg-green-100 dark:bg-green-900/30'
}

export function EmailHopsModal({ rawHeaders, onClose }: EmailHopsModalProps) {
  const hops = useMemo(() => parseReceivedHeaders(rawHeaders), [rawHeaders])

  const totalDelay = useMemo(() => {
    // Find first and last hops with timestamps
    const hopsWithTimestamps = hops.filter(h => h.timestamp !== null)
    if (hopsWithTimestamps.length < 2) return null
    const first = hopsWithTimestamps[0]
    const last = hopsWithTimestamps[hopsWithTimestamps.length - 1]
    return Math.round((last.timestamp!.getTime() - first.timestamp!.getTime()) / 1000)
  }, [hops])

  // Check if timezones differ
  const hasTimezoneVariation = useMemo(() => {
    const timezones = hops.map(h => h.timezone).filter(Boolean)
    const unique = new Set(timezones)
    return unique.size > 1
  }, [hops])

  return (
    <Modal onClose={onClose} title="Email Routing Analysis" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-gray-700 dark:text-gray-300">
            <span className="font-medium">{hops.length}</span> server{hops.length !== 1 ? 's' : ''}
          </div>
          {totalDelay !== null && (
            <>
              <span className="text-gray-400 dark:text-gray-500">|</span>
              <div className="text-gray-700 dark:text-gray-300">
                Total time: <span className={`font-medium ${getDelayColor(totalDelay)}`}>{formatDuration(totalDelay)}</span>
              </div>
            </>
          )}
        </div>

        {hasTimezoneVariation && (
          <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Timestamps use different timezones - delays calculated from UTC values
          </div>
        )}

        {/* Flow diagram */}
        {hops.length > 0 ? (
          <div className="space-y-0 max-h-[60vh] overflow-y-auto pr-2">
            {hops.map((hop, i) => (
              <div key={i}>
                {/* Arrow with delay (between hops) */}
                {i > 0 && (
                  <div className="flex items-center py-2">
                    <div className="w-8 flex justify-center">
                      <div className="w-0.5 h-6 bg-gray-300 dark:bg-gray-600" />
                    </div>
                    {hop.delay !== null && (
                      <div className={`ml-4 px-3 py-1 rounded-full text-sm font-medium ${getDelayBgColor(hop.delay)} ${getDelayColor(hop.delay)}`}>
                        {hop.delay >= 0 ? '+' : ''}{formatDuration(hop.delay)}
                      </div>
                    )}
                  </div>
                )}

                {/* Server box */}
                <div className="flex items-start">
                  {/* Step indicator */}
                  <div className="w-8 flex-shrink-0 flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      hop.from === 'origin'
                        ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                        : i === hops.length - 1
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {i + 1}
                    </div>
                  </div>

                  {/* Server details box */}
                  <div
                    className="ml-4 flex-1 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 cursor-help"
                    title={`Received: ${hop.rawBlock}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Server name */}
                        <div className="font-mono text-sm font-medium text-gray-900 dark:text-white truncate" title={hop.by}>
                          {hop.by}
                        </div>

                        {/* Label for origin server */}
                        {hop.from === 'origin' && (
                          <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                            Sending server
                          </div>
                        )}
                        {/* Label for final destination */}
                        {i === hops.length - 1 && hop.from !== 'origin' && (
                          <div className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                            Final destination
                          </div>
                        )}
                      </div>

                      {/* Timestamp */}
                      {hop.timestamp && (
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatTime(hop.timestamp, hasTimezoneVariation ? hop.timezone : null)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(hop.timestamp)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No Received headers found in the email headers.
          </p>
        )}

        {/* Legend */}
        {hops.length > 1 && (
          <div className="pt-2 border-t dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Delay indicators:</div>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-green-100 dark:bg-green-900/30" />
                <span className="text-green-600 dark:text-green-400">&lt;10s</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-yellow-100 dark:bg-yellow-900/30" />
                <span className="text-yellow-600 dark:text-yellow-400">10s-1m</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-orange-100 dark:bg-orange-900/30" />
                <span className="text-orange-600 dark:text-orange-400">1m-5m</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-red-100 dark:bg-red-900/30" />
                <span className="text-red-600 dark:text-red-400">&gt;5m</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-purple-100 dark:bg-purple-900/30" />
                <span className="text-purple-600 dark:text-purple-400">clock skew</span>
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
