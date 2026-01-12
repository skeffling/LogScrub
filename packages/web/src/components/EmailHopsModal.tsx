import { useMemo } from 'react'
import { Modal } from './Modal'

interface EmailHop {
  from: string
  by: string
  timestamp: Date | null
  rawTimestamp: string
  delay: number | null // delay from previous hop in seconds
}

interface EmailHopsModalProps {
  rawHeaders: string
  onClose: () => void
}

function parseReceivedHeaders(headers: string): EmailHop[] {
  const hops: EmailHop[] = []

  // Match Received: headers (they can span multiple lines with indentation)
  const receivedRegex = /^Received:\s*([\s\S]*?)(?=^[A-Z][a-zA-Z-]*:|$)/gm
  let match

  while ((match = receivedRegex.exec(headers)) !== null) {
    const receivedBlock = match[1].replace(/\n\s+/g, ' ').trim()

    // Extract "from" server
    const fromMatch = receivedBlock.match(/from\s+([^\s(]+)/i)
    const from = fromMatch ? fromMatch[1] : 'unknown'

    // Extract "by" server
    const byMatch = receivedBlock.match(/by\s+([^\s(]+)/i)
    const by = byMatch ? byMatch[1] : 'unknown'

    // Extract timestamp - RFC 2822 format at end of header
    // Examples: "Mon, 12 Jan 2026 16:27:44 +0000", "Mon, 12 Jan 2026 15:32:01 +0000 (GMT)"
    const timestampRegex = /;\s*([A-Z][a-z]{2},\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4}(?:\s+\([A-Z]+\))?)/i
    const timestampMatch = receivedBlock.match(timestampRegex)

    let timestamp: Date | null = null
    let rawTimestamp = ''

    if (timestampMatch) {
      rawTimestamp = timestampMatch[1].trim()
      // Remove timezone name in parentheses for parsing
      const cleanTimestamp = rawTimestamp.replace(/\s+\([A-Z]+\)$/, '')
      timestamp = new Date(cleanTimestamp)
      if (isNaN(timestamp.getTime())) {
        timestamp = null
      }
    }

    hops.push({ from, by, timestamp, rawTimestamp, delay: null })
  }

  // Received headers are in reverse order (most recent first)
  // So we reverse to get chronological order
  hops.reverse()

  // Calculate delays between hops
  for (let i = 1; i < hops.length; i++) {
    const prev = hops[i - 1]
    const curr = hops[i]
    if (prev.timestamp && curr.timestamp) {
      curr.delay = Math.round((curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000)
    }
  }

  return hops
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

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

export function EmailHopsModal({ rawHeaders, onClose }: EmailHopsModalProps) {
  const hops = useMemo(() => parseReceivedHeaders(rawHeaders), [rawHeaders])

  const totalDelay = useMemo(() => {
    if (hops.length < 2) return null
    const first = hops[0]
    const last = hops[hops.length - 1]
    if (first.timestamp && last.timestamp) {
      return Math.round((last.timestamp.getTime() - first.timestamp.getTime()) / 1000)
    }
    return null
  }, [hops])

  return (
    <Modal onClose={onClose} title="Email Routing Analysis" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-gray-700 dark:text-gray-300">
          This email passed through <strong>{hops.length}</strong> server{hops.length !== 1 ? 's' : ''}.
          {totalDelay !== null && (
            <> Total transit time: <strong>{formatDuration(totalDelay)}</strong></>
          )}
        </p>

        {hops.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {hops.map((hop, i) => (
              <div
                key={i}
                className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full flex items-center justify-center text-xs font-medium">
                        {i + 1}
                      </span>
                      <span className="font-mono text-sm text-gray-900 dark:text-white truncate" title={hop.by}>
                        {hop.by}
                      </span>
                    </div>
                    <div className="ml-8 text-xs text-gray-500 dark:text-gray-400">
                      {hop.from !== 'unknown' && (
                        <div>
                          <span className="text-gray-400 dark:text-gray-500">from:</span>{' '}
                          <span className="font-mono">{hop.from}</span>
                        </div>
                      )}
                      {hop.rawTimestamp && (
                        <div>
                          <span className="text-gray-400 dark:text-gray-500">time:</span>{' '}
                          {hop.timestamp ? formatTime(hop.timestamp) : hop.rawTimestamp}
                        </div>
                      )}
                    </div>
                  </div>
                  {hop.delay !== null && (
                    <div className={`flex-shrink-0 text-right ${
                      hop.delay > 60
                        ? 'text-orange-600 dark:text-orange-400'
                        : hop.delay > 10
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-green-600 dark:text-green-400'
                    }`}>
                      <div className="text-sm font-medium">+{formatDuration(hop.delay)}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">delay</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No Received headers found in the email headers.
          </p>
        )}

        {totalDelay !== null && hops.length > 1 && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-blue-800 dark:text-blue-200 text-sm">Total Transit Time</span>
              <span className="text-blue-900 dark:text-blue-100 font-medium">{formatDuration(totalDelay)}</span>
            </div>
            {hops[0].timestamp && hops[hops.length - 1].timestamp && (
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {hops[0].timestamp!.toLocaleString()} → {hops[hops.length - 1].timestamp!.toLocaleString()}
              </div>
            )}
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
