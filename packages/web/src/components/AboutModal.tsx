import { Modal } from './Modal'
import { useAppStore } from '../stores/useAppStore'

interface AboutModalProps {
  onClose: () => void
}

export function AboutModal({ onClose }: AboutModalProps) {
  const { terminalStyle, setTerminalStyle, themeMode, setThemeMode } = useAppStore()

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4 text-gray-700 dark:text-gray-300">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">About LogScrub</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              v{__APP_VERSION__} · <a href="changelog.html" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Changelog</a>
            </p>
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
        
        <p>
          <strong className="text-gray-900 dark:text-white">LogScrub</strong> is a privacy-first tool for sanitizing logs and text files by detecting and redacting Personally Identifiable Information (PII).
        </p>
        
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">100% Client-Side</h3>
          <p className="text-sm">
            All processing happens entirely in your browser. Your data never leaves your device and is never sent to any server.
          </p>
        </div>
        
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">How to Use</h3>
          <ol className="text-sm list-decimal list-inside space-y-1">
            <li>Paste text or upload a log file</li>
            <li>Select which PII types to detect</li>
            <li>Choose replacement strategy per type (label, fake data, or redact)</li>
            <li>Click "Scrub" to process</li>
            <li>Download or copy the scrubbed output</li>
          </ol>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Keyboard Shortcuts</h3>
          <ul className="text-sm space-y-1">
            <li>
              <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">⌘/Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">Enter</kbd> — Scrub
            </li>
            <li>
              <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">⌘/Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">S</kbd> — Download
            </li>
          </ul>
        </div>

        <hr className="dark:border-gray-700" />

        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">How It Works Technically</h3>
          <div className="text-sm space-y-3">
            <div>
              <h4 className="font-medium text-gray-800 dark:text-gray-200">Architecture</h4>
              <p className="text-gray-600 dark:text-gray-400">
                The app uses a hybrid architecture: React/TypeScript for the UI, and Rust compiled to WebAssembly (WASM) for high-performance pattern matching. Processing runs in a Web Worker to keep the UI responsive.
              </p>
            </div>
            
            <div className="bg-gray-100 dark:bg-gray-900 p-3 rounded font-mono text-xs">
              <div>Browser → Web Worker → WASM (Rust) → Pattern Matching → Results</div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-800 dark:text-gray-200">Pattern Detection</h4>
              <ul className="text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                <li><strong>Regex Engine:</strong> Uses Rust's regex crate which guarantees linear-time matching (ReDoS-safe)</li>
                <li><strong>50+ Patterns:</strong> Each PII type has a carefully crafted regex pattern</li>
                <li><strong>Validators:</strong> Some patterns include checksum validation (Luhn for credit cards, Mod-97 for IBANs)</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-800 dark:text-gray-200">Processing Flow</h4>
              <ol className="text-gray-600 dark:text-gray-400 list-decimal list-inside space-y-1">
                <li>Text is sent to the Web Worker (off main thread)</li>
                <li>WASM module loads and initializes regex patterns</li>
                <li>Each enabled pattern scans the text, collecting matches with positions</li>
                <li>Matches are validated (checksums where applicable)</li>
                <li>Replacements are applied in reverse order (to preserve positions)</li>
                <li>Results returned: scrubbed text + stats + matched values</li>
              </ol>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-800 dark:text-gray-200">Why WASM?</h4>
              <ul className="text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                <li>10-100x faster than JavaScript regex for large files</li>
                <li>Rust's regex crate prevents catastrophic backtracking</li>
                <li>Memory-safe processing of untrusted input</li>
                <li>Consistent performance across browsers</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-800 dark:text-gray-200">Large File Handling</h4>
              <ul className="text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                <li><strong>Virtual Scrolling:</strong> Uses <a href="https://tanstack.com/virtual" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">@tanstack/react-virtual</a> to render only visible lines</li>
                <li><strong>Changed Lines Filter:</strong> Quickly review only lines that were modified</li>
                <li><strong>Compression:</strong> Upload/download .zip and .gz files (handled via WASM)</li>
              </ul>
            </div>
          </div>
        </div>

        <hr className="dark:border-gray-700" />
        
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Replacement Strategies</h3>
          <ul className="text-sm list-disc list-inside space-y-1">
            <li><strong>Label</strong> - Replace with [EMAIL-1], [IPv4-2], etc. (sequential numbering)</li>
            <li><strong>Fake</strong> - Replace with realistic fake data (user1@example.com, 192.0.2.1)</li>
            <li><strong>Redact</strong> - Replace with blocks (████████)</li>
          </ul>
        </div>
        
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Consistency Mode</h3>
          <p className="text-sm">
            When enabled, the same input value will always be replaced with the same output. This preserves relationships in your logs (e.g., the same email appearing multiple times gets the same replacement).
          </p>
        </div>
        
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Checksum Validation</h3>
          <p className="text-sm">
            To reduce false positives, certain patterns validate matches using checksums:
          </p>
          <ul className="text-sm list-disc list-inside space-y-1 mt-1">
            <li><strong>Credit Cards:</strong> Luhn algorithm</li>
            <li><strong>IBANs:</strong> Mod-97 algorithm</li>
            <li><strong>Bitcoin:</strong> Base58Check/Bech32 format validation</li>
            <li><strong>Ethereum:</strong> Hex format validation</li>
          </ul>
        </div>
        
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Analytics</h3>
          <p className="text-sm">
            We use <a href="https://umami.is" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Umami</a>, a privacy-focused analytics tool, to track only page views and the number of Scrub/Analyze actions. No personal data, cookies, or tracking identifiers are collected.
          </p>
        </div>
        
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Display Options</h3>
          <div className="space-y-3">
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white block mb-2">Theme</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setThemeMode('light')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border ${
                    themeMode === 'light'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Light
                </button>
                <button
                  onClick={() => setThemeMode('dark')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border ${
                    themeMode === 'dark'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  Dark
                </button>
                <button
                  onClick={() => setThemeMode('auto')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border ${
                    themeMode === 'auto'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Auto
                </button>
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={terminalStyle}
                onChange={(e) => setTerminalStyle(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Terminal Style</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Dark grey background with light text for Original and Scrubbed panes
                </p>
              </div>
            </label>
          </div>
        </div>

        <hr className="dark:border-gray-700" />

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">Important Disclaimer</h3>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            LogScrub does not guarantee detection of all PII. Pattern-based detection has limitations and may miss sensitive data in unexpected formats. <strong>Always review your scrubbed output before sharing.</strong> You are responsible for ensuring adequate sanitization of your data.
          </p>
        </div>
        
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Feedback</h3>
          <p className="text-sm">
            Found a pattern that should be detected? Have a suggestion or want to report a problem? We'd love to hear from you at <a href="mailto:skeffling@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">skeffling@gmail.com</a>
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Support</h3>
          <p className="text-sm">
            Find LogScrub useful? <a href="https://ko-fi.com/pitstopper" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300">Buy us a coffee ☕</a>
          </p>
        </div>

        <div className="pt-4 border-t dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Built with React, TypeScript, Rust/WebAssembly, TanStack Virtual, Tailwind CSS, and Zustand. Press ESC to close.
          </p>
        </div>
      </div>
    </Modal>
  )
}
