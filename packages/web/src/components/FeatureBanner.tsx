import { useState, useEffect } from 'react'

const STORAGE_KEY = 'logscrub_feature_banner_dismissed'

function loadDismissedState(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'true'
  } catch {
    return false
  }
}

function saveDismissedState(dismissed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(dismissed))
  } catch {}
}

export function FeatureBanner() {
  const [dismissed, setDismissed] = useState(() => loadDismissedState())

  useEffect(() => {
    saveDismissedState(dismissed)
  }, [dismissed])

  if (dismissed) return null

  return (
    <section
      className="flex-shrink-0 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800 border border-blue-200 dark:border-gray-700 rounded-lg p-4 mb-4 relative"
      aria-label="Application features"
    >
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors"
        aria-label="Dismiss feature overview"
        title="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="pr-8">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Free Online Log Scrubber &amp; PII Redaction Tool
        </h1>

        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          Securely remove sensitive data from logs, text files, and documents.
          All processing happens in your browser — your data never leaves your device.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
          <ul className="space-y-1">
            <li className="flex items-start gap-1.5">
              <span className="text-green-500 mt-0.5">✓</span>
              <span><strong>PII Detection</strong> — emails, phone numbers, SSNs, addresses</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-green-500 mt-0.5">✓</span>
              <span><strong>API Key &amp; Secret Removal</strong> — AWS, Stripe, GitHub tokens</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-green-500 mt-0.5">✓</span>
              <span><strong>Credit Card Masking</strong> — PCI-DSS compliant redaction</span>
            </li>
          </ul>
          <ul className="space-y-1">
            <li className="flex items-start gap-1.5">
              <span className="text-green-500 mt-0.5">✓</span>
              <span><strong>IP Address Anonymization</strong> — IPv4 and IPv6 support</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-green-500 mt-0.5">✓</span>
              <span><strong>Timestamp Shifting</strong> — anonymize log timestamps</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-green-500 mt-0.5">✓</span>
              <span><strong>Custom Regex Rules</strong> — define your own patterns</span>
            </li>
          </ul>
          <ul className="space-y-1">
            <li className="flex items-start gap-1.5">
              <span className="text-green-500 mt-0.5">✓</span>
              <span><strong>Large File Support</strong> — handles 100MB+ logs</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-green-500 mt-0.5">✓</span>
              <span><strong>Multiple Output Formats</strong> — .txt, .zip, .gz download</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-green-500 mt-0.5">✓</span>
              <span><strong>100% Client-Side</strong> — GDPR &amp; privacy friendly</span>
            </li>
          </ul>
        </div>

        <div className="mt-4 pt-3 border-t border-blue-200/50 dark:border-gray-700/50">
          <h2 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
            Why sanitize your logs?
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            <strong>Share logs safely with AI assistants</strong> like ChatGPT, Claude, or Gemini for debugging help without exposing customer data or API keys.
            Perfect for <strong>posting to GitHub issues</strong>, Stack Overflow, pastebins, or support tickets without leaking sensitive information.
            Essential for <strong>compliance teams</strong> preparing audit logs, and developers sharing production data with contractors or offshore teams.
            Use it before uploading logs to third-party monitoring tools, or when creating <strong>sanitized test datasets</strong> from real production data.
          </p>
        </div>
      </div>
    </section>
  )
}
