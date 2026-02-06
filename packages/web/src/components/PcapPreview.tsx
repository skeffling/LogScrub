import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../stores/useAppStore'

function createPcapWorker(): Worker {
  return new Worker(new URL('../workers/pcap.worker.ts', import.meta.url), { type: 'module' })
}

let messageId = 0

function postWorkerMessage(worker: Worker, type: string, payload?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++messageId
    const msgHandler = (e: MessageEvent) => {
      if (e.data.type === 'result') {
        worker.removeEventListener('message', msgHandler)
        worker.removeEventListener('error', errHandler)
        resolve(e.data.payload)
      } else if (e.data.type === 'error') {
        worker.removeEventListener('message', msgHandler)
        worker.removeEventListener('error', errHandler)
        reject(new Error(e.data.payload))
      }
    }
    const errHandler = (e: ErrorEvent) => {
      worker.removeEventListener('message', msgHandler)
      worker.removeEventListener('error', errHandler)
      reject(new Error(e.message || 'Worker error'))
    }
    worker.addEventListener('message', msgHandler)
    worker.addEventListener('error', errHandler)
    worker.postMessage({ type, payload, id })
  })
}

interface PcapStats {
  packets_processed: number
  packets_modified: number
  packets_filtered: number
  ipv4_replaced: number
  ipv6_replaced: number
  mac_replaced: number
  arp_packets_anonymized: number
  ports_anonymized: number
  payloads_truncated: number
  timestamps_shifted: number
  dns_names_anonymized: number
  tls_sni_scrubbed: number
  http_headers_scrubbed: number
  dhcp_options_anonymized: number
  netbios_smb_scrubbed: number
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
  domains: Record<string, string>
}

interface PcapAnalysis {
  stats: PcapStats
  mappings: PcapMappings
}

interface ProtocolStats {
  ethernet: number
  arp: number
  ipv4: number
  ipv6: number
  tcp: number
  udp: number
  icmp: number
  icmpv6: number
  dns: number
  http: number
  https: number
  ftp: number
  ssh: number
  telnet: number
  smtp: number
  other: number
  dhcp: number
  tls_client_hello: number
  netbios: number
  smb: number
}

interface PortStats {
  top_src_ports: [number, number][]
  top_dst_ports: [number, number][]
}

interface PcapPreAnalysis {
  total_packets: number
  total_bytes: number
  protocols: ProtocolStats
  unique_ipv4: string[]
  unique_ipv6: string[]
  unique_mac: string[]
  port_stats: PortStats
  sensitive_indicators: string[]
}

interface EthernetLayer {
  src_mac: string
  dst_mac: string
  ethertype: string
  ethertype_raw: number
}

interface IpLayer {
  version: number
  src_ip: string
  dst_ip: string
  protocol: string
  protocol_num: number
  ttl: number
  length: number
}

interface TransportLayer {
  protocol: string
  src_port: number
  dst_port: number
  flags?: string
  seq?: number
  ack?: number
  length: number
}

interface ApplicationLayer {
  protocol: string
  info: string
}

interface ParsedPacket {
  ethernet?: EthernetLayer
  ip?: IpLayer
  transport?: TransportLayer
  application?: ApplicationLayer
  payload_preview: string
  total_length: number
}

interface PacketComparison {
  index: number
  original_hex: string
  modified_hex: string
  original_ascii: string
  modified_ascii: string
  changed: boolean
  summary: string
  original_parsed?: ParsedPacket
  modified_parsed?: ParsedPacket
}

interface SearchResult {
  packet_index: number
  offset: number
  context: string
  summary: string
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
  const workerRef = useRef<Worker | null>(null)

  // Initialize worker
  useEffect(() => {
    workerRef.current = createPcapWorker()
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<PcapAnalysis | null>(null)
  const [preAnalysis, setPreAnalysis] = useState<PcapPreAnalysis | null>(null)
  const [fileData, setFileData] = useState<Uint8Array | null>(null)
  const [activeTab, setActiveTab] = useState<'analysis' | 'anonymize' | 'filter' | 'compare' | 'search'>('analysis')

  // Comparison and search state
  const [comparisons, setComparisons] = useState<PacketComparison[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingComparison, setIsLoadingComparison] = useState(false)

  // Anonymization options
  const [anonymizeIpv4, setAnonymizeIpv4] = useState(true)
  const [anonymizeIpv6, setAnonymizeIpv6] = useState(true)
  const [anonymizeMac, setAnonymizeMac] = useState(true)
  const [anonymizePorts, setAnonymizePorts] = useState(false)
  const [preserveWellKnownPorts, setPreserveWellKnownPorts] = useState(true)
  const [anonymizeDns, setAnonymizeDns] = useState(false)

  // Advanced options
  const [timestampShift, setTimestampShift] = useState(0)
  const [payloadMaxBytes, setPayloadMaxBytes] = useState(0)

  // Protocol scrubbing options
  const [scrubTlsSni, setScrubTlsSni] = useState(false)
  const [scrubHttpHeaders, setScrubHttpHeaders] = useState(false)
  const [anonymizeDhcp, setAnonymizeDhcp] = useState(false)
  const [scrubNetbiosSmb, setScrubNetbiosSmb] = useState(false)
  const [breakChecksums, setBreakChecksums] = useState(false)

  // Filter options
  const [filterPorts, setFilterPorts] = useState('')
  const [filterIps, setFilterIps] = useState('')
  const [filterProtocols, setFilterProtocols] = useState<string[]>([])
  const [removeNonIp, setRemoveNonIp] = useState(false)
  const [invertFilter, setInvertFilter] = useState(false)
  const [wiresharkFilter, setWiresharkFilter] = useState('')
  const [wiresharkFilterError, setWiresharkFilterError] = useState<string | null>(null)

  // Mapping import/export
  const [importedMappings, setImportedMappings] = useState<PcapMappings | null>(null)

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
      anonymize_dns: anonymizeDns,
      scrub_tls_sni: scrubTlsSni,
      scrub_http_headers: scrubHttpHeaders,
      anonymize_dhcp: anonymizeDhcp,
      scrub_netbios_smb: scrubNetbiosSmb,
      break_checksums: breakChecksums,
      import_mappings: importedMappings,
      filter: buildFilterConfig()
    }
  }, [anonymizeIpv4, anonymizeIpv6, anonymizeMac, preservePrivateIPs, anonymizePorts, preserveWellKnownPorts, timestampShift, payloadMaxBytes, anonymizeDns, scrubTlsSni, scrubHttpHeaders, anonymizeDhcp, scrubNetbiosSmb, breakChecksums, importedMappings, buildFilterConfig])

  // Load and analyze the file
  useEffect(() => {
    async function loadFile() {
      if (!workerRef.current) return
      setIsLoading(true)
      setError(null)

      try {
        const arrayBuffer = await file.arrayBuffer()
        const data = new Uint8Array(arrayBuffer)
        setFileData(data)

        // Send file data to worker once - it stays in worker memory
        await postWorkerMessage(workerRef.current, 'load', { data })

        // Run pre-analysis for protocol stats (JSON parsed in worker)
        const preAnalysisResult = await postWorkerMessage(workerRef.current, 'pre_analyze') as PcapPreAnalysis
        setPreAnalysis(preAnalysisResult)

        // Run anonymization analysis (JSON parsed in worker)
        const config = JSON.stringify(buildConfig())
        const result = await postWorkerMessage(workerRef.current, 'analyze', { config }) as PcapAnalysis
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
    if (!fileData || !workerRef.current) return

    setIsLoading(true)
    setError(null)

    try {
      const config = JSON.stringify(buildConfig())
      const result = await postWorkerMessage(workerRef.current, 'analyze', { config }) as PcapAnalysis
      setAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [fileData, buildConfig])

  // Download anonymized PCAP
  const handleDownload = useCallback(async () => {
    if (!fileData || !workerRef.current) return

    setIsProcessing(true)
    setError(null)

    try {
      const config = JSON.stringify(buildConfig())
      const anonymizedData = await postWorkerMessage(workerRef.current, 'anonymize', { config }) as Uint8Array

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
      `ARP packets anonymized: ${analysis.stats.arp_packets_anonymized}`,
      `Ports anonymized: ${analysis.stats.ports_anonymized}`,
      `Payloads truncated: ${analysis.stats.payloads_truncated}`,
      `Timestamps shifted: ${analysis.stats.timestamps_shifted}`,
      `DNS names anonymized: ${analysis.stats.dns_names_anonymized}`,
      `TLS SNI scrubbed: ${analysis.stats.tls_sni_scrubbed}`,
      `HTTP headers scrubbed: ${analysis.stats.http_headers_scrubbed}`,
      `DHCP options anonymized: ${analysis.stats.dhcp_options_anonymized}`,
      `NetBIOS/SMB scrubbed: ${analysis.stats.netbios_smb_scrubbed}`,
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
      ``,
      `## Domain Mappings`,
      ...Object.entries(analysis.mappings.domains).map(([orig, anon]) => `${orig} -> ${anon}`),
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

  // Export mappings as JSON (for import into other files)
  const handleExportMappingsJson = useCallback(() => {
    if (!analysis) return

    const json = JSON.stringify(analysis.mappings, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${file.name}_mappings.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [analysis, file.name])

  // Import mappings from JSON file
  const handleImportMappings = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string
        const mappings = JSON.parse(json) as PcapMappings
        setImportedMappings(mappings)
        // Re-analyze with imported mappings
        setTimeout(reanalyze, 0)
      } catch (err) {
        setError('Failed to parse mappings JSON file')
      }
    }
    reader.readAsText(file)
    // Reset input
    e.target.value = ''
  }, [reanalyze])

  // Clear imported mappings
  const handleClearMappings = useCallback(() => {
    setImportedMappings(null)
    setTimeout(reanalyze, 0)
  }, [reanalyze])

  // Load packet comparison data
  const loadComparison = useCallback(async () => {
    if (!fileData || !workerRef.current) return

    setIsLoadingComparison(true)
    try {
      const config = JSON.stringify(buildConfig())
      const result = await postWorkerMessage(workerRef.current, 'compare', { config, max_packets: 100 }) as PacketComparison[]
      setComparisons(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoadingComparison(false)
    }
  }, [fileData, buildConfig])

  // Search packets
  const handleSearch = useCallback(async () => {
    if (!fileData || !searchTerm.trim() || !workerRef.current) return

    setIsSearching(true)
    try {
      const result = await postWorkerMessage(workerRef.current, 'search', { term: searchTerm.trim(), max_results: 50 }) as SearchResult[]
      setSearchResults(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSearching(false)
    }
  }, [fileData, searchTerm])

  // Load comparison when tab changes to compare
  useEffect(() => {
    if (activeTab === 'compare' && comparisons.length === 0 && fileData) {
      loadComparison()
    }
  }, [activeTab, comparisons.length, fileData, loadComparison])

  const toggleProtocol = (proto: string) => {
    setFilterProtocols(prev =>
      prev.includes(proto) ? prev.filter(p => p !== proto) : [...prev, proto]
    )
  }

  // Parse Wireshark display filter syntax
  const parseWiresharkFilter = useCallback((filter: string) => {
    const trimmed = filter.trim().toLowerCase()
    if (!trimmed) {
      setWiresharkFilterError(null)
      return
    }

    const newPorts: string[] = []
    const newIps: string[] = []
    const newProtocols: string[] = []
    let shouldInvert = false
    let shouldRemoveNonIp = false

    // Split by "and" or "or" (simple parser - doesn't handle complex boolean logic)
    const parts = trimmed.split(/\s+(?:and|or|\&\&|\|\|)\s+/)

    for (const part of parts) {
      const expr = part.trim()
      if (!expr) continue

      // Check for "not" prefix
      if (expr.startsWith('not ') || expr.startsWith('!')) {
        shouldInvert = true
      }
      const cleanExpr = expr.replace(/^(not\s+|!)/, '')

      // Protocol-only filters (tcp, udp, icmp, etc.)
      if (/^(tcp|udp|icmp|gre|esp|arp)$/i.test(cleanExpr)) {
        const proto = cleanExpr.toUpperCase()
        if (proto === 'ARP') {
          shouldRemoveNonIp = true
        } else {
          newProtocols.push(proto.toLowerCase())
        }
        continue
      }

      // ip, ipv6, http, dns, etc. (protocol filters)
      if (/^(ip|ipv6|http|https|dns|ftp|ssh|smtp|telnet)$/i.test(cleanExpr)) {
        // These are informational - map to best effort
        if (cleanExpr === 'ip' || cleanExpr === 'ipv6') {
          shouldRemoveNonIp = true
        }
        continue
      }

      // ip.addr == X.X.X.X or ip.src == X.X.X.X or ip.dst == X.X.X.X
      const ipMatch = cleanExpr.match(/ip(?:v6)?\.(?:addr|src|dst)\s*[=!]+\s*([0-9a-f:./]+)/i)
      if (ipMatch) {
        newIps.push(ipMatch[1])
        continue
      }

      // tcp.port == X or udp.port == X or port == X
      const portMatch = cleanExpr.match(/(?:tcp|udp)?\.?port\s*[=!]+\s*(\d+)/i)
      if (portMatch) {
        newPorts.push(portMatch[1])
        continue
      }

      // tcp.srcport, tcp.dstport
      const srcDstPortMatch = cleanExpr.match(/(?:tcp|udp)\.(src|dst)port\s*[=!]+\s*(\d+)/i)
      if (srcDstPortMatch) {
        newPorts.push(srcDstPortMatch[2])
        continue
      }

      // Port range: tcp.port >= 1024 and tcp.port <= 65535
      const portRangeMatch = cleanExpr.match(/port\s*(>=?|<=?)\s*(\d+)/i)
      if (portRangeMatch) {
        // Simplified - just add the port number
        newPorts.push(portRangeMatch[2])
        continue
      }

      // Unrecognized expression
      setWiresharkFilterError(`Unrecognized filter: "${cleanExpr}"`)
      return
    }

    // Apply parsed values
    setWiresharkFilterError(null)
    if (newPorts.length > 0) setFilterPorts(newPorts.join(', '))
    if (newIps.length > 0) setFilterIps(newIps.join(', '))
    if (newProtocols.length > 0) setFilterProtocols(newProtocols)
    if (shouldInvert) setInvertFilter(true)
    if (shouldRemoveNonIp) setRemoveNonIp(true)
  }, [])

  const hasFilters = filterPorts.trim() || filterIps.trim() || filterProtocols.length > 0 || removeNonIp || wiresharkFilter.trim()

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full h-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                PCAP Anonymizer
              </h2>
              {importedMappings && (
                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                  Mappings Imported
                </span>
              )}
            </div>
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
              onClick={() => setActiveTab('analysis')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === 'analysis'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              Analysis
            </button>
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
            <button
              onClick={() => setActiveTab('compare')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === 'compare'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              Compare
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === 'search'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              Search
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
              {/* Analysis Tab */}
              {activeTab === 'analysis' && preAnalysis && (
                <>
                  {/* Overview Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {preAnalysis.total_packets.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Total Packets</div>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {(preAnalysis.total_bytes / 1024).toFixed(1)} KB
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Total Size</div>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {preAnalysis.unique_ipv4.length + preAnalysis.unique_ipv6.length}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Unique IPs</div>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                        {preAnalysis.unique_mac.length}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Unique MACs</div>
                    </div>
                  </div>

                  {/* Sensitive Data Warnings */}
                  {preAnalysis.sensitive_indicators.length > 0 && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Sensitive Data Indicators
                      </h4>
                      <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                        {preAnalysis.sensitive_indicators.map((indicator, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-yellow-500">•</span>
                            {indicator}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Protocol Distribution */}
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Protocol Distribution</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {/* Network Layer */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Network</div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">IPv4</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.ipv4}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">IPv6</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.ipv6}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">ARP</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.arp}</span>
                          </div>
                        </div>
                      </div>

                      {/* Transport Layer */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Transport</div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">TCP</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.tcp}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">UDP</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.udp}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">ICMP</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.icmp + preAnalysis.protocols.icmpv6}</span>
                          </div>
                        </div>
                      </div>

                      {/* Application - DNS/Web */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Web/DNS</div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">HTTP</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.http}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">HTTPS</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.https}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">DNS</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.dns}</span>
                          </div>
                        </div>
                      </div>

                      {/* Application - Mail/Remote */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Services</div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">SSH</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.ssh}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">FTP</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.ftp}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">SMTP</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.smtp}</span>
                          </div>
                        </div>
                      </div>

                      {/* Telnet/Other */}
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Other</div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Telnet</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.telnet}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Other</span>
                            <span className="font-mono text-gray-900 dark:text-gray-100">{preAnalysis.protocols.other}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Ports */}
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Top Source Ports */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Top Source Ports
                      </div>
                      <div className="max-h-40 overflow-auto">
                        {preAnalysis.port_stats.top_src_ports.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">None</div>
                        ) : (
                          <table className="w-full text-sm">
                            <tbody>
                              {preAnalysis.port_stats.top_src_ports.map(([port, count]) => (
                                <tr key={port} className="border-t border-gray-100 dark:border-gray-700">
                                  <td className="px-3 py-1 font-mono text-gray-900 dark:text-gray-100">{port}</td>
                                  <td className="px-3 py-1 text-gray-500 dark:text-gray-400 text-right">{count} pkts</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* Top Destination Ports */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Top Destination Ports
                      </div>
                      <div className="max-h-40 overflow-auto">
                        {preAnalysis.port_stats.top_dst_ports.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">None</div>
                        ) : (
                          <table className="w-full text-sm">
                            <tbody>
                              {preAnalysis.port_stats.top_dst_ports.map(([port, count]) => (
                                <tr key={port} className="border-t border-gray-100 dark:border-gray-700">
                                  <td className="px-3 py-1 font-mono text-gray-900 dark:text-gray-100">{port}</td>
                                  <td className="px-3 py-1 text-gray-500 dark:text-gray-400 text-right">{count} pkts</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Unique Addresses */}
                  <div className="grid md:grid-cols-3 gap-4">
                    {/* IPv4 Addresses */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        IPv4 Addresses ({preAnalysis.unique_ipv4.length})
                      </div>
                      <div className="max-h-32 overflow-auto">
                        {preAnalysis.unique_ipv4.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">None</div>
                        ) : (
                          <div className="p-2 text-xs font-mono text-gray-700 dark:text-gray-300 space-y-0.5">
                            {preAnalysis.unique_ipv4.map(ip => (
                              <div key={ip}>{ip}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* IPv6 Addresses */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        IPv6 Addresses ({preAnalysis.unique_ipv6.length})
                      </div>
                      <div className="max-h-32 overflow-auto">
                        {preAnalysis.unique_ipv6.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">None</div>
                        ) : (
                          <div className="p-2 text-xs font-mono text-gray-700 dark:text-gray-300 space-y-0.5 break-all">
                            {preAnalysis.unique_ipv6.map(ip => (
                              <div key={ip}>{ip}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* MAC Addresses */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        MAC Addresses ({preAnalysis.unique_mac.length})
                      </div>
                      <div className="max-h-32 overflow-auto">
                        {preAnalysis.unique_mac.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 dark:text-gray-400 italic">None</div>
                        ) : (
                          <div className="p-2 text-xs font-mono text-gray-700 dark:text-gray-300 space-y-0.5">
                            {preAnalysis.unique_mac.map(mac => (
                              <div key={mac}>{mac}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

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

                      {/* DNS Anonymization */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={anonymizeDns}
                            onChange={(e) => {
                              setAnonymizeDns(e.target.checked)
                              setTimeout(reanalyze, 0)
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Anonymize DNS</span>
                        </label>
                        <p className="text-xs text-gray-500 ml-6">Replace domain names with anonXXXXX.example.com</p>
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
                      <div className="space-y-2">
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
                        <p className="text-xs text-gray-500">Shift all timestamps by N seconds</p>
                      </div>

                      {/* Break Checksums */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer" title="Set all checksums to 0xFFFF instead of recalculating them">
                          <input
                            type="checkbox"
                            checked={breakChecksums}
                            onChange={(e) => {
                              setBreakChecksums(e.target.checked)
                              setTimeout(reanalyze, 0)
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Break Checksums</span>
                        </label>
                        <p className="text-xs text-gray-500 ml-6">Some tools expect invalid checksums for anonymized data</p>
                      </div>
                    </div>
                  </div>

                  {/* Protocol Scrubbing */}
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Protocol Scrubbing</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* TLS SNI */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer" title="Anonymize Server Name Indication in TLS ClientHello (reveals visited domains)">
                          <input
                            type="checkbox"
                            checked={scrubTlsSni}
                            onChange={(e) => {
                              setScrubTlsSni(e.target.checked)
                              setTimeout(reanalyze, 0)
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Scrub TLS SNI</span>
                          {preAnalysis && preAnalysis.protocols.tls_client_hello > 0 && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded">
                              {preAnalysis.protocols.tls_client_hello}
                            </span>
                          )}
                        </label>
                        <p className="text-xs text-gray-500 ml-6">Anonymize server names in HTTPS</p>
                      </div>

                      {/* HTTP Headers */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer" title="Redact Cookie, Authorization, Host, Referer headers">
                          <input
                            type="checkbox"
                            checked={scrubHttpHeaders}
                            onChange={(e) => {
                              setScrubHttpHeaders(e.target.checked)
                              setTimeout(reanalyze, 0)
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Scrub HTTP Headers</span>
                          {preAnalysis && preAnalysis.protocols.http > 0 && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded">
                              {preAnalysis.protocols.http}
                            </span>
                          )}
                        </label>
                        <p className="text-xs text-gray-500 ml-6">Redact cookies, auth, host</p>
                      </div>

                      {/* DHCP */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer" title="Anonymize DHCP hostname options and client identifiers">
                          <input
                            type="checkbox"
                            checked={anonymizeDhcp}
                            onChange={(e) => {
                              setAnonymizeDhcp(e.target.checked)
                              setTimeout(reanalyze, 0)
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Anonymize DHCP</span>
                          {preAnalysis && preAnalysis.protocols.dhcp > 0 && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded">
                              {preAnalysis.protocols.dhcp}
                            </span>
                          )}
                        </label>
                        <p className="text-xs text-gray-500 ml-6">Hostnames, client identifiers</p>
                      </div>

                      {/* NetBIOS/SMB */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer" title="Scrub NetBIOS/SMB computer names, usernames, and share names (ports 137-139, 445)">
                          <input
                            type="checkbox"
                            checked={scrubNetbiosSmb}
                            onChange={(e) => {
                              setScrubNetbiosSmb(e.target.checked)
                              setTimeout(reanalyze, 0)
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Scrub NetBIOS/SMB</span>
                          {preAnalysis && (preAnalysis.protocols.netbios > 0 || preAnalysis.protocols.smb > 0) && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded">
                              {preAnalysis.protocols.netbios + preAnalysis.protocols.smb}
                            </span>
                          )}
                        </label>
                        <p className="text-xs text-gray-500 ml-6">Computer names, usernames, shares</p>
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
                    {analysis.stats.arp_packets_anonymized > 0 && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                          {analysis.stats.arp_packets_anonymized}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">ARP</div>
                      </div>
                    )}
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
                    {analysis.stats.dns_names_anonymized > 0 && (
                      <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                          {analysis.stats.dns_names_anonymized}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">DNS Names</div>
                      </div>
                    )}
                    {analysis.stats.tls_sni_scrubbed > 0 && (
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                          {analysis.stats.tls_sni_scrubbed}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">TLS SNI</div>
                      </div>
                    )}
                    {analysis.stats.http_headers_scrubbed > 0 && (
                      <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-sky-600 dark:text-sky-400">
                          {analysis.stats.http_headers_scrubbed}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">HTTP Headers</div>
                      </div>
                    )}
                    {analysis.stats.dhcp_options_anonymized > 0 && (
                      <div className="bg-lime-50 dark:bg-lime-900/20 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-lime-600 dark:text-lime-400">
                          {analysis.stats.dhcp_options_anonymized}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">DHCP</div>
                      </div>
                    )}
                    {analysis.stats.netbios_smb_scrubbed > 0 && (
                      <div className="bg-fuchsia-50 dark:bg-fuchsia-900/20 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-fuchsia-600 dark:text-fuchsia-400">
                          {analysis.stats.netbios_smb_scrubbed}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">NetBIOS/SMB</div>
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

                    {/* Domains */}
                    {Object.keys(analysis.mappings.domains).length > 0 && (
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden md:col-span-2">
                        <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          Domains ({Object.keys(analysis.mappings.domains).length})
                        </div>
                        <div className="max-h-40 overflow-auto">
                          <table className="w-full text-xs">
                            <tbody>
                              {Object.entries(analysis.mappings.domains).map(([orig, anon]) => (
                                <tr key={orig} className="border-t border-gray-100 dark:border-gray-700">
                                  <td className="px-2 py-1 font-mono text-red-600 dark:text-red-400 break-all">{orig}</td>
                                  <td className="text-gray-400">→</td>
                                  <td className="px-2 py-1 font-mono text-green-600 dark:text-green-400">{anon}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
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

                  {/* Wireshark Display Filter */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Wireshark Display Filter
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={wiresharkFilter}
                        onChange={(e) => setWiresharkFilter(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && parseWiresharkFilter(wiresharkFilter)}
                        placeholder="e.g., tcp.port == 443 and ip.addr == 192.168.1.1"
                        className={`flex-1 px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-mono ${
                          wiresharkFilterError
                            ? 'border-red-300 dark:border-red-700'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      />
                      <button
                        onClick={() => parseWiresharkFilter(wiresharkFilter)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                        title="Parse Wireshark filter and apply to fields below"
                      >
                        Apply
                      </button>
                    </div>
                    {wiresharkFilterError ? (
                      <p className="text-xs text-red-600 dark:text-red-400">{wiresharkFilterError}</p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Supports: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">tcp</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">udp</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">ip.addr == X</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">tcp.port == X</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">and</code>/<code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">or</code>
                      </p>
                    )}
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700" />

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

              {/* Compare Tab */}
              {activeTab === 'compare' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Side-by-side comparison showing parsed packet layers (like Wireshark) with original vs anonymized values.
                    </p>
                  </div>

                  {isLoadingComparison ? (
                    <div className="flex items-center justify-center py-12">
                      <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="ml-3 text-gray-600 dark:text-gray-400">Loading packet comparison...</span>
                    </div>
                  ) : comparisons.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <p>No packet comparison data available.</p>
                      <button
                        onClick={loadComparison}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Load Comparison
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Showing {comparisons.length} packets (max 100)
                        </span>
                        <button
                          onClick={loadComparison}
                          className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                          Refresh
                        </button>
                      </div>

                      {comparisons.map((pkt) => (
                        <details
                          key={pkt.index}
                          className={`border rounded-lg overflow-hidden ${
                            pkt.changed
                              ? 'border-yellow-300 dark:border-yellow-700'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <summary className={`px-3 py-2 flex items-center gap-3 cursor-pointer select-none ${
                            pkt.changed
                              ? 'bg-yellow-100 dark:bg-yellow-900/30'
                              : 'bg-gray-100 dark:bg-gray-700'
                          }`}>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              #{pkt.index + 1}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                              {pkt.original_parsed?.total_length ?? 0} bytes • {pkt.summary}
                            </span>
                            {pkt.changed && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded">
                                Modified
                              </span>
                            )}
                          </summary>
                          <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                            {/* Original Packet */}
                            <div className="p-3 space-y-2">
                              <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">Original</div>

                              {/* Ethernet Layer */}
                              {pkt.original_parsed?.ethernet && (
                                <details open className="text-xs">
                                  <summary className="font-medium text-purple-700 dark:text-purple-400 cursor-pointer">
                                    Ethernet II ({pkt.original_parsed.ethernet.ethertype})
                                  </summary>
                                  <div className="ml-4 mt-1 space-y-0.5 font-mono text-gray-600 dark:text-gray-400">
                                    <div>Src: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.ethernet.src_mac}</span></div>
                                    <div>Dst: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.ethernet.dst_mac}</span></div>
                                    <div>Type: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.ethernet.ethertype} (0x{pkt.original_parsed.ethernet.ethertype_raw.toString(16).padStart(4, '0')})</span></div>
                                  </div>
                                </details>
                              )}

                              {/* IP Layer */}
                              {pkt.original_parsed?.ip && (
                                <details open className="text-xs">
                                  <summary className="font-medium text-blue-700 dark:text-blue-400 cursor-pointer">
                                    {pkt.original_parsed.ip.version === 4 ? 'IPv4' : 'IPv6'} ({pkt.original_parsed.ip.protocol})
                                  </summary>
                                  <div className="ml-4 mt-1 space-y-0.5 font-mono text-gray-600 dark:text-gray-400">
                                    <div>Src: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.ip.src_ip}</span></div>
                                    <div>Dst: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.ip.dst_ip}</span></div>
                                    <div>TTL: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.ip.ttl}</span>, Len: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.ip.length}</span></div>
                                  </div>
                                </details>
                              )}

                              {/* Transport Layer */}
                              {pkt.original_parsed?.transport && (
                                <details open className="text-xs">
                                  <summary className="font-medium text-green-700 dark:text-green-400 cursor-pointer">
                                    {pkt.original_parsed.transport.protocol}
                                  </summary>
                                  <div className="ml-4 mt-1 space-y-0.5 font-mono text-gray-600 dark:text-gray-400">
                                    <div>Src Port: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.transport.src_port}</span></div>
                                    <div>Dst Port: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.transport.dst_port}</span></div>
                                    {pkt.original_parsed.transport.flags && (
                                      <div>Flags: <span className="text-gray-900 dark:text-gray-100">[{pkt.original_parsed.transport.flags}]</span></div>
                                    )}
                                    {pkt.original_parsed.transport.seq !== undefined && (
                                      <div>Seq: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.transport.seq}</span></div>
                                    )}
                                    <div>Payload: <span className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.transport.length} bytes</span></div>
                                  </div>
                                </details>
                              )}

                              {/* Application Layer */}
                              {pkt.original_parsed?.application && (
                                <details open className="text-xs">
                                  <summary className="font-medium text-orange-700 dark:text-orange-400 cursor-pointer">
                                    {pkt.original_parsed.application.protocol}
                                  </summary>
                                  <div className="ml-4 mt-1 font-mono text-gray-600 dark:text-gray-400">
                                    {pkt.original_parsed.application.info && (
                                      <div className="text-gray-900 dark:text-gray-100">{pkt.original_parsed.application.info}</div>
                                    )}
                                  </div>
                                </details>
                              )}

                              {/* Payload Preview */}
                              {pkt.original_parsed?.payload_preview && (
                                <details className="text-xs">
                                  <summary className="font-medium text-gray-500 dark:text-gray-500 cursor-pointer">
                                    Payload Preview
                                  </summary>
                                  <div className="ml-4 mt-1 font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                                    {pkt.original_parsed.payload_preview}
                                  </div>
                                </details>
                              )}
                            </div>

                            {/* Modified Packet */}
                            <div className="p-3 space-y-2">
                              <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">Anonymized</div>

                              {/* Ethernet Layer */}
                              {pkt.modified_parsed?.ethernet && (
                                <details open className="text-xs">
                                  <summary className="font-medium text-purple-700 dark:text-purple-400 cursor-pointer">
                                    Ethernet II ({pkt.modified_parsed.ethernet.ethertype})
                                  </summary>
                                  <div className="ml-4 mt-1 space-y-0.5 font-mono text-gray-600 dark:text-gray-400">
                                    <div>Src: <span className={pkt.original_parsed?.ethernet?.src_mac !== pkt.modified_parsed.ethernet.src_mac ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}>{pkt.modified_parsed.ethernet.src_mac}</span></div>
                                    <div>Dst: <span className={pkt.original_parsed?.ethernet?.dst_mac !== pkt.modified_parsed.ethernet.dst_mac ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}>{pkt.modified_parsed.ethernet.dst_mac}</span></div>
                                    <div>Type: <span className="text-gray-900 dark:text-gray-100">{pkt.modified_parsed.ethernet.ethertype}</span></div>
                                  </div>
                                </details>
                              )}

                              {/* IP Layer */}
                              {pkt.modified_parsed?.ip && (
                                <details open className="text-xs">
                                  <summary className="font-medium text-blue-700 dark:text-blue-400 cursor-pointer">
                                    {pkt.modified_parsed.ip.version === 4 ? 'IPv4' : 'IPv6'} ({pkt.modified_parsed.ip.protocol})
                                  </summary>
                                  <div className="ml-4 mt-1 space-y-0.5 font-mono text-gray-600 dark:text-gray-400">
                                    <div>Src: <span className={pkt.original_parsed?.ip?.src_ip !== pkt.modified_parsed.ip.src_ip ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}>{pkt.modified_parsed.ip.src_ip}</span></div>
                                    <div>Dst: <span className={pkt.original_parsed?.ip?.dst_ip !== pkt.modified_parsed.ip.dst_ip ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}>{pkt.modified_parsed.ip.dst_ip}</span></div>
                                    <div>TTL: <span className="text-gray-900 dark:text-gray-100">{pkt.modified_parsed.ip.ttl}</span>, Len: <span className="text-gray-900 dark:text-gray-100">{pkt.modified_parsed.ip.length}</span></div>
                                  </div>
                                </details>
                              )}

                              {/* Transport Layer */}
                              {pkt.modified_parsed?.transport && (
                                <details open className="text-xs">
                                  <summary className="font-medium text-green-700 dark:text-green-400 cursor-pointer">
                                    {pkt.modified_parsed.transport.protocol}
                                  </summary>
                                  <div className="ml-4 mt-1 space-y-0.5 font-mono text-gray-600 dark:text-gray-400">
                                    <div>Src Port: <span className={pkt.original_parsed?.transport?.src_port !== pkt.modified_parsed.transport.src_port ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}>{pkt.modified_parsed.transport.src_port}</span></div>
                                    <div>Dst Port: <span className={pkt.original_parsed?.transport?.dst_port !== pkt.modified_parsed.transport.dst_port ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}>{pkt.modified_parsed.transport.dst_port}</span></div>
                                    {pkt.modified_parsed.transport.flags && (
                                      <div>Flags: <span className="text-gray-900 dark:text-gray-100">[{pkt.modified_parsed.transport.flags}]</span></div>
                                    )}
                                    {pkt.modified_parsed.transport.seq !== undefined && (
                                      <div>Seq: <span className="text-gray-900 dark:text-gray-100">{pkt.modified_parsed.transport.seq}</span></div>
                                    )}
                                    <div>Payload: <span className="text-gray-900 dark:text-gray-100">{pkt.modified_parsed.transport.length} bytes</span></div>
                                  </div>
                                </details>
                              )}

                              {/* Application Layer */}
                              {pkt.modified_parsed?.application && (
                                <details open className="text-xs">
                                  <summary className="font-medium text-orange-700 dark:text-orange-400 cursor-pointer">
                                    {pkt.modified_parsed.application.protocol}
                                  </summary>
                                  <div className="ml-4 mt-1 font-mono text-gray-600 dark:text-gray-400">
                                    {pkt.modified_parsed.application.info && (
                                      <div className={pkt.original_parsed?.application?.info !== pkt.modified_parsed.application.info ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}>{pkt.modified_parsed.application.info}</div>
                                    )}
                                  </div>
                                </details>
                              )}

                              {/* Payload Preview */}
                              {pkt.modified_parsed?.payload_preview && (
                                <details className="text-xs">
                                  <summary className="font-medium text-gray-500 dark:text-gray-500 cursor-pointer">
                                    Payload Preview
                                  </summary>
                                  <div className="ml-4 mt-1 font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
                                    {pkt.modified_parsed.payload_preview}
                                  </div>
                                </details>
                              )}
                            </div>
                          </div>

                          {/* Hex view (collapsed by default) */}
                          <details className="border-t border-gray-200 dark:border-gray-700">
                            <summary className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer bg-gray-50 dark:bg-gray-800">
                              Raw Hex View
                            </summary>
                            <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                              <div className="p-3">
                                <div className="font-mono text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                                  <div className="text-red-600 dark:text-red-400 whitespace-pre">{pkt.original_hex}</div>
                                  <div className="text-gray-500 dark:text-gray-500 mt-1 whitespace-pre border-t border-gray-200 dark:border-gray-700 pt-1">{pkt.original_ascii}</div>
                                </div>
                              </div>
                              <div className="p-3">
                                <div className="font-mono text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                                  <div className="text-green-600 dark:text-green-400 whitespace-pre">{pkt.modified_hex}</div>
                                  <div className="text-gray-500 dark:text-gray-500 mt-1 whitespace-pre border-t border-gray-200 dark:border-gray-700 pt-1">{pkt.modified_ascii}</div>
                                </div>
                              </div>
                            </div>
                          </details>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Search Tab */}
              {activeTab === 'search' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Search for content within packet payloads. Matches are shown with context.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Enter search term (e.g., password, GET /api, 192.168)"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                    <button
                      onClick={handleSearch}
                      disabled={isSearching || !searchTerm.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isSearching && (
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      )}
                      Search
                    </button>
                  </div>

                  {searchResults.length > 0 ? (
                    <div className="space-y-3">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Found {searchResults.length} matches (max 50 shown)
                      </div>

                      {searchResults.map((result, idx) => (
                        <div
                          key={`${result.packet_index}-${result.offset}-${idx}`}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                        >
                          <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2 flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Packet #{result.packet_index + 1} @ offset {result.offset}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {result.summary}
                            </span>
                          </div>
                          <div className="p-3">
                            <div className="font-mono text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto whitespace-pre">
                              {result.context}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : searchTerm.trim() && !isSearching ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No matches found for "{searchTerm}"
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      Enter a search term to find content in packet payloads
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDownloadMapping}
              disabled={!analysis || isProcessing}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download a human-readable text report with all statistics and address mappings"
            >
              Export Report
            </button>
            <button
              onClick={handleExportMappingsJson}
              disabled={!analysis || isProcessing}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export address mappings as JSON - use this to apply the same anonymization to related PCAP files"
            >
              Export JSON
            </button>
            <label
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer"
              title="Import a previously exported JSON mapping file to apply consistent anonymization across files"
            >
              Import JSON
              <input
                type="file"
                accept=".json"
                onChange={handleImportMappings}
                className="hidden"
              />
            </label>
            {importedMappings && (
              <button
                onClick={handleClearMappings}
                className="px-3 py-2 text-sm font-medium text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50"
                title="Remove imported mappings and use fresh anonymization"
              >
                Clear Import
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              title="Close without downloading"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={!analysis || isProcessing}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              title="Apply all selected anonymization options and download the modified PCAP file"
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
