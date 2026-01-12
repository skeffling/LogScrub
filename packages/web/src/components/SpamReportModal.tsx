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
  reports?: SpamReport[]
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
  const reports = detectSpamReports(text)
  return reports.length > 0 ? reports[0] : null
}

export function detectSpamReports(text: string): SpamReport[] {
  const reports: SpamReport[] = []

  // Check for SpamAssassin format (has pts/rule table or "scored" text)
  // Look specifically in X-Spam-Report header (not X-Spam-Report-Secondary)
  const spamAssassinMatch = text.match(/X-Spam-Report:[\s\S]*?(?=X-Spam-Report-Secondary:|X-[A-Z][a-zA-Z-]+:|$)/i)
  if (spamAssassinMatch) {
    const saReport = parseSpamAssassinReport(spamAssassinMatch[0])
    if (saReport) reports.push(saReport)
  } else if (/scored?\s*\(-?[\d.]+\s*points?\)/i.test(text) || /^\s*-?[\d.]+\s+[A-Z][A-Z0-9_]+\s+/m.test(text)) {
    // Fallback: try parsing the whole text as SpamAssassin
    const saReport = parseSpamAssassinReport(text)
    if (saReport) reports.push(saReport)
  }

  // Check for rspamd format (has Symbol: pattern)
  // Look specifically in X-Spam-Report-Secondary or X-Spam-Report headers
  const rspamdMatch = text.match(/X-Spam-Report(?:-Secondary)?:[\s\S]*?Symbol:[\s\S]*?(?=X-[A-Z][a-zA-Z-]+:|$)/i)
  if (rspamdMatch && /Symbol:\s*[A-Z0-9_]+\(-?[\d.]+\)/i.test(rspamdMatch[0])) {
    const rspamdReport = parseRspamdReport(rspamdMatch[0])
    if (rspamdReport) {
      // Avoid duplicate if we already found it
      if (!reports.some(r => r.type === 'rspamd')) {
        reports.push(rspamdReport)
      }
    }
  } else if (/Symbol:\s*[A-Z0-9_]+\(-?[\d.]+\)/i.test(text)) {
    // Fallback: try parsing the whole text as rspamd
    const rspamdReport = parseRspamdReport(text)
    if (rspamdReport && !reports.some(r => r.type === 'rspamd')) {
      reports.push(rspamdReport)
    }
  }

  return reports
}

export function SpamReportModal({ isOpen, onClose, report, reports: reportsProp }: SpamReportModalProps) {
  const [sortField, setSortField] = useState<SortField>('score')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [activeReportIndex, setActiveReportIndex] = useState(0)

  // Use reports array if provided, otherwise wrap single report
  const allReports = reportsProp && reportsProp.length > 0 ? reportsProp : (report ? [report] : [])
  const activeReport = allReports[activeReportIndex] || null

  const sortedRules = useMemo(() => {
    if (!activeReport) return []

    return [...activeReport.rules].sort((a, b) => {
      let comparison = 0
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name)
      } else {
        comparison = a.score - b.score
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [activeReport, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection(field === 'score' ? 'desc' : 'asc')
    }
  }

  if (!isOpen || !activeReport) return null

  const positiveRules = activeReport.rules.filter(r => r.score > 0)
  const negativeRules = activeReport.rules.filter(r => r.score < 0)
  const neutralRules = activeReport.rules.filter(r => r.score === 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
              </svg>
              Spam Filter Reports
            </h2>
            {activeReport.hostname && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Scanned by: {activeReport.hostname}
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

        {/* Report Tabs (if multiple reports) */}
        {allReports.length > 1 && (
          <div className="flex border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
            {allReports.map((r, idx) => (
              <button
                key={idx}
                onClick={() => setActiveReportIndex(idx)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  idx === activeReportIndex
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-white dark:bg-gray-800'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {r.type === 'rspamd' ? 'Rspamd' : 'SpamAssassin'}
                <span className={`ml-2 px-1.5 py-0.5 text-xs rounded ${
                  (r.totalScore ?? 0) > 5 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                  (r.totalScore ?? 0) > 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                }`}>
                  {r.totalScore?.toFixed(1) ?? 'N/A'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Summary */}
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700 flex-shrink-0">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {activeReport.type === 'rspamd' ? 'Rspamd' : 'SpamAssassin'}:
              </span>
            </div>
            {activeReport.totalScore !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total Score:</span>
                <span className={`text-xl font-bold ${
                  activeReport.totalScore > 5 ? 'text-red-600 dark:text-red-400' :
                  activeReport.totalScore > 0 ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-green-600 dark:text-green-400'
                }`}>
                  {activeReport.totalScore.toFixed(2)}
                </span>
              </div>
            )}
            {activeReport.action && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Action:</span>
                <span className={`px-2 py-0.5 rounded text-sm font-medium ${
                  activeReport.action.toLowerCase().includes('reject') ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                  activeReport.action.toLowerCase().includes('add header') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                }`}>
                  {activeReport.action}
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
                {activeReport.type === 'spamassassin' && (
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
                  {activeReport.type === 'spamassassin' && (
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
