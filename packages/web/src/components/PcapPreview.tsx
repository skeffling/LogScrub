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
  packets_filtered: number
  ipv4_replaced: number
  ipv6_replaced: number
  mac_replaced: number
  ports_anonymized: number
  payloads_truncated: number
  timestamps_shifted: number
  filtered_by_port: number
  filtered_by_ip: number
  filtered_by_protocol: number
  errors: string[]
}

interface PcapMappings {
  ipv4: Record<string, string>
  ipv6: Record<string, string>
  mac: Record<string, string>
  ports: Record<number, number>
}

interface PcapAnalysis {
  stats: PcapStats
  mappings: PcapMappings
}

interface PortFilter {
  ports: number[]
  ranges: [number, number][]
}

interface IpFilter {
  ipv4: string[]
  ipv6: string[]
}

interface ProtocolFilter {
  named_protocols: string[]
  remove_non_ip: boolean
}

interface PacketFilter {
  src_port: PortFilter
  dst_port: PortFilter
  any_port: PortFilter
  src_ip: IpFilter
  dst_ip: IpFilter
  any_ip: IpFilter
  protocol: ProtocolFilter
  invert: boolean
}

const EMPTY_PORT_FILTER: PortFilter = { ports: [], ranges: [] }
const EMPTY_IP_FILTER: IpFilter = { ipv4: [], ipv6: [] }
const EMPTY_PROTOCOL_FILTER: ProtocolFilter = { named_protocols: [], remove_non_ip: false }

const EMPTY_FILTER: PacketFilter = {
  src_port: EMPTY_PORT_FILTER,
  dst_port: EMPTY_PORT_FILTER,
  any_port: EMPTY_PORT_FILTER,
  src_ip: EMPTY_IP_FILTER,
  dst_ip: EMPTY_IP_FILTER,
  any_ip: EMPTY_IP_FILTER,
  protocol: EMPTY_PROTOCOL_FILTER,
  invert: false
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
  const [activeTab, setActiveTab] = useState<'anonymize' | 'filter'>('anonymize')

  // Anonymization options
  const [anonymizeIpv4, setAnonymizeIpv4] = useState(true)
  const [anonymizeIpv6, setAnonymizeIpv6] = useState(true)
  const [anonymizeMac, setAnonymizeMac] = useState(true)
  const [anonymizePorts, setAnonymizePorts] = useState(false)
  const [preserveWellKnownPorts, setPreserveWellKnownPorts] = useState(true)

  // Advanced options
  const [timestampShift, setTimestampShift] = useState(0)
  const [payloadMaxBytes, setPayloadMaxBytes] = useState(0)

  // Filter options
  const [filterPorts, setFilterPorts] = useState('')
  const [filterIps, setFilterIps] = useState('')
  const [filterProtocols, setFilterProtocols] = useState<string[]>([])
  const [removeNonIp, setRemoveNonIp] = useState(false)
  const [invertFilter, setInvertFilter] = useState(false)

  // Build filter config from UI state
  const buildFilterConfig = useCallback((): PacketFilter => {
    const filter: PacketFilter = { ...EMPTY_FILTER }

    // Parse ports (comma-separated, supports ranges like 80-443)
    if (filterPorts.trim()) {
      const ports: number[] = []
      const ranges: [number, number][] = []

      filterPorts.split(',').forEach(p => {
        const trimmed = p.trim()
        if (trimmed.includes('-')) {
          const [start, end] = trimmed.split('-').map(s => parseInt(s.trim(), 10))
          if (!isNaN(start) && !isNaN(end)) {
            ranges.push([start, end])
          }
        } else {
          const port = parseInt(trimmed, 10)
          if (!isNaN(port)) {
            ports.push(port)
          }
        }
      })

      filter.any_port = { ports, ranges }
    }

    // Parse IPs (comma-separated, supports CIDR)
    if (filterIps.trim()) {
      const ipv4: string[] = []
      const ipv6: string[] = []

      filterIps.split(',').forEach(ip => {
        const trimmed = ip.trim()
        if (trimmed.includes(':')) {
          ipv6.push(trimmed)
        } else if (trimmed) {
          ipv4.push(trimmed)
        }
      })

      filter.any_ip = { ipv4, ipv6 }
    }

    // Protocols
    if (filterProtocols.length > 0 || removeNonIp) {
      filter.protocol = {
        named_protocols: filterProtocols,
        remove_non_ip: removeNonIp
      }
    }

    filter.invert = invertFilter

    return filter
  }, [filterPorts, filterIps, filterProtocols, removeNonIp, invertFilter])

  // Build full config
  const buildConfig = useCallback(() => {
    return {
      anonymize_ipv4: anonymizeIpv4,
      anonymize_ipv6: anonymizeIpv6,
      anonymize_mac: anonymizeMac,
      preserve_private_ips: preservePrivateIPs,
      anonymize_ports: anonymizePorts,
      preserve_well_known_ports: preserveWellKnownPorts,
      timestamp_shift_secs: timestampShift,
      payload_max_bytes: payloadMaxBytes,
      filter: buildFilterConfig()
    }
  }, [anonymizeIpv4, anonymizeIpv6, anonymizeMac, preservePrivateIPs, anonymizePorts, preserveWellKnownPorts, timestampShift, payloadMaxBytes, buildFilterConfig])

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

        const config = JSON.stringify(buildConfig())
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]) // Only load once when file changes

  // Re-analyze when options change
  const reanalyze = useCallback(async () => {
    if (!fileData) return

    setIsLoading(true)
    setError(null)

    try {
      await ensureWasm()
      const config = JSON.stringify(buildConfig())
      const resultJson = analyze_pcap(fileData, config)
      const result: PcapAnalysis = JSON.parse(resultJson)
      setAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [fileData, buildConfig])

  // Download anonymized PCAP
  const handleDownload = useCallback(async () => {
    if (!fileData) return

    setIsProcessing(true)
    setError(null)

    try {
      await ensureWasm()
      const config = JSON.stringify(buildConfig())
      const anonymizedData = anonymize_pcap_bytes(fileData, config)

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
  }, [fileData, file.name, buildConfig])

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
      `Packets filtered: ${analysis.stats.packets_filtered}`,
      `  - By port: ${analysis.stats.filtered_by_port}`,
      `  - By IP: ${analysis.stats.filtered_by_ip}`,
      `  - By protocol: ${analysis.stats.filtered_by_protocol}`,
      `IPv4 addresses replaced: ${analysis.stats.ipv4_replaced}`,
      `IPv6 addresses replaced: ${analysis.stats.ipv6_replaced}`,
      `MAC addresses replaced: ${analysis.stats.mac_replaced}`,
      `Ports anonymized: ${analysis.stats.ports_anonymized}`,
      `Payloads truncated: ${analysis.stats.payloads_truncated}`,
      `Timestamps shifted: ${analysis.stats.timestamps_shifted}`,
      ``,
      `## IPv4 Mappings`,
      ...Object.entries(analysis.mappings.ipv4).map(([orig, anon]) => `${orig} -> ${anon}`),
      ``,
      `## IPv6 Mappings`,
      ...Object.entries(analysis.mappings.ipv6).map(([orig, anon]) => `${orig} -> ${anon}`),
      ``,
      `## MAC Mappings`,
      ...Object.entries(analysis.mappings.mac).map(([orig, anon]) => `${orig} -> ${anon}`),
      ``,
      `## Port Mappings`,
      ...Object.entries(analysis.mappings.ports).map(([orig, anon]) => `${orig} -> ${anon}`),
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

  const toggleProtocol = (proto: string) => {
    setFilterProtocols(prev =>
      prev.includes(proto) ? prev.filter(p => p !== proto) : [...prev, proto]
    )
  }

  const hasFilters = filterPorts.trim() || filterIps.trim() || filterProtocols.length > 0 || removeNonIp

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full h-full overflow-hidden flex flex-col">
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

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex px-6">
            <button
              onClick={() => setActiveTab('anonymize')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === 'anonymize'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              Anonymization
            </button>
            <button
              onClick={() => setActiveTab('filter')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
                activeTab === 'filter'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              Packet Filter
              {hasFilters && (
                <span className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-xs px-1.5 py-0.5 rounded">
                  Active
                </span>
              )}
            </button>
          </div>
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
              {/* Anonymization Tab */}
              {activeTab === 'anonymize' && (
                <>
                  {/* Address Anonymization */}
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Address Anonymization</h3>
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

                  {/* Port & Advanced Options */}
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Advanced Options</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Port Anonymization */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={anonymizePorts}
                            onChange={(e) => {
                              setAnonymizePorts(e.target.checked)
                              setTimeout(reanalyze, 0)
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Anonymize Ports</span>
                        </label>
                        {anonymizePorts && (
                          <label className="flex items-center gap-2 cursor-pointer ml-6">
                            <input
                              type="checkbox"
                              checked={preserveWellKnownPorts}
                              onChange={(e) => {
                                setPreserveWellKnownPorts(e.target.checked)
                                setTimeout(reanalyze, 0)
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-600 dark:text-gray-400">Preserve well-known ports (0-1023)</span>
                          </label>
                        )}
                      </div>

                      {/* Payload Truncation */}
                      <div className="space-y-2">
                        <label className="block text-sm text-gray-700 dark:text-gray-300">
                          Truncate Payload (bytes)
                        </label>
                        <input
                          type="number"
                          value={payloadMaxBytes || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0
                            setPayloadMaxBytes(val)
                          }}
                          onBlur={() => setTimeout(reanalyze, 0)}
                          placeholder="0 = no truncation"
                          min={0}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                        />
                        <p className="text-xs text-gray-500">Keeps headers, truncates application data</p>
                      </div>

                      {/* Timestamp Shift */}
                      <div className="space-y-2 md:col-span-2">
                        <label className="block text-sm text-gray-700 dark:text-gray-300">
                          Timestamp Shift (seconds)
                        </label>
                        <input
                          type="number"
                          value={timestampShift || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0
                            setTimestampShift(val)
                          }}
                          onBlur={() => setTimeout(reanalyze, 0)}
                          placeholder="0 = no shift"
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                        />
                        <p className="text-xs text-gray-500">Shift all timestamps by N seconds (negative to shift earlier)</p>
                      </div>
                    </div>
                  </div>

                  {/* Statistics */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {analysis.stats.packets_processed}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">Packets</div>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-green-600 dark:text-green-400">
                        {analysis.stats.packets_modified}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">Modified</div>
                    </div>
                    {analysis.stats.packets_filtered > 0 && (
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-red-600 dark:text-red-400">
                          {analysis.stats.packets_filtered}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">Filtered</div>
                      </div>
                    )}
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                        {analysis.stats.ipv4_replaced}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">IPv4</div>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                        {analysis.stats.ipv6_replaced}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">IPv6</div>
                    </div>
                    <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-pink-600 dark:text-pink-400">
                        {analysis.stats.mac_replaced}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">MAC</div>
                    </div>
                    {analysis.stats.ports_anonymized > 0 && (
                      <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400">
                          {analysis.stats.ports_anonymized}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">Ports</div>
                      </div>
                    )}
                    {analysis.stats.payloads_truncated > 0 && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                          {analysis.stats.payloads_truncated}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">Truncated</div>
                      </div>
                    )}
                    {analysis.stats.timestamps_shifted > 0 && (
                      <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-teal-600 dark:text-teal-400">
                          {analysis.stats.timestamps_shifted}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">Time Shifted</div>
                      </div>
                    )}
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
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* IPv4 */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        IPv4 ({Object.keys(analysis.mappings.ipv4).length})
                      </div>
                      <div className="max-h-40 overflow-auto">
                        {Object.keys(analysis.mappings.ipv4).length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">None</div>
                        ) : (
                          <table className="w-full text-xs">
                            <tbody>
                              {Object.entries(analysis.mappings.ipv4).map(([orig, anon]) => (
                                <tr key={orig} className="border-t border-gray-100 dark:border-gray-700">
                                  <td className="px-2 py-1 font-mono text-red-600 dark:text-red-400">{orig}</td>
                                  <td className="text-gray-400">→</td>
                                  <td className="px-2 py-1 font-mono text-green-600 dark:text-green-400">{anon}</td>
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
                        IPv6 ({Object.keys(analysis.mappings.ipv6).length})
                      </div>
                      <div className="max-h-40 overflow-auto">
                        {Object.keys(analysis.mappings.ipv6).length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">None</div>
                        ) : (
                          <table className="w-full text-xs">
                            <tbody>
                              {Object.entries(analysis.mappings.ipv6).map(([orig, anon]) => (
                                <tr key={orig} className="border-t border-gray-100 dark:border-gray-700">
                                  <td className="px-2 py-1 font-mono text-red-600 dark:text-red-400 break-all">{orig}</td>
                                  <td className="text-gray-400">→</td>
                                  <td className="px-2 py-1 font-mono text-green-600 dark:text-green-400 break-all">{anon}</td>
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
                        MAC ({Object.keys(analysis.mappings.mac).length})
                      </div>
                      <div className="max-h-40 overflow-auto">
                        {Object.keys(analysis.mappings.mac).length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">None</div>
                        ) : (
                          <table className="w-full text-xs">
                            <tbody>
                              {Object.entries(analysis.mappings.mac).map(([orig, anon]) => (
                                <tr key={orig} className="border-t border-gray-100 dark:border-gray-700">
                                  <td className="px-2 py-1 font-mono text-red-600 dark:text-red-400">{orig}</td>
                                  <td className="text-gray-400">→</td>
                                  <td className="px-2 py-1 font-mono text-green-600 dark:text-green-400">{anon}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* Ports */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Ports ({Object.keys(analysis.mappings.ports).length})
                      </div>
                      <div className="max-h-40 overflow-auto">
                        {Object.keys(analysis.mappings.ports).length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">None</div>
                        ) : (
                          <table className="w-full text-xs">
                            <tbody>
                              {Object.entries(analysis.mappings.ports).map(([orig, anon]) => (
                                <tr key={orig} className="border-t border-gray-100 dark:border-gray-700">
                                  <td className="px-2 py-1 font-mono text-red-600 dark:text-red-400">{orig}</td>
                                  <td className="text-gray-400">→</td>
                                  <td className="px-2 py-1 font-mono text-green-600 dark:text-green-400">{anon}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Filter Tab */}
              {activeTab === 'filter' && (
                <div className="space-y-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Packet filters remove matching packets from the output. Use this to exclude sensitive traffic
                      (e.g., authentication, personal communications) before sharing the capture.
                    </p>
                  </div>

                  {/* Port Filter */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Filter by Port
                    </label>
                    <input
                      type="text"
                      value={filterPorts}
                      onChange={(e) => setFilterPorts(e.target.value)}
                      placeholder="e.g., 22, 80, 443, 8000-9000"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                    <p className="text-xs text-gray-500">Comma-separated ports or ranges (matches source or destination)</p>
                  </div>

                  {/* IP Filter */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Filter by IP Address
                    </label>
                    <input
                      type="text"
                      value={filterIps}
                      onChange={(e) => setFilterIps(e.target.value)}
                      placeholder="e.g., 192.168.1.100, 10.0.0.0/8, 2001:db8::1"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                    <p className="text-xs text-gray-500">Comma-separated IPs or CIDR blocks (matches source or destination)</p>
                  </div>

                  {/* Protocol Filter */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Filter by Protocol
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['TCP', 'UDP', 'ICMP', 'GRE', 'ESP'].map(proto => (
                        <button
                          key={proto}
                          onClick={() => toggleProtocol(proto.toLowerCase())}
                          className={`px-3 py-1 text-sm rounded-full border ${
                            filterProtocols.includes(proto.toLowerCase())
                              ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                              : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {proto}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        checked={removeNonIp}
                        onChange={(e) => setRemoveNonIp(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Remove non-IP traffic (ARP, etc.)</span>
                    </label>
                  </div>

                  {/* Invert */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={invertFilter}
                        onChange={(e) => setInvertFilter(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Invert filter (keep only matching packets instead of removing them)
                      </span>
                    </label>
                  </div>

                  {/* Apply Button */}
                  <button
                    onClick={reanalyze}
                    disabled={isLoading}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Apply Filters & Re-analyze
                  </button>

                  {/* Filter Stats */}
                  {analysis.stats.packets_filtered > 0 && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                        Packets to be Filtered: {analysis.stats.packets_filtered}
                      </h4>
                      <div className="text-sm text-red-700 dark:text-red-300 space-y-1">
                        {analysis.stats.filtered_by_port > 0 && (
                          <div>By port: {analysis.stats.filtered_by_port}</div>
                        )}
                        {analysis.stats.filtered_by_ip > 0 && (
                          <div>By IP: {analysis.stats.filtered_by_ip}</div>
                        )}
                        {analysis.stats.filtered_by_protocol > 0 && (
                          <div>By protocol: {analysis.stats.filtered_by_protocol}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
              disabled={!analysis || isProcessing}
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
