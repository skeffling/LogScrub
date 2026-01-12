import { useState, useMemo } from 'react'

interface SpamRule {
  name: string
  score: number
  description: string
}

interface SpamReport {
  type: 'rspamd' | 'spamassassin'
  action?: string
  totalScore?: number
  hostname?: string
  messageId?: string
  rules: SpamRule[]
}

interface SpamReportModalProps {
  isOpen: boolean
  onClose: () => void
  report: SpamReport | null
}

type SortField = 'name' | 'score'
type SortDirection = 'asc' | 'desc'

export function parseRspamdReport(text: string): SpamReport | null {
  // Normalize multi-line headers (lines starting with space are continuations)
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\n\s+/g, ' ')

  // Look for rspamd format: Action: ... Symbol: NAME(score) Symbol: NAME(score) ...
  const actionMatch = normalizedText.match(/Action:\s*([^S]+?)(?=Symbol:|Message-ID:|$)/i)
  const action = actionMatch ? actionMatch[1].trim() : undefined

  const symbolRegex = /Symbol:\s*([A-Z0-9_]+)\((-?[\d.]+)\)/gi
  const rules: SpamRule[] = []
  let match

  while ((match = symbolRegex.exec(normalizedText)) !== null) {
    rules.push({
      name: match[1],
      score: parseFloat(match[2]),
      description: '' // rspamd doesn't include descriptions in header
    })
  }

  if (rules.length === 0) return null

  const messageIdMatch = normalizedText.match(/Message-ID:\s*(.+?)(?:\s*$)/i)
  const messageId = messageIdMatch ? messageIdMatch[1].trim() : undefined

  const totalScore = rules.reduce((sum, r) => sum + r.score, 0)

  return {
    type: 'rspamd',
    action,
    totalScore,
    messageId,
    rules
  }
}

export function parseSpamAssassinReport(text: string): SpamReport | null {
  // Look for SpamAssassin format with pts/rule/description table
  const headerMatch = text.match(/scored?\s*\((-?[\d.]+)\s*points?\)/i)
  const totalScore = headerMatch ? parseFloat(headerMatch[1]) : undefined

  const hostnameMatch = text.match(/running on the system\s*"([^"]+)"/i)
  const hostname = hostnameMatch ? hostnameMatch[1] : undefined

  // Parse the table rows: pts  rule_name  description
  // Format: whitespace + optional minus + number + whitespace + rule_name + whitespace + description
  const rules: SpamRule[] = []

  // Normalize the text: unfold headers where lines starting with space are continuations
  // But preserve actual rule lines
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  // Process lines, joining continuation lines (those starting with whitespace that don't have a score)
  const processedLines: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Check if this is a new rule line (starts with whitespace + score + rule name)
    if (/^\s*-?[\d.]+\s+[A-Z][A-Z0-9_]+/.test(line)) {
      processedLines.push(line)
    } else if (processedLines.length > 0 && /^\s+\S/.test(line) && !/^\s*-?[\d.]+\s+[A-Z]/.test(line)) {
      // This is a continuation line - append to the previous line
      processedLines[processedLines.length - 1] += ' ' + line.trim()
    }
  }

  for (const line of processedLines) {
    // Match lines like: -0.0 SPF_PASS  SPF: sender matches SPF record
    // or: 1.5 DATE_IN_PAST_06_12  Date: is 6 to 12 hours before Received: date
    const ruleMatch = line.match(/^\s*(-?[\d.]+)\s+([A-Z0-9_]+)\s+(.*)$/i)
    if (ruleMatch) {
      rules.push({
        name: ruleMatch[2],
        score: parseFloat(ruleMatch[1]),
        description: ruleMatch[3].trim()
      })
    }
  }

  // Also try single-line format (all on one line with no newlines)
  if (rules.length === 0) {
    // Try to find patterns like "0.0 RULE_NAME description text" separated by multiple spaces
    const singleLineRegex = /(-?[\d.]+)\s+([A-Z][A-Z0-9_]+)\s{2,}([^-\d][^]*?)(?=\s+-?[\d.]+\s+[A-Z]|$)/gi
    let match
    while ((match = singleLineRegex.exec(text)) !== null) {
      rules.push({
        name: match[2],
        score: parseFloat(match[1]),
        description: match[3].trim()
      })
    }
  }

  if (rules.length === 0) return null

  return {
    type: 'spamassassin',
    totalScore,
    hostname,
    rules
  }
}

export function detectSpamReport(text: string): SpamReport | null {
  // Check for rspamd format first (has Symbol: pattern)
  if (/Symbol:\s*[A-Z0-9_]+\(-?[\d.]+\)/i.test(text)) {
    return parseRspamdReport(text)
  }

  // Check for SpamAssassin format (has pts/rule table or "scored" text)
  if (/scored?\s*\(-?[\d.]+\s*points?\)/i.test(text) || /^\s*-?[\d.]+\s+[A-Z][A-Z0-9_]+\s+/m.test(text)) {
    return parseSpamAssassinReport(text)
  }

  return null
}

export function SpamReportModal({ isOpen, onClose, report }: SpamReportModalProps) {
  const [sortField, setSortField] = useState<SortField>('score')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sortedRules = useMemo(() => {
    if (!report) return []

    return [...report.rules].sort((a, b) => {
      let comparison = 0
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name)
      } else {
        comparison = a.score - b.score
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [report, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection(field === 'score' ? 'desc' : 'asc')
    }
  }

  if (!isOpen || !report) return null

  const positiveRules = report.rules.filter(r => r.score > 0)
  const negativeRules = report.rules.filter(r => r.score < 0)
  const neutralRules = report.rules.filter(r => r.score === 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {report.type === 'rspamd' ? (
                <>
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Rspamd Report
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  SpamAssassin Report
                </>
              )}
            </h2>
            {report.hostname && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Scanned by: {report.hostname}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Summary */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700 flex-shrink-0">
          <div className="flex flex-wrap gap-4 items-center">
            {report.totalScore !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Score:</span>
                <span className={`text-xl font-bold ${
                  report.totalScore > 5 ? 'text-red-600 dark:text-red-400' :
                  report.totalScore > 0 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-green-600 dark:text-green-400'
                }`}>
                  {report.totalScore.toFixed(2)}
                </span>
              </div>
            )}
            {report.action && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Action:</span>
                <span className={`px-2 py-0.5 rounded text-sm font-medium ${
                  report.action.toLowerCase().includes('reject') ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                  report.action.toLowerCase().includes('add header') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                }`}>
                  {report.action}
                </span>
              </div>
            )}
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-600 dark:text-green-400">{negativeRules.length} ham</span>
              <span className="text-gray-500 dark:text-gray-400">{neutralRules.length} neutral</span>
              <span className="text-red-600 dark:text-red-400">{positiveRules.length} spam</span>
            </div>
          </div>
        </div>

        {/* Rules Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
              <tr>
                <th
                  className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 select-none"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Rule Name
                    {sortField === 'name' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th
                  className="px-4 py-2 text-right text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 select-none w-24"
                  onClick={() => handleSort('score')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Score
                    {sortField === 'score' && (
                      <svg className={`w-4 h-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                {report.type === 'spamassassin' && (
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    Description
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sortedRules.map((rule, i) => (
                <tr
                  key={i}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    rule.score > 0 ? 'bg-red-50/50 dark:bg-red-900/10' :
                    rule.score < 0 ? 'bg-green-50/50 dark:bg-green-900/10' : ''
                  }`}
                >
                  <td className="px-4 py-2">
                    <code className="text-sm font-mono text-gray-900 dark:text-gray-100">
                      {rule.name}
                    </code>
                  </td>
                  <td className={`px-4 py-2 text-right font-mono text-sm font-medium ${
                    rule.score > 0 ? 'text-red-600 dark:text-red-400' :
                    rule.score < 0 ? 'text-green-600 dark:text-green-400' :
                    'text-gray-500 dark:text-gray-400'
                  }`}>
                    {rule.score > 0 ? '+' : ''}{rule.score.toFixed(2)}
                  </td>
                  {report.type === 'spamassassin' && (
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                      {rule.description || <span className="text-gray-400 dark:text-gray-600 italic">No description</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t dark:border-gray-700 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
