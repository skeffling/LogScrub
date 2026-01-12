import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Header } from './components/Header'
import { Editor } from './components/Editor'
import { RulePanel } from './components/RulePanel'
import { AboutModal } from './components/AboutModal'
import { DmesgTimestampModal } from './components/DmesgTimestampModal'
import { Suggestions } from './components/Suggestions'
import { Stats } from './components/Stats'
import { Modal } from './components/Modal'
import { FeatureBanner } from './components/FeatureBanner'
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
    documentType
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
  const [showTimeShift, setShowTimeShift] = useState(false)
  const [fullscreenHighlight, setFullscreenHighlight] = useState(true)
  const [fullscreenLoading, setFullscreenLoading] = useState(false)
  const [fullscreenGoToLine, setFullscreenGoToLine] = useState(false)
  const [fullscreenGoToLineValue, setFullscreenGoToLineValue] = useState('')
  const [fullscreenLineFilter, setFullscreenLineFilter] = useState<'all' | 'changed' | 'unchanged'>('all')
  const [lineFilter, setLineFilter] = useState<'all' | 'changed' | 'unchanged'>('all')
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
              <RulePanel />
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
            <div className="flex flex-wrap justify-between items-center gap-2 mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRules(!showRules)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  title={showRules ? 'Hide the detection rules panel' : 'Show the detection rules panel'}
                >
                  {showRules ? '◀ Hide Rules' : '▶ Show Rules'}
                </button>
                <button
                  onClick={() => setConstrainWidth(!constrainWidth)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hidden xl:block"
                  title={constrainWidth ? 'Use full width' : 'Constrain width'}
                >
                  {constrainWidth ? '⬌ Expand' : '⬄ Compact'}
                </button>
                <span className="text-gray-300 dark:text-gray-600 hidden md:inline">|</span>
                <button
                  onClick={() => input.trim() && setShowDiffHighlight(!showDiffHighlight)}
                  className={`text-sm flex items-center gap-1 hidden md:flex ${
                    !input.trim()
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : showDiffHighlight
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400'
                  }`}
                  title={!input.trim() ? 'Load a log file first' : 'Toggle diff highlighting'}
                >
                  <span className={`w-2 h-2 rounded-full ${!input.trim() ? 'bg-gray-300 dark:bg-gray-600' : showDiffHighlight ? 'bg-blue-500' : 'bg-gray-400'}`} />
                  Diff
                </button>
                <button
                  onClick={() => input.trim() && setSyntaxHighlight(!syntaxHighlight)}
                  className={`text-sm flex items-center gap-1 hidden md:flex ${
                    !input.trim()
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : syntaxHighlight
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400'
                  }`}
                  title={!input.trim() ? 'Load a log file first' : 'Toggle syntax highlighting (JSON, XML, SQL)'}
                >
                  <span className={`w-2 h-2 rounded-full ${!input.trim() ? 'bg-gray-300 dark:bg-gray-600' : syntaxHighlight ? 'bg-blue-500' : 'bg-gray-400'}`} />
                  Syntax
                </button>
                {!documentType && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600 hidden md:inline">|</span>
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
                        <button type="submit" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                          ↵
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => input.trim() && setShowGoToLine(true)}
                        className={`text-sm hidden md:block ${
                          !input.trim()
                            ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                        title={!input.trim() ? 'Load a log file first' : 'Go to line (⌘G)'}
                      >
                        Go to Line
                      </button>
                    )}
                  </>
                )}
                <span className="text-gray-300 dark:text-gray-600 hidden md:inline">|</span>
                <button
                  onClick={() => input.trim() && lineFilter === 'all' && setSyncScroll(!syncScroll)}
                  className={`text-sm hidden md:flex items-center gap-1 ${
                    !input.trim() || lineFilter !== 'all'
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : syncScroll
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  title={!input.trim() ? 'Load a log file first' : lineFilter !== 'all' ? 'Disabled while filtering lines' : 'Sync scrolling between original and sanitized panes'}
                >
                  <span className={`w-2 h-2 rounded-full ${!input.trim() || lineFilter !== 'all' ? 'bg-gray-300 dark:bg-gray-600' : syncScroll ? 'bg-blue-500' : 'bg-gray-400'}`} />
                  Sync Scroll
                </button>
                <span className="text-gray-300 dark:text-gray-600 hidden md:inline">|</span>
                <button
                  onClick={() => input.trim() && setShowStats(true)}
                  className={`text-sm hidden md:flex items-center gap-1 ${
                    !input.trim()
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  title={!input.trim() ? 'Load a log file first' : 'View detection statistics and download audit reports'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Stats
                </button>
              </div>
              <div className="flex items-center gap-2">
                {analysisReplacements.length > 0 && !output && (
                  <button
                    onClick={clearAnalysis}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
                    title="Clear the analysis preview"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear Preview
                  </button>
                )}
                {analysisReplacements.length === 0 && (
                  <button
                    onClick={() => { analyzeText(input); window.umami?.track('analyze') }}
                    disabled={isAnalyzing || !input.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title="Preview what will be detected without scrubbing"
                  >
                    {isAnalyzing ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    )}
                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </button>
                )}
                {hasTimestamps && (
                  <div className="relative">
                    <button
                      onClick={() => setShowTimeShift(!showTimeShift)}
                      className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm ${
                        timeShift.enabled
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      }`}
                      title="Shift timestamps to anonymize temporal data"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      TimeShift
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
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                    title="Cancel the current processing operation (Escape)"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={handleProcess}
                    disabled={isProcessing || !input.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title="Apply all enabled detection rules and scrub the input text (⌘/Ctrl+Enter)"
                  >
                    {isProcessing && (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    {isProcessing ? 'Processing...' : 'Scrub'}
                    <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-xs bg-blue-500 rounded">⌘↵</kbd>
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex-shrink-0">
              <Suggestions />
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
                    No PII found. Output is identical to input.
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
    </div>
  )
}

export default App
