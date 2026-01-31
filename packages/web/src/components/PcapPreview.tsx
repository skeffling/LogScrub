import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/useAppStore'
import init, { analyze_pcap, anonymize_pcap_bytes } from '../wasm-core/wasm_core'

let wasmReady: Promise<unknown> | null = null
async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = init()
  }
  await wasmReady
}

interface PcapStats {
  packets_processed: number
  packets_modified: number
  ipv4_replaced: number
  ipv6_replaced: number
  mac_replaced: number
  errors: string[]
}

interface PcapMappings {
  ipv4: Record<string, string>
  ipv6: Record<string, string>
  mac: Record<string, string>
}

interface PcapAnalysis {
  stats: PcapStats
  mappings: PcapMappings
}

interface PcapPreviewProps {
  file: File
  onClose: () => void
}

export function PcapPreview({ file, onClose }: PcapPreviewProps) {
  const { preservePrivateIPs } = useAppStore()
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<PcapAnalysis | null>(null)
  const [fileData, setFileData] = useState<Uint8Array | null>(null)

  // Options state
  const [anonymizeIpv4, setAnonymizeIpv4] = useState(true)
  const [anonymizeIpv6, setAnonymizeIpv6] = useState(true)
  const [anonymizeMac, setAnonymizeMac] = useState(true)

  // Load and analyze the file
  useEffect(() => {
    async function loadFile() {
      setIsLoading(true)
      setError(null)

      try {
        await ensureWasm()
        const arrayBuffer = await file.arrayBuffer()
        const data = new Uint8Array(arrayBuffer)
        setFileData(data)

        // Analyze the file
        const config = JSON.stringify({
          anonymize_ipv4: anonymizeIpv4,
          anonymize_ipv6: anonymizeIpv6,
          anonymize_mac: anonymizeMac,
          preserve_private_ips: preservePrivateIPs
        })

        const resultJson = analyze_pcap(data, config)
        const result: PcapAnalysis = JSON.parse(resultJson)
        setAnalysis(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsLoading(false)
      }
    }

    loadFile()
  }, [file, anonymizeIpv4, anonymizeIpv6, anonymizeMac, preservePrivateIPs])

  // Re-analyze when options change
  const reanalyze = useCallback(async () => {
    if (!fileData) return

    setIsLoading(true)
    setError(null)

    try {
      await ensureWasm()
      const config = JSON.stringify({
        anonymize_ipv4: anonymizeIpv4,
        anonymize_ipv6: anonymizeIpv6,
        anonymize_mac: anonymizeMac,
        preserve_private_ips: preservePrivateIPs
      })

      const resultJson = analyze_pcap(fileData, config)
      const result: PcapAnalysis = JSON.parse(resultJson)
      setAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [fileData, anonymizeIpv4, anonymizeIpv6, anonymizeMac, preservePrivateIPs])

  // Download anonymized PCAP
  const handleDownload = useCallback(async () => {
    if (!fileData) return

    setIsProcessing(true)
    setError(null)

    try {
      await ensureWasm()
      const config = JSON.stringify({
        anonymize_ipv4: anonymizeIpv4,
        anonymize_ipv6: anonymizeIpv6,
        anonymize_mac: anonymizeMac,
        preserve_private_ips: preservePrivateIPs
      })

      const anonymizedData = anonymize_pcap_bytes(fileData, config)

      // Create download
      const blob = new Blob([anonymizedData], { type: 'application/vnd.tcpdump.pcap' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `anonymized_${file.name}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsProcessing(false)
    }
  }, [fileData, file.name, anonymizeIpv4, anonymizeIpv6, anonymizeMac, preservePrivateIPs])

  // Download mapping report
  const handleDownloadMapping = useCallback(() => {
    if (!analysis) return

    const report = [
      `# PCAP Anonymization Mapping Report`,
      `# File: ${file.name}`,
      `# Generated: ${new Date().toISOString()}`,
      ``,
      `## Statistics`,
      `Packets processed: ${analysis.stats.packets_processed}`,
      `Packets modified: ${analysis.stats.packets_modified}`,
      `IPv4 addresses replaced: ${analysis.stats.ipv4_replaced}`,
      `IPv6 addresses replaced: ${analysis.stats.ipv6_replaced}`,
      `MAC addresses replaced: ${analysis.stats.mac_replaced}`,
      ``,
      `## IPv4 Mappings`,
      ...Object.entries(analysis.mappings.ipv4).map(([orig, anon]) => `${orig} -> ${anon}`),
      ``,
      `## IPv6 Mappings`,
      ...Object.entries(analysis.mappings.ipv6).map(([orig, anon]) => `${orig} -> ${anon}`),
      ``,
      `## MAC Mappings`,
      ...Object.entries(analysis.mappings.mac).map(([orig, anon]) => `${orig} -> ${anon}`),
    ].join('\n')

    const blob = new Blob([report], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${file.name}_mapping.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [analysis, file.name])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              PCAP Anonymizer
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
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

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="ml-3 text-gray-600 dark:text-gray-400">Analyzing PCAP file...</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-700 dark:text-red-400">{error}</p>
            </div>
          ) : analysis ? (
            <div className="space-y-6">
              {/* Options */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Anonymization Options</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={anonymizeIpv4}
                      onChange={(e) => {
                        setAnonymizeIpv4(e.target.checked)
                        setTimeout(reanalyze, 0)
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">IPv4</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={anonymizeIpv6}
                      onChange={(e) => {
                        setAnonymizeIpv6(e.target.checked)
                        setTimeout(reanalyze, 0)
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">IPv6</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={anonymizeMac}
                      onChange={(e) => {
                        setAnonymizeMac(e.target.checked)
                        setTimeout(reanalyze, 0)
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">MAC</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preservePrivateIPs}
                      disabled
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 opacity-50"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-500" title="Set in main settings">
                      Preserve Private IPs
                    </span>
                  </label>
                </div>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {analysis.stats.packets_processed}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Packets</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {analysis.stats.packets_modified}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Modified</div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {analysis.stats.ipv4_replaced}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">IPv4</div>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {analysis.stats.ipv6_replaced}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">IPv6</div>
                </div>
                <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                    {analysis.stats.mac_replaced}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">MAC</div>
                </div>
              </div>

              {/* Errors */}
              {analysis.stats.errors.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                    Parsing Warnings ({analysis.stats.errors.length})
                  </h4>
                  <div className="max-h-24 overflow-auto text-xs text-yellow-700 dark:text-yellow-300 font-mono">
                    {analysis.stats.errors.slice(0, 10).map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                    {analysis.stats.errors.length > 10 && (
                      <div className="text-yellow-600">...and {analysis.stats.errors.length - 10} more</div>
                    )}
                  </div>
                </div>
              )}

              {/* Mappings */}
              <div className="grid md:grid-cols-3 gap-4">
                {/* IPv4 */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    IPv4 Mappings ({Object.keys(analysis.mappings.ipv4).length})
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {Object.keys(analysis.mappings.ipv4).length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">No IPv4 addresses found</div>
                    ) : (
                      <table className="w-full text-xs">
                        <tbody>
                          {Object.entries(analysis.mappings.ipv4).map(([orig, anon]) => (
                            <tr key={orig} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-1 font-mono text-red-600 dark:text-red-400">{orig}</td>
                              <td className="px-1 text-gray-400">→</td>
                              <td className="px-3 py-1 font-mono text-green-600 dark:text-green-400">{anon}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* IPv6 */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    IPv6 Mappings ({Object.keys(analysis.mappings.ipv6).length})
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {Object.keys(analysis.mappings.ipv6).length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">No IPv6 addresses found</div>
                    ) : (
                      <table className="w-full text-xs">
                        <tbody>
                          {Object.entries(analysis.mappings.ipv6).map(([orig, anon]) => (
                            <tr key={orig} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-1 font-mono text-red-600 dark:text-red-400 break-all">{orig}</td>
                              <td className="px-1 text-gray-400">→</td>
                              <td className="px-3 py-1 font-mono text-green-600 dark:text-green-400 break-all">{anon}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* MAC */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    MAC Mappings ({Object.keys(analysis.mappings.mac).length})
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {Object.keys(analysis.mappings.mac).length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">No MAC addresses found</div>
                    ) : (
                      <table className="w-full text-xs">
                        <tbody>
                          {Object.entries(analysis.mappings.mac).map(([orig, anon]) => (
                            <tr key={orig} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-1 font-mono text-red-600 dark:text-red-400">{orig}</td>
                              <td className="px-1 text-gray-400">→</td>
                              <td className="px-3 py-1 font-mono text-green-600 dark:text-green-400">{anon}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <button
            onClick={handleDownloadMapping}
            disabled={!analysis || isProcessing}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download Mapping
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={!analysis || isProcessing || analysis.stats.packets_modified === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing && (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              Download Anonymized PCAP
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
