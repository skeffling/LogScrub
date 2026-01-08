import { useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { Modal } from './Modal'

const TYPE_LABELS: Record<string, string> = {
  email: 'Emails',
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  mac_address: 'MAC',
  hostname: 'Hostnames',
  url: 'URLs',
  phone_us: 'Phone (US)',
  phone_uk: 'Phone (UK)',
  phone_intl: 'Phone (Intl)',
  ssn: 'SSN',
  credit_card: 'Credit Cards',
  iban: 'IBAN',
  uuid: 'UUIDs',
  jwt: 'JWT',
  bearer_token: 'Bearer',
  aws_access_key: 'AWS Key',
  aws_secret_key: 'AWS Secret',
  stripe_key: 'Stripe',
  gcp_api_key: 'GCP Key',
  github_token: 'GitHub',
  slack_token: 'Slack',
  generic_secret: 'Secrets',
  private_key: 'Priv Key',
  basic_auth: 'Basic Auth',
  url_credentials: 'URL Creds',
  btc_address: 'BTC',
  eth_address: 'ETH',
  gps_coordinates: 'GPS',
  file_path_unix: 'Path (Unix)',
  file_path_windows: 'Path (Win)',
  postcode_uk: 'UK Post',
  postcode_us: 'US Zip',
  passport: 'Passport',
  drivers_license: 'DL',
  session_id: 'Session',
}

interface MatchesModalProps {
  type: string
  matches: string[]
  onClose: () => void
}

function MatchesModal({ type, matches, onClose }: MatchesModalProps) {
  const uniqueMatches = [...new Set(matches)]
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[60vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {TYPE_LABELS[type] || type} ({matches.length} found, {uniqueMatches.length} unique)
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {uniqueMatches.map((match, i) => (
              <div 
                key={i}
                className="font-mono text-sm p-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-800 dark:text-gray-200 break-all"
              >
                {match}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Stats() {
  const { stats, matches, fileName, analysisStats, analysisMatches } = useAppStore()
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [showAuditReport, setShowAuditReport] = useState(false)
  
  const displayStats = Object.keys(stats).length > 0 ? stats : analysisStats
  const displayMatches = Object.keys(matches).length > 0 ? matches : analysisMatches
  const isPreview = Object.keys(stats).length === 0 && Object.keys(analysisStats).length > 0
  
  const total = Object.values(displayStats).reduce((sum, count) => sum + count, 0)
  const entries = Object.entries(displayStats).filter(([, count]) => count > 0)

  const generateAuditReport = (format: 'json' | 'txt' | 'html') => {
    const timestamp = new Date().toISOString()
    const reportData = {
      timestamp,
      fileName: fileName || 'untitled',
      summary: {
        totalDetections: total,
        uniqueTypes: entries.length,
        byType: Object.fromEntries(entries.map(([type, count]) => [TYPE_LABELS[type] || type, count]))
      },
      detections: Object.fromEntries(
        entries.map(([type, count]) => [
          TYPE_LABELS[type] || type,
          {
            count,
            uniqueValues: [...new Set(displayMatches[type] || [])].slice(0, 100)
          }
        ])
      )
    }

    let content: string
    let mimeType: string
    let extension: string

    if (format === 'json') {
      content = JSON.stringify(reportData, null, 2)
      mimeType = 'application/json'
      extension = 'json'
    } else if (format === 'html') {
      content = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>PII Audit Report</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#f5f5f5}
.card{background:white;border-radius:8px;padding:16px;margin:16px 0;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
h1{color:#1a1a1a}h2{color:#333;border-bottom:1px solid #eee;padding-bottom:8px}
.stat{display:flex;justify-content:space-between;padding:4px 0}
.type{color:#2563eb}.count{font-weight:600}
.values{font-family:monospace;font-size:12px;background:#f0f0f0;padding:8px;border-radius:4px;word-break:break-all}
.meta{color:#666;font-size:12px}</style></head>
<body><h1>PII Audit Report</h1>
<div class="card"><p class="meta">Generated: ${timestamp}</p><p class="meta">File: ${fileName || 'untitled'}</p></div>
<div class="card"><h2>Summary</h2>
<div class="stat"><span>Total Detections</span><span class="count">${total}</span></div>
<div class="stat"><span>Detection Types</span><span class="count">${entries.length}</span></div></div>
<div class="card"><h2>Detections by Type</h2>
${entries.map(([type, count]) => `<div class="stat"><span class="type">${TYPE_LABELS[type] || type}</span><span class="count">${count}</span></div>`).join('\n')}</div>
<div class="card"><h2>Detected Values</h2>
${entries.map(([type]) => {
  const uniqueVals = [...new Set(displayMatches[type] || [])].slice(0, 20)
  return `<h3>${TYPE_LABELS[type] || type}</h3><div class="values">${uniqueVals.join('<br>')}</div>`
}).join('\n')}</div></body></html>`
      mimeType = 'text/html'
      extension = 'html'
    } else {
      content = `PII AUDIT REPORT
================
Generated: ${timestamp}
File: ${fileName || 'untitled'}

SUMMARY
-------
Total Detections: ${total}
Detection Types: ${entries.length}

DETECTIONS BY TYPE
------------------
${entries.map(([type, count]) => `${(TYPE_LABELS[type] || type).padEnd(20)} ${count}`).join('\n')}

DETECTED VALUES
---------------
${entries.map(([type]) => {
  const uniqueVals = [...new Set(displayMatches[type] || [])].slice(0, 20)
  return `\n${TYPE_LABELS[type] || type}:\n${uniqueVals.map(v => `  - ${v}`).join('\n')}`
}).join('\n')}`
      mimeType = 'text/plain'
      extension = 'txt'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-report-${Date.now()}.${extension}`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (total === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>No PII detected yet.</p>
        <p className="text-sm mt-1">Run Analyze or Scrub to see statistics.</p>
      </div>
    )
  }

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isPreview && (
              <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded">
                Preview Mode
              </span>
            )}
          </div>
          {!isPreview && (
            <button
              onClick={() => setShowAuditReport(true)}
              className="text-xs px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50"
              title="Download a detailed audit report"
            >
              Download Audit Report
            </button>
          )}
        </div>
        
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {entries.map(([type, count]) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className="w-full flex items-center justify-between text-sm hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded transition-colors"
            >
              <span className="text-blue-600 dark:text-blue-400 hover:underline truncate">
                {TYPE_LABELS[type] || type}
              </span>
              <span className="font-medium text-gray-900 dark:text-white ml-2">{count}</span>
            </button>
          ))}
        </div>

        <hr className="my-3 dark:border-gray-700" />

        <div className="flex items-center justify-between text-sm font-semibold">
          <span className="text-gray-900 dark:text-white">Total Detections</span>
          <span className="text-blue-600 dark:text-blue-400">{total}</span>
        </div>
      </div>
      
      {selectedType && displayMatches[selectedType] && (
        <MatchesModal
          type={selectedType}
          matches={displayMatches[selectedType]}
          onClose={() => setSelectedType(null)}
        />
      )}

      {showAuditReport && (
        <Modal onClose={() => setShowAuditReport(false)} title="Download Audit Report">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Download a detailed report of all PII detections found in your document.
            </p>
            
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => { generateAuditReport('txt'); setShowAuditReport(false) }}
                className="p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-center"
              >
                <div className="text-2xl mb-1">📄</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">Text</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">.txt</div>
              </button>
              <button
                onClick={() => { generateAuditReport('json'); setShowAuditReport(false) }}
                className="p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-center"
              >
                <div className="text-2xl mb-1">📋</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">JSON</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">.json</div>
              </button>
              <button
                onClick={() => { generateAuditReport('html'); setShowAuditReport(false) }}
                className="p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-center"
              >
                <div className="text-2xl mb-1">🌐</div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">HTML</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">.html</div>
              </button>
            </div>
            
            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-2 rounded">
              Report includes: {total} detections across {entries.length} types
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
