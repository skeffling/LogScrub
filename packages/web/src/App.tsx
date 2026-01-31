import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Header } from './components/Header'
import { Editor } from './components/Editor'
import { SidebarPanel } from './components/SidebarPanel'
import { AboutModal } from './components/AboutModal'
import { DmesgTimestampModal } from './components/DmesgTimestampModal'
import { SipTraceModal } from './components/SipTraceModal'
import { EmailHopsModal } from './components/EmailHopsModal'
import { SpamReportModal, detectSpamReports } from './components/SpamReportModal'
import { GpxTransposeModal, isGpxFile } from './components/GpxTransposeModal'
import { BUILTIN_PRESETS } from './data/presets'
import { Suggestions } from './components/Suggestions'
import { Stats } from './components/Stats'
import { Modal } from './components/Modal'
import { FeatureBanner } from './components/FeatureBanner'
import { Icon, ToggleButton } from './components/ui'
import { useAppStore } from './stores/useAppStore'
import init, { compress_zip, compress_gzip } from './wasm-core/wasm_core'

let wasmReady: Promise<unknown> | null = null
async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = init()
  }
  await wasmReady
}

const LINE_HEIGHT = 20

interface FullscreenVirtualListProps {
  lines: string[]
  lineNumbers?: number[]
  changedLines: Set<number>
  highlightLine: (line: string) => React.ReactNode
  scrollRef: React.MutableRefObject<HTMLDivElement | null>
}

function FullscreenVirtualList({ lines, lineNumbers, changedLines, highlightLine, scrollRef }: FullscreenVirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef && parentRef.current) {
      scrollRef.current = parentRef.current
    }
  }, [scrollRef])

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 20,
  })

  return (
    <div ref={parentRef} className="flex-1 overflow-auto bg-white dark:bg-gray-900">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        <div
          className="inline-flex min-w-full absolute top-0 left-0"
          style={{
            transform: `translateY(${virtualizer.getVirtualItems()[0]?.start ?? 0}px)`,
          }}
        >
          <div className="flex-shrink-0 sticky left-0 z-10 bg-gray-100 dark:bg-gray-800 text-right select-none border-r dark:border-gray-700">
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const lineNum = lineNumbers ? lineNumbers[virtualRow.index] : virtualRow.index
              const hasChange = changedLines.has(lineNum)
              return (
                <div
                  key={virtualRow.key}
                  className={`px-3 font-mono text-sm h-5 flex items-center justify-end ${
                    hasChange ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {lineNum + 1}
                </div>
              )
            })}
          </div>
          <div className="p-2">
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                className="font-mono text-sm whitespace-pre text-gray-900 dark:text-gray-100 h-5"
              >
                {highlightLine(lines[virtualRow.index])}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function loadUiPreference<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(`logscrub_${key}`)
    if (stored !== null) return JSON.parse(stored) as T
  } catch {}
  return defaultValue
}

function saveUiPreference<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`logscrub_${key}`, JSON.stringify(value))
  } catch {}
}

function App() {
  const {
    input, setInput, output, setOutput, isProcessing, processText, setFileName, fileName,
    processingProgress, cancelProcessing, canCancel,
    analyzeText, isAnalyzing, analysisReplacements, analysisCompleted, clearAnalysis, analysisLogs,
    replacements, syntaxHighlight, setSyntaxHighlight,
    timeShift, setTimeShift,
    setStats, setMatches, setReplacements,
    documentType, lineCountWarning, syntaxError, syntaxValidFormat,
    rules, toggleRule, setRuleStrategy, customRules, addCustomRule
  } = useAppStore()
  const [showRules, setShowRules] = useState(() => loadUiPreference('showRules', true))
  const [rulePanelWidth, setRulePanelWidth] = useState(() => loadUiPreference('rulePanelWidth', 320))
  const [isResizing, setIsResizing] = useState(false)
  const [fullscreenView, setFullscreenView] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [constrainWidth, setConstrainWidth] = useState(() => loadUiPreference('constrainWidth', false))
  const [showDiffHighlight, setShowDiffHighlight] = useState(() => loadUiPreference('showDiffHighlight', true))
  const [goToLineValue, setGoToLineValue] = useState('')
  const [showGoToLine, setShowGoToLine] = useState(false)
  const [syncScroll, setSyncScroll] = useState(() => loadUiPreference('syncScroll', true))
  const [showStats, setShowStats] = useState(false)
  const [showAnalysisLogs, setShowAnalysisLogs] = useState(false)
  const [showDmesgModal, setShowDmesgModal] = useState(false)
  const [dmesgModalDismissed, setDmesgModalDismissed] = useState(false)
  const [showSipModal, setShowSipModal] = useState(false)
  const [sipModalDismissed, setSipModalDismissed] = useState(false)
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(false)
  const [webServerBannerDismissed, setWebServerBannerDismissed] = useState(false)
  const [awsBannerDismissed, setAwsBannerDismissed] = useState(false)
  const [authBannerDismissed, setAuthBannerDismissed] = useState(false)
  const [spamReportBannerDismissed, setSpamReportBannerDismissed] = useState(false)
  const [gpxBannerDismissed, setGpxBannerDismissed] = useState(false)
  const [showEmailHopsModal, setShowEmailHopsModal] = useState(false)
  const [showSpamReportModal, setShowSpamReportModal] = useState(false)
  const [showGpxModal, setShowGpxModal] = useState(false)
  const [gpxTransposedContinent, setGpxTransposedContinent] = useState<string | null>(null)
  const [showTimeShift, setShowTimeShift] = useState(false)
  const [fullscreenHighlight, setFullscreenHighlight] = useState(true)
  const [fullscreenLoading, setFullscreenLoading] = useState(false)
  const [fullscreenGoToLine, setFullscreenGoToLine] = useState(false)
  const [fullscreenGoToLineValue, setFullscreenGoToLineValue] = useState('')
  const [fullscreenLineFilter, setFullscreenLineFilter] = useState<'all' | 'changed' | 'unchanged'>('all')
  const [lineFilter, setLineFilter] = useState<'all' | 'changed' | 'unchanged'>('all')
  const [willStripMetadata, setWillStripMetadata] = useState(false)
  const editorRef = useRef<{ scrollToLine: (line: number) => void } | null>(null)
  const fullscreenScrollRef = useRef<HTMLDivElement | null>(null)

  const openFullscreen = useCallback(() => {
    setFullscreenLoading(true)
    setFullscreenView(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFullscreenLoading(false)
      })
    })
  }, [])

  useEffect(() => { saveUiPreference('showRules', showRules) }, [showRules])
  useEffect(() => { saveUiPreference('rulePanelWidth', rulePanelWidth) }, [rulePanelWidth])
  useEffect(() => { saveUiPreference('constrainWidth', constrainWidth) }, [constrainWidth])
  useEffect(() => { saveUiPreference('showDiffHighlight', showDiffHighlight) }, [showDiffHighlight])
  useEffect(() => { saveUiPreference('syncScroll', syncScroll) }, [syncScroll])

  // Handle panel resize
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(600, e.clientX - 16)) // 16px for padding
      setRulePanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  useEffect(() => {
    if (!input && !output) return
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [input, output])

  useEffect(() => {
    setLineFilter('all')
  }, [input, output])

  useEffect(() => {
    if (fullscreenView) {
      window.history.pushState({ fullscreen: true }, '')
      const handlePopState = () => setFullscreenView(false)
      window.addEventListener('popstate', handlePopState)
      return () => window.removeEventListener('popstate', handlePopState)
    }
  }, [fullscreenView])

  const handleProcess = useCallback(() => {
    if (input.trim() && !isProcessing) {
      processText(input)
      window.umami?.track('sanitize')
    }
  }, [input, isProcessing, processText])

  const handleClear = () => {
    setInput('')
    setOutput('')
    setFileName(null)
    setStats({})
    setMatches({})
    setReplacements([])
    clearAnalysis()
    setGpxTransposedContinent(null)
  }

  const handleDownload = () => {
    if (!output) return
    const blob = new Blob([output], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName ? `sanitized_${fileName}` : 'sanitized_output.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadZip = async () => {
    if (!output) return
    await ensureWasm()
    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'sanitized_output'
    const zipData = compress_zip(output, `${baseName}.txt`)
    const blob = new Blob([zipData], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadGzip = async () => {
    if (!output) return
    await ensureWasm()
    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'sanitized_output'
    const gzipData = compress_gzip(output)
    const blob = new Blob([gzipData], { type: 'application/gzip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}.txt.gz`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleProcess()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && output) {
        e.preventDefault()
        handleDownload()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault()
        setShowGoToLine(true)
      }
      if (e.key === 'Escape') {
        if (isProcessing && canCancel) {
          cancelProcessing()
        }
        if (showGoToLine) {
          setShowGoToLine(false)
          setGoToLineValue('')
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleProcess, output, isProcessing, canCancel, cancelProcessing, showGoToLine])

  const inputLines = useMemo(() => input.split('\n'), [input])
  const fullscreenLines = useMemo(() => output.split('\n'), [output])

  const hasTimestamps = useMemo(() => {
    if (!input || input.length < 10) return false
    const sample = input.slice(0, 5000)
    const patterns = [
      /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/,
      /\d{4}-\d{2}-\d{2}/,
      /\[[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4}\]/,
      /\[\d{1,2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}/,
      /\d{1,2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}/,
      /[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/,
    ]
    return patterns.some(pattern => pattern.test(sample))
  }, [input])

  // Detect dmesg relative timestamp format: [seconds.microseconds]
  const dmesgDetection = useMemo(() => {
    if (!input || input.length < 20) return { detected: false, firstLine: '' }
    const sample = input.slice(0, 5000)
    // Match dmesg format: [123456.123456] followed by typical kernel log content
    // Must have multiple matches to confirm it's actually dmesg output
    const dmesgPattern = /^\[\s*\d+\.\d{6}\]\s+\S/m
    const matches = sample.match(/\[\s*\d+\.\d{6}\]/g)
    const detected = dmesgPattern.test(sample) && matches && matches.length >= 2

    // Extract the first dmesg line
    let firstLine = ''
    if (detected) {
      const lineMatch = sample.match(/^\[\s*\d+\.\d{6}\].*$/m)
      if (lineMatch) {
        firstLine = lineMatch[0]
      }
    }

    return { detected, firstLine }
  }, [input])

  const hasDmesgTimestamps = dmesgDetection.detected

  // Show dmesg timestamp modal when detected
  useEffect(() => {
    if (hasDmesgTimestamps && input && !dmesgModalDismissed) {
      setShowDmesgModal(true)
    }
  }, [hasDmesgTimestamps, input, dmesgModalDismissed])

  // Reset dmesg modal dismissed state when a new file is loaded
  useEffect(() => {
    setDmesgModalDismissed(false)
  }, [fileName])

  // Detect SIP protocol traces: INVITE sip: or REGISTER sip: at line start
  const sipDetection = useMemo(() => {
    if (!input || input.length < 20) return { detected: false, firstLine: '' }
    const sample = input.slice(0, 10000)
    // Match SIP request lines at start of line (usually after a timestamp)
    const sipPattern = /^.*?(?:INVITE|REGISTER|OPTIONS|ACK|BYE|CANCEL|SUBSCRIBE|NOTIFY|REFER|MESSAGE|UPDATE|PRACK|INFO)\s+sip:/mi
    const detected = sipPattern.test(sample)

    let firstLine = ''
    if (detected) {
      const lineMatch = sample.match(/^.*?(?:INVITE|REGISTER|OPTIONS|ACK|BYE|CANCEL)\s+sip:[^\r\n]*/mi)
      if (lineMatch) {
        firstLine = lineMatch[0].trim()
      }
    }

    return { detected, firstLine }
  }, [input])

  const hasSipTrace = sipDetection.detected

  // Reset SIP modal dismissed state when a new file is loaded
  useEffect(() => {
    setSipModalDismissed(false)
  }, [fileName])

  // Reset log format banner dismissed states when input changes
  useEffect(() => {
    setEmailBannerDismissed(false)
    setWebServerBannerDismissed(false)
    setAwsBannerDismissed(false)
    setAuthBannerDismissed(false)
    setSpamReportBannerDismissed(false)
    setGpxBannerDismissed(false)
  }, [input])

  // Detect email headers (multiple Received: headers indicate email)
  const emailHeadersDetected = useMemo(() => {
    if (!input || input.length < 50) return false
    const sample = input.slice(0, 15000)
    // Look for at least 2 Received: headers, which indicates email routing
    const receivedMatches = sample.match(/^Received:\s/gim)
    return receivedMatches && receivedMatches.length >= 2
  }, [input])

  // Detect Apache/Nginx access logs (CLF format with HTTP method)
  const webServerLogsDetected = useMemo(() => {
    if (!input || input.length < 50) return false
    const sample = input.slice(0, 10000)
    // Look for Common Log Format: IP - - [timestamp] "METHOD /path HTTP/x.x" status size
    const clfPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s+-\s+-?\s*\[.+?\]\s+"(?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)\s/m
    // Also check for nginx combined format
    const combinedPattern = /"\s+\d{3}\s+\d+\s+"[^"]*"\s+"[^"]*"$/m
    return clfPattern.test(sample) || (sample.includes('" 200 ') && combinedPattern.test(sample))
  }, [input])

  // Detect AWS CloudTrail/CloudWatch logs
  const awsLogsDetected = useMemo(() => {
    if (!input || input.length < 50) return false
    const sample = input.slice(0, 15000)
    // CloudTrail JSON format
    const cloudTrailPattern = /"eventSource":\s*"[a-z0-9.-]+\.amazonaws\.com"|"eventName":\s*"|"awsRegion":\s*"/
    // CloudWatch Logs Insights or standard format with AWS ARNs
    const arnPattern = /arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{12}:/
    return cloudTrailPattern.test(sample) || (arnPattern.test(sample) && sample.includes('aws'))
  }, [input])

  // Detect SSH/Auth logs (syslog format with auth messages)
  const authLogsDetected = useMemo(() => {
    if (!input || input.length < 50) return false
    const sample = input.slice(0, 15000)
    // Look for sshd, sudo, su, or pam messages
    const authPatterns = [
      /sshd\[\d+\]:/,
      /sudo:\s+\w+\s*:/,
      /su\[\d+\]:/,
      /pam_unix\([^)]+\):/,
      /Failed password for/i,
      /Accepted (?:password|publickey) for/i,
      /authentication failure/i,
    ]
    const matches = authPatterns.filter(p => p.test(sample))
    return matches.length >= 2  // Need at least 2 different auth patterns
  }, [input])

  // Detect spam reports (rspamd or SpamAssassin format)
  const spamReportsDetected = useMemo(() => {
    if (!input || input.length < 50) return []
    return detectSpamReports(input)
  }, [input])

  // Detect GPX files
  const gpxDetected = useMemo(() => {
    if (!input || input.length < 50) return false
    return isGpxFile(fileName || '', input)
  }, [input, fileName])

  // Handle GPX transposition
  const handleGpxTranspose = useCallback((transposedGpx: string, continent: string) => {
    // Put the transposed GPX in the output pane
    setOutput(transposedGpx)
    // Clear any previous replacements since this is a coordinate shift, not PII scrubbing
    setReplacements([])
    clearAnalysis()
    // Track that GPX was transposed for UI feedback
    setGpxTransposedContinent(continent)
    // Update filename to indicate transposition
    if (fileName) {
      const baseName = fileName.replace(/\.gpx$/i, '')
      setFileName(`${baseName}-transposed-${continent.toLowerCase().replace(/\s+/g, '-')}.gpx`)
    }
  }, [fileName, clearAnalysis])

  // Function to load a preset by ID and re-run analysis
  const loadPresetById = useCallback((presetId: string) => {
    const preset = BUILTIN_PRESETS.find(p => p.id === presetId)
    if (!preset) return

    // Disable all rules first
    Object.keys(rules).forEach(id => {
      if (rules[id].enabled) {
        toggleRule(id)
      }
    })

    // Enable rules from the preset
    Object.entries(preset.rules).forEach(([id, updates]) => {
      if (rules[id] && updates) {
        if (updates.enabled && !rules[id].enabled) {
          toggleRule(id)
        }
        if (updates.strategy && rules[id].strategy !== updates.strategy) {
          setRuleStrategy(id, updates.strategy)
        }
      }
    })

    // Add any custom rules from preset
    if (preset.customRules && preset.customRules.length > 0) {
      preset.customRules.forEach(cr => {
        const existingIdx = customRules.findIndex(r => r.id === cr.id)
        if (existingIdx === -1) {
          addCustomRule({ ...cr, id: `preset_${cr.id}_${Date.now()}` })
        }
      })
    }

    // Re-run analysis with the new preset after a short delay to ensure state updates
    setTimeout(() => {
      if (input.trim()) {
        analyzeText(input)
      }
    }, 100)
  }, [rules, toggleRule, setRuleStrategy, customRules, addCustomRule, input, analyzeText])

  // Shortcut for SIP preset (used by SipTraceModal)
  const loadSipPreset = useCallback(() => loadPresetById('sip-voip'), [loadPresetById])

  // Show SIP modal when analysis completes and SIP trace is detected
  useEffect(() => {
    if (analysisCompleted && hasSipTrace && !sipModalDismissed) {
      setShowSipModal(true)
    }
  }, [analysisCompleted, hasSipTrace, sipModalDismissed])

  const lineOffsets = useMemo(() => {
    const offsets: number[] = []
    let offset = 0
    for (const line of inputLines) {
      offsets.push(offset)
      offset += line.length + 1
    }
    return offsets
  }, [inputLines])

  const changedLinesSet = useMemo(() => {
    const lines = new Set<number>()
    for (const r of replacements) {
      if (r.start >= 0) {
        for (let i = 0; i < lineOffsets.length; i++) {
          const lineStart = lineOffsets[i]
          const lineEnd = i < lineOffsets.length - 1 ? lineOffsets[i + 1] - 1 : Infinity
          if (r.start <= lineEnd && r.end > lineStart) {
            lines.add(i)
          }
        }
      }
    }
    return lines
  }, [replacements, lineOffsets])

  const { filteredFullscreenLines, filteredLineNumbers } = useMemo(() => {
    if (fullscreenLineFilter === 'all' || changedLinesSet.size === 0) {
      return { filteredFullscreenLines: fullscreenLines, filteredLineNumbers: undefined }
    }
    const lineNums: number[] = []
    const lines: string[] = []
    for (let i = 0; i < fullscreenLines.length; i++) {
      const isChanged = changedLinesSet.has(i)
      if ((fullscreenLineFilter === 'changed' && isChanged) ||
          (fullscreenLineFilter === 'unchanged' && !isChanged)) {
        lineNums.push(i)
        lines.push(fullscreenLines[i])
      }
    }
    return { filteredFullscreenLines: lines, filteredLineNumbers: lineNums }
  }, [fullscreenLines, changedLinesSet, fullscreenLineFilter])
  
  const fullscreenReplacementLookup = useMemo(() => {
    const lineOffsets: number[] = []
    let offset = 0
    const lines = input.split('\n')
    for (const l of lines) {
      lineOffsets.push(offset)
      offset += l.length + 1
    }

    const findLineNumber = (position: number): number => {
      for (let i = 0; i < lineOffsets.length; i++) {
        const lineStart = lineOffsets[i]
        const lineEnd = i < lineOffsets.length - 1 ? lineOffsets[i + 1] - 1 : Infinity
        if (position >= lineStart && position <= lineEnd) {
          return i + 1
        }
      }
      return -1
    }

    const lookup = new Map<string, { original: string; type: string; lines: number[] }>()
    for (const rep of replacements) {
      const existing = lookup.get(rep.replacement)
      const lineNum = rep.start >= 0 ? findLineNumber(rep.start) : -1
      if (existing) {
        if (lineNum > 0 && !existing.lines.includes(lineNum)) {
          existing.lines.push(lineNum)
        }
      } else {
        lookup.set(rep.replacement, {
          original: rep.original,
          type: rep.pii_type,
          lines: lineNum > 0 ? [lineNum] : []
        })
      }
    }
    return lookup
  }, [replacements, input])

  const highlightFullscreenLine = useCallback((line: string): React.ReactNode => {
    if (!fullscreenHighlight || replacements.length === 0) return line || ' '

    const parts: React.ReactNode[] = []
    let remaining = line
    let keyIndex = 0
    const patterns = replacements.map(r => ({ pattern: r.replacement, type: r.pii_type }))

    while (remaining.length > 0) {
      let earliestMatch: { index: number; length: number; type: string; pattern: string } | null = null
      for (const p of patterns) {
        const idx = remaining.indexOf(p.pattern)
        if (idx !== -1 && (earliestMatch === null || idx < earliestMatch.index)) {
          earliestMatch = { index: idx, length: p.pattern.length, type: p.type, pattern: p.pattern }
        }
      }
      if (earliestMatch === null) {
        parts.push(<span key={`rest-${keyIndex++}`}>{remaining}</span>)
        break
      }
      if (earliestMatch.index > 0) {
        parts.push(<span key={`text-${keyIndex++}`}>{remaining.slice(0, earliestMatch.index)}</span>)
      }

      const info = fullscreenReplacementLookup.get(earliestMatch.pattern)
      const tooltipLines = [`Type: ${earliestMatch.type}`]
      if (info) {
        tooltipLines.unshift(`Original: ${info.original}`)
        if (info.lines.length > 0) {
          const lineStr = info.lines.length > 5
            ? `${info.lines.slice(0, 5).join(', ')}... (${info.lines.length} total)`
            : info.lines.join(', ')
          tooltipLines.push(`Lines: ${lineStr}`)
        }
      }

      parts.push(
        <span key={`hl-${keyIndex++}`} className="bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-200 rounded px-0.5 cursor-help" title={tooltipLines.join('\n')}>
          {remaining.slice(earliestMatch.index, earliestMatch.index + earliestMatch.length)}
        </span>
      )
      remaining = remaining.slice(earliestMatch.index + earliestMatch.length)
    }
    return parts.length > 0 ? parts : (line || ' ')
  }, [fullscreenHighlight, replacements, fullscreenReplacementLookup])

  if (fullscreenView) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Scrubbed Output {fileName && <span className="text-gray-600 dark:text-gray-400 text-sm" title={fileName}>({fileName.length > 8 ? fileName.slice(0, 8) + '…' : fileName})</span>}
            <span className="ml-2 text-xs text-gray-400">
              ({filteredFullscreenLines.length.toLocaleString()} lines{fullscreenLineFilter !== 'all' && ` of ${fullscreenLines.length.toLocaleString()}`})
            </span>
          </h2>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setFullscreenHighlight(!fullscreenHighlight)}
              className={`text-sm flex items-center gap-1 ${fullscreenHighlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}
              title="Toggle highlighting of replaced values"
            >
              <span className={`w-2 h-2 rounded-full ${fullscreenHighlight ? 'bg-blue-500' : 'bg-gray-400'}`} />
              Diff
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            {changedLinesSet.size > 0 && (
              <>
                <button
                  onClick={() => setFullscreenLineFilter('all')}
                  className={`text-sm ${fullscreenLineFilter === 'all' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  title={`All ${fullscreenLines.length.toLocaleString()} lines (${changedLinesSet.size.toLocaleString()} changed, ${(fullscreenLines.length - changedLinesSet.size).toLocaleString()} unchanged)`}
                >
                  All
                </button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <button
                  onClick={() => setFullscreenLineFilter('changed')}
                  className={`text-sm ${fullscreenLineFilter === 'changed' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  title={`${changedLinesSet.size.toLocaleString()} changed lines`}
                >
                  Changed
                </button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <button
                  onClick={() => setFullscreenLineFilter('unchanged')}
                  className={`text-sm ${fullscreenLineFilter === 'unchanged' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  title={`${(fullscreenLines.length - changedLinesSet.size).toLocaleString()} unchanged lines`}
                >
                  Unchanged
                </button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
              </>
            )}
            {!documentType && (
              <>
                {fullscreenGoToLine ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const line = parseInt(fullscreenGoToLineValue, 10)
                      if (!isNaN(line) && line > 0 && fullscreenScrollRef.current) {
                        fullscreenScrollRef.current.scrollTop = (line - 1) * 20
                      }
                      setFullscreenGoToLine(false)
                      setFullscreenGoToLineValue('')
                    }}
                    className="flex items-center text-sm text-gray-600 dark:text-gray-400"
                  >
                    <span>Line</span>
                    <input
                      type="number"
                      min="1"
                      max={fullscreenLines.length}
                      value={fullscreenGoToLineValue}
                      onChange={(e) => setFullscreenGoToLineValue(e.target.value)}
                      placeholder="#"
                      autoFocus
                      className="w-12 px-1 mx-1 text-sm bg-transparent border-b border-gray-400 dark:border-gray-500 focus:border-blue-500 dark:focus:border-blue-400 outline-none text-gray-700 dark:text-gray-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      onBlur={() => { if (!fullscreenGoToLineValue) setFullscreenGoToLine(false) }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { setFullscreenGoToLine(false); setFullscreenGoToLineValue('') } }}
                    />
                    <button type="submit" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">↵</button>
                  </form>
                ) : (
                  <button
                    onClick={() => setFullscreenGoToLine(true)}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    title="Go to line (⌘G)"
                  >
                    Go to Line
                  </button>
                )}
                <span className="text-gray-300 dark:text-gray-600">|</span>
              </>
            )}
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border dark:border-gray-600 rounded"
              title="Download as plain text"
            >
              .txt
            </button>
            <button
              onClick={handleDownloadZip}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border dark:border-gray-600 rounded"
              title="Download as compressed zip"
            >
              .zip
            </button>
            <button
              onClick={handleDownloadGzip}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border dark:border-gray-600 rounded"
              title="Download as gzip compressed"
            >
              .gz
            </button>
            <button
              onClick={() => { window.history.back() }}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
        {fullscreenLoading ? (
          <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-gray-600 dark:text-gray-400">Loading {fullscreenLines.length.toLocaleString()} lines...</span>
            </div>
          </div>
        ) : (
          <FullscreenVirtualList
            lines={filteredFullscreenLines}
            lineNumbers={filteredLineNumbers}
            changedLines={changedLinesSet}
            highlightLine={highlightFullscreenLine}
            scrollRef={fullscreenScrollRef}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-gray-50 dark:bg-gray-900 lg:overflow-hidden">
      <Header onAboutClick={() => setShowAbout(true)} compact={!!input} />

      <main className={`flex-1 flex flex-col mx-auto px-4 py-4 w-full min-h-0 overflow-auto lg:overflow-hidden ${constrainWidth ? 'max-w-7xl' : ''}`}>
        <FeatureBanner />

        {(isProcessing || isAnalyzing) && processingProgress > 0 && (
          <div className="mb-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600 dark:text-gray-400">{isAnalyzing ? 'Analyzing...' : 'Processing...'}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAnalysisLogs(!showAnalysisLogs); }}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  title="Show analysis logs"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {showAnalysisLogs ? 'Hide' : 'Info'}
                </button>
                <span className="text-xs text-gray-600 dark:text-gray-400">{processingProgress}%</span>
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            {showAnalysisLogs && analysisLogs.length > 0 && (
              <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono max-h-32 overflow-y-auto">
                {analysisLogs.map((log, i) => (
                  <div key={i} className="text-gray-600 dark:text-gray-400">{log}</div>
                ))}
              </div>
            )}
          </div>
        )}
        
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-0 flex-1 min-h-0 lg:overflow-hidden">
          {showRules && (
            <aside className="min-h-0 lg:overflow-hidden flex flex-col flex-shrink-0 relative rule-panel-aside">
              <style>{`
                .rule-panel-aside { width: 100%; }
                @media (min-width: 1024px) { .rule-panel-aside { width: ${rulePanelWidth}px; } }
              `}</style>
              <SidebarPanel />
              {/* Resize handle */}
              <div
                className="hidden lg:block absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setIsResizing(true)
                }}
                title="Drag to resize"
              />
            </aside>
          )}

          <div className={`flex flex-col min-h-0 lg:overflow-hidden flex-1 ${showRules ? 'lg:pl-4' : ''}`}>
            <div className="flex flex-wrap justify-between items-center gap-2 mb-3 flex-shrink-0" role="toolbar" aria-label="Editor controls">
              <div className="flex items-center gap-1 sm:gap-2">
                {/* View Controls */}
                <button
                  onClick={() => setShowRules(!showRules)}
                  className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  title={showRules ? 'Hide the detection rules panel' : 'Show the detection rules panel'}
                  aria-expanded={showRules}
                  aria-controls="rules-panel"
                >
                  <Icon name={showRules ? 'chevron-left' : 'chevron-right'} size="sm" />
                  <span>{showRules ? 'Hide Rules' : 'Show Rules'}</span>
                </button>
                <button
                  onClick={() => setConstrainWidth(!constrainWidth)}
                  className="hidden xl:flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  title={constrainWidth ? 'Use full width' : 'Constrain width'}
                  aria-pressed={constrainWidth}
                >
                  <Icon name={constrainWidth ? 'fullscreen' : 'fullscreen-exit'} size="sm" />
                  <span>{constrainWidth ? 'Expand' : 'Compact'}</span>
                </button>

                {/* Separator */}
                <div className="hidden md:block h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1" aria-hidden="true" />

                {/* Display Options */}
                <div className="hidden md:flex items-center gap-1">
                  <ToggleButton
                    active={showDiffHighlight}
                    disabled={!input.trim()}
                    onClick={() => input.trim() && setShowDiffHighlight(!showDiffHighlight)}
                    title={!input.trim() ? 'Load a log file first' : 'Toggle diff highlighting'}
                  >
                    Diff
                  </ToggleButton>
                  <ToggleButton
                    active={syntaxHighlight}
                    disabled={!input.trim()}
                    onClick={() => input.trim() && setSyntaxHighlight(!syntaxHighlight)}
                    title={!input.trim() ? 'Load a log file first' : 'Toggle syntax highlighting (JSON, XML, SQL)'}
                  >
                    Syntax
                  </ToggleButton>
                </div>
                {/* Navigation Group */}
                {!documentType && (
                  <>
                    <div className="hidden md:block h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1" aria-hidden="true" />
                    <div className="hidden md:flex items-center">
                      {showGoToLine ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            const line = parseInt(goToLineValue, 10)
                            if (!isNaN(line) && line > 0 && editorRef.current) {
                              editorRef.current.scrollToLine(line - 1)
                            }
                            setShowGoToLine(false)
                            setGoToLineValue('')
                          }}
                          className="flex items-center text-sm text-gray-600 dark:text-gray-400"
                        >
                          <span>Line</span>
                          <input
                            type="number"
                            min="1"
                            value={goToLineValue}
                            onChange={(e) => setGoToLineValue(e.target.value)}
                            placeholder="#"
                            autoFocus
                            className="w-12 px-1 mx-1 text-sm bg-transparent border-b border-gray-400 dark:border-gray-500 focus:border-blue-500 dark:focus:border-blue-400 outline-none text-gray-700 dark:text-gray-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            onBlur={() => {
                              if (!goToLineValue) setShowGoToLine(false)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setShowGoToLine(false)
                                setGoToLineValue('')
                              }
                            }}
                          />
                          <button
                            type="submit"
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                            aria-label="Go to line"
                          >
                            ↵
                          </button>
                        </form>
                      ) : (
                        <button
                          onClick={() => input.trim() && setShowGoToLine(true)}
                          disabled={!input.trim()}
                          className={`text-sm px-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            !input.trim()
                              ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                          }`}
                          title={!input.trim() ? 'Load a log file first' : 'Go to line (⌘G)'}
                        >
                          Go to Line
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* Separator */}
                <div className="hidden md:block h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1" aria-hidden="true" />

                {/* Sync & Stats Group */}
                <div className="hidden md:flex items-center gap-1">
                  <ToggleButton
                    active={syncScroll}
                    disabled={!input.trim() || lineFilter !== 'all'}
                    onClick={() => input.trim() && lineFilter === 'all' && setSyncScroll(!syncScroll)}
                    title={!input.trim() ? 'Load a log file first' : lineFilter !== 'all' ? 'Disabled while filtering lines' : 'Sync scrolling between original and sanitized panes'}
                  >
                    Sync Scroll
                  </ToggleButton>

                  <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1" aria-hidden="true" />

                  <button
                    onClick={() => input.trim() && setShowStats(true)}
                    disabled={!input.trim()}
                    className={`flex items-center gap-1 text-sm px-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      !input.trim()
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                    title={!input.trim() ? 'Load a log file first' : 'View detection statistics and download audit reports'}
                  >
                    <Icon name="chart-bar" size="md" />
                    <span>Stats &amp; Map</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {analysisReplacements.length > 0 && !output && (
                  <button
                    onClick={clearAnalysis}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                    title="Clear the analysis preview"
                  >
                    <Icon name="x" size="md" />
                    <span>Clear Preview</span>
                  </button>
                )}
                {analysisReplacements.length === 0 && (
                  <button
                    onClick={() => { analyzeText(input); window.umami?.track('analyze') }}
                    disabled={isAnalyzing || !input.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                    title="Preview what will be detected without scrubbing"
                  >
                    {isAnalyzing ? (
                      <Icon name="spinner" size="md" />
                    ) : (
                      <Icon name="lightbulb" size="md" />
                    )}
                    <span>{isAnalyzing ? 'Analyzing...' : 'Analyze'}</span>
                  </button>
                )}
                {hasTimestamps && (
                  <div className={`relative ${showTimeShift ? 'z-50' : ''}`}>
                    <button
                      onClick={() => setShowTimeShift(!showTimeShift)}
                      className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
                        timeShift.enabled
                          ? 'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 focus-visible:ring-gray-500'
                      }`}
                      title="Shift timestamps to anonymize temporal data"
                    >
                      <Icon name="clock" size="md" />
                      <span>TimeShift</span>
                      {timeShift.enabled && <span className="text-xs">On</span>}
                    </button>
                    {showTimeShift && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowTimeShift(false)} />
                        <div className="absolute right-0 top-full mt-2 p-4 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg z-50 min-w-[280px]">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">Time Shift</span>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={timeShift.enabled}
                                onChange={(e) => setTimeShift({ enabled: e.target.checked })}
                                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                              />
                              <span className="text-xs text-gray-600 dark:text-gray-400">Enable</span>
                            </label>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Mode</label>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setTimeShift({ mode: 'offset' })}
                                  className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                                    timeShift.mode === 'offset'
                                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                                  }`}
                                >
                                  Offset
                                </button>
                                <button
                                  onClick={() => setTimeShift({ mode: 'start' })}
                                  className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                                    timeShift.mode === 'start'
                                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                                  }`}
                                >
                                  Start From
                                </button>
                              </div>
                            </div>

                            {timeShift.mode === 'offset' ? (
                              <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Shift by (hours:minutes)</label>
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="number"
                                    value={timeShift.offsetHours}
                                    onChange={(e) => setTimeShift({ offsetHours: parseInt(e.target.value) || 0 })}
                                    className="w-16 px-2 py-1 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                                    placeholder="0"
                                  />
                                  <span className="text-gray-500">:</span>
                                  <input
                                    type="number"
                                    value={timeShift.offsetMinutes}
                                    onChange={(e) => setTimeShift({ offsetMinutes: parseInt(e.target.value) || 0 })}
                                    min="-59"
                                    max="59"
                                    className="w-16 px-2 py-1 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                                    placeholder="0"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div>
                                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Start Date</label>
                                  <input
                                    type="date"
                                    value={timeShift.startDate}
                                    onChange={(e) => setTimeShift({ startDate: e.target.value })}
                                    className="w-full px-2 py-1 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Start Time</label>
                                  <input
                                    type="time"
                                    value={timeShift.startTime}
                                    onChange={(e) => setTimeShift({ startTime: e.target.value })}
                                    className="w-full px-2 py-1 text-sm border dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white"
                                  />
                                </div>
                              </div>
                            )}

                            <div>
                              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Scope</label>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setTimeShift({ lineOnly: true })}
                                  className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                                    timeShift.lineOnly
                                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                                  }`}
                                  title="Only shift timestamps at line start"
                                >
                                  Line Start
                                </button>
                                <button
                                  onClick={() => setTimeShift({ lineOnly: false })}
                                  className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                                    !timeShift.lineOnly
                                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                                  }`}
                                  title="Shift all timestamps"
                                >
                                  All
                                </button>
                              </div>
                            </div>
                          </div>

                          {timeShift.enabled && (
                            <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300">
                              {timeShift.mode === 'offset' ? (
                                <>Shifting by {timeShift.offsetHours >= 0 ? '+' : ''}{timeShift.offsetHours}h {timeShift.offsetMinutes >= 0 ? '+' : ''}{timeShift.offsetMinutes}m</>
                              ) : (
                                <>First timestamp → {timeShift.startDate || 'not set'} {timeShift.startTime || ''}</>
                              )}
                            </div>
                          )}

                          <button
                            onClick={() => {
                              if (!timeShift.enabled) {
                                setTimeShift({ enabled: true })
                              }
                              setShowTimeShift(false)
                              handleProcess()
                            }}
                            disabled={isProcessing || !input.trim()}
                            className="mt-3 w-full px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Apply TimeShift
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {isProcessing && canCancel ? (
                  <button
                    onClick={cancelProcessing}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                    title="Cancel the current processing operation (Escape)"
                  >
                    <Icon name="x" size="md" />
                    <span>Cancel</span>
                  </button>
                ) : (
                  <button
                    onClick={handleProcess}
                    disabled={isProcessing || !input.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                    title="Apply all enabled detection rules and scrub the input text (⌘/Ctrl+Enter)"
                  >
                    {isProcessing && <Icon name="spinner" size="md" />}
                    <span>{isProcessing ? 'Processing...' : 'Scrub'}</span>
                    <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-xs bg-blue-500 rounded">⌘↵</kbd>
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex-shrink-0">
              <Suggestions />
              {emailHeadersDetected && !emailBannerDismissed && (
                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-3">
                  <Icon name="mail" size="lg" className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <span className="text-blue-800 dark:text-blue-200 text-sm flex-1">
                    Email headers detected with routing information.
                  </span>
                  <button
                    onClick={() => setShowEmailHopsModal(true)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    View Routing
                  </button>
                  <button
                    onClick={() => setEmailBannerDismissed(true)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {webServerLogsDetected && !webServerBannerDismissed && (
                <div className="mb-3 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg flex items-center gap-3">
                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                  <span className="text-purple-800 dark:text-purple-200 text-sm flex-1">
                    Apache/Nginx access logs detected.
                  </span>
                  <button
                    onClick={() => { loadPresetById('nginx-apache'); setWebServerBannerDismissed(true) }}
                    className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                  >
                    Use Web Server Preset
                  </button>
                  <button
                    onClick={() => setWebServerBannerDismissed(true)}
                    className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {awsLogsDetected && !awsBannerDismissed && (
                <div className="mb-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg flex items-center gap-3">
                  <svg className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                  <span className="text-orange-800 dark:text-orange-200 text-sm flex-1">
                    AWS CloudTrail/CloudWatch logs detected.
                  </span>
                  <button
                    onClick={() => { loadPresetById('aws-cloudwatch'); setAwsBannerDismissed(true) }}
                    className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded hover:bg-orange-700"
                  >
                    Use AWS Preset
                  </button>
                  <button
                    onClick={() => setAwsBannerDismissed(true)}
                    className="text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {authLogsDetected && !authBannerDismissed && (
                <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-red-800 dark:text-red-200 text-sm flex-1">
                    SSH/Auth logs detected with authentication events.
                  </span>
                  <button
                    onClick={() => { loadPresetById('auth-logs'); setAuthBannerDismissed(true) }}
                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                  >
                    Use Auth Preset
                  </button>
                  <button
                    onClick={() => setAuthBannerDismissed(true)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {spamReportsDetected.length > 0 && !spamReportBannerDismissed && (
                <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-3">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
                  </svg>
                  <span className="text-amber-800 dark:text-amber-200 text-sm flex-1">
                    {spamReportsDetected.length === 1
                      ? `${spamReportsDetected[0].type === 'rspamd' ? 'Rspamd' : 'SpamAssassin'} report detected (${spamReportsDetected[0].rules.length} rules, score: ${spamReportsDetected[0].totalScore?.toFixed(1) ?? 'N/A'})`
                      : `${spamReportsDetected.length} spam reports detected (${spamReportsDetected.map(r => r.type === 'rspamd' ? 'Rspamd' : 'SpamAssassin').join(' + ')})`
                    }
                  </span>
                  <button
                    onClick={() => setShowSpamReportModal(true)}
                    className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700"
                  >
                    View {spamReportsDetected.length > 1 ? 'Reports' : 'Report'}
                  </button>
                  <button
                    onClick={() => setSpamReportBannerDismissed(true)}
                    className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {gpxDetected && !gpxBannerDismissed && (
                <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  <span className="text-green-800 dark:text-green-200 text-sm flex-1">
                    GPX route file detected. You can transpose this route to a different continent to hide your actual location.
                  </span>
                  <button
                    onClick={() => setShowGpxModal(true)}
                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  >
                    Transpose Route
                  </button>
                  <button
                    onClick={() => setGpxBannerDismissed(true)}
                    className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {analysisCompleted && analysisReplacements.length === 0 && !output && (
                <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-green-800 dark:text-green-200 text-sm">
                    No PII detected.
                  </span>
                  <button
                    onClick={clearAnalysis}
                    className="ml-auto text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {output && replacements.length === 0 && (
                <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-green-800 dark:text-green-200 text-sm">
                    {willStripMetadata
                      ? 'No PII found in text content. Metadata will be removed on download.'
                      : 'No PII found. Output is identical to input.'}
                  </span>
                  <button
                    onClick={() => setOutput('')}
                    className="ml-auto text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex-1 min-h-0 flex flex-col">
              {syntaxError && (
                <div className="mx-4 mb-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg flex items-start gap-2">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1 text-sm">
                    <span className="text-red-800 dark:text-red-200 font-medium">
                      Invalid {syntaxError.format.toUpperCase()} syntax
                    </span>
                    <span className="text-red-700 dark:text-red-300 ml-2">
                      {syntaxError.line && (
                        <button
                          onClick={() => editorRef.current?.scrollToLine(syntaxError.line! - 1)}
                          className="underline hover:text-red-900 dark:hover:text-red-100"
                          title="Go to line"
                        >
                          Line {syntaxError.line}
                        </button>
                      )}
                      {syntaxError.column && `, Col ${syntaxError.column}`}
                      {(syntaxError.line || syntaxError.column) && ': '}
                      {syntaxError.message}
                    </span>
                  </div>
                </div>
              )}
              {lineCountWarning && (
                <div className="mx-4 mb-2 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg flex items-start gap-2">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-amber-800 dark:text-amber-200 text-sm">{lineCountWarning}</span>
                </div>
              )}
              <Editor
                ref={editorRef}
                input={input}
                output={output}
                onInputChange={setInput}
                onView={openFullscreen}
                showDiff={showDiffHighlight}
                syncScroll={syncScroll}
                lineFilter={lineFilter}
                onLineFilterChange={setLineFilter}
                onClearAll={handleClear}
                onLeftResize={() => setIsResizing(true)}
                showLeftHandle={showRules}
                gpxTransposedContinent={gpxTransposedContinent}
                syntaxValidFormat={syntaxValidFormat}
                onMetadataStrippingChange={setWillStripMetadata}
              />
            </div>
          </div>
        </div>
      </main>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      
      {showStats && (
        <Modal onClose={() => setShowStats(false)} title="Detection Statistics">
          <Stats />
        </Modal>
      )}

      {showDmesgModal && (
        <DmesgTimestampModal
          firstLine={dmesgDetection.firstLine}
          onClose={() => {
            setShowDmesgModal(false)
            setDmesgModalDismissed(true)
          }}
        />
      )}

      {showSipModal && (
        <SipTraceModal
          firstLine={sipDetection.firstLine}
          onClose={() => {
            setShowSipModal(false)
            setSipModalDismissed(true)
          }}
          onLoadPreset={loadSipPreset}
        />
      )}

      {showEmailHopsModal && (
        <EmailHopsModal
          rawHeaders={input}
          onClose={() => setShowEmailHopsModal(false)}
        />
      )}

      <SpamReportModal
        isOpen={showSpamReportModal}
        onClose={() => setShowSpamReportModal(false)}
        report={spamReportsDetected[0] || null}
        reports={spamReportsDetected}
      />

      <GpxTransposeModal
        isOpen={showGpxModal}
        onClose={() => setShowGpxModal(false)}
        gpxContent={input}
        onTranspose={handleGpxTranspose}
      />
    </div>
  )
}

export default App
