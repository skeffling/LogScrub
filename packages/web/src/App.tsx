import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Header } from './components/Header'
import { Editor } from './components/Editor'
import { RulePanel } from './components/RulePanel'
import { TimeShift } from './components/TimeShift'
import { AboutModal } from './components/AboutModal'
import { Suggestions } from './components/Suggestions'
import { Stats } from './components/Stats'
import { Modal } from './components/Modal'
import { useAppStore } from './stores/useAppStore'
import init, { compress_zip, compress_gzip } from './wasm-core/wasm_core'

let wasmReady: Promise<unknown> | null = null
async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = init()
  }
  await wasmReady
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
    analyzeText, isAnalyzing, analysisReplacements, clearAnalysis,
    replacements
  } = useAppStore()
  const [showRules, setShowRules] = useState(() => loadUiPreference('showRules', true))
  const [fullscreenView, setFullscreenView] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [constrainWidth, setConstrainWidth] = useState(() => loadUiPreference('constrainWidth', false))
  const [showDiffHighlight, setShowDiffHighlight] = useState(() => loadUiPreference('showDiffHighlight', true))
  const [goToLineValue, setGoToLineValue] = useState('')
  const [showGoToLine, setShowGoToLine] = useState(false)
  const [syncScroll, setSyncScroll] = useState(() => loadUiPreference('syncScroll', true))
  const [showStats, setShowStats] = useState(false)
  const [fullscreenHighlight, setFullscreenHighlight] = useState(true)
  const [fullscreenLoading, setFullscreenLoading] = useState(false)
  const [fullscreenGoToLine, setFullscreenGoToLine] = useState(false)
  const [fullscreenGoToLineValue, setFullscreenGoToLineValue] = useState('')
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
  useEffect(() => { saveUiPreference('constrainWidth', constrainWidth) }, [constrainWidth])
  useEffect(() => { saveUiPreference('showDiffHighlight', showDiffHighlight) }, [showDiffHighlight])
  useEffect(() => { saveUiPreference('syncScroll', syncScroll) }, [syncScroll])

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

  const fullscreenLines = useMemo(() => output.split('\n'), [output])
  
  const highlightFullscreenLine = useCallback((line: string): React.ReactNode => {
    if (!fullscreenHighlight || replacements.length === 0) return line || ' '
    
    const parts: React.ReactNode[] = []
    let remaining = line
    let keyIndex = 0
    const patterns = replacements.map(r => ({ pattern: r.replacement, type: r.pii_type }))

    while (remaining.length > 0) {
      let earliestMatch: { index: number; length: number; type: string } | null = null
      for (const p of patterns) {
        const idx = remaining.indexOf(p.pattern)
        if (idx !== -1 && (earliestMatch === null || idx < earliestMatch.index)) {
          earliestMatch = { index: idx, length: p.pattern.length, type: p.type }
        }
      }
      if (earliestMatch === null) {
        parts.push(<span key={`rest-${keyIndex++}`}>{remaining}</span>)
        break
      }
      if (earliestMatch.index > 0) {
        parts.push(<span key={`text-${keyIndex++}`}>{remaining.slice(0, earliestMatch.index)}</span>)
      }
      parts.push(
        <span key={`hl-${keyIndex++}`} className="bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-200 rounded px-0.5" title={earliestMatch.type}>
          {remaining.slice(earliestMatch.index, earliestMatch.index + earliestMatch.length)}
        </span>
      )
      remaining = remaining.slice(earliestMatch.index + earliestMatch.length)
    }
    return parts.length > 0 ? parts : (line || ' ')
  }, [fullscreenHighlight, replacements])

  if (fullscreenView) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Scrubbed Output {fileName && <span className="text-gray-500 dark:text-gray-400 text-sm">({fileName})</span>}
            <span className="ml-2 text-xs text-gray-400">({fullscreenLines.length.toLocaleString()} lines)</span>
          </h2>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setFullscreenHighlight(!fullscreenHighlight)}
              className={`text-sm flex items-center gap-1 ${fullscreenHighlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'}`}
              title="Toggle highlighting of replaced values"
            >
              <span className={`w-2 h-2 rounded-full ${fullscreenHighlight ? 'bg-blue-500' : 'bg-gray-400'}`} />
              Highlight
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
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
                className="flex items-center gap-1"
              >
                <input
                  type="number"
                  min="1"
                  max={fullscreenLines.length}
                  value={fullscreenGoToLineValue}
                  onChange={(e) => setFullscreenGoToLineValue(e.target.value)}
                  placeholder="Line #"
                  autoFocus
                  className="w-20 px-2 py-1 text-sm border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  onBlur={() => { if (!fullscreenGoToLineValue) setFullscreenGoToLine(false) }}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setFullscreenGoToLine(false); setFullscreenGoToLineValue('') } }}
                />
                <button type="submit" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800">Go</button>
              </form>
            ) : (
              <button
                onClick={() => setFullscreenGoToLine(true)}
                className="text-sm text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                title="Go to line (⌘G)"
              >
                Go to Line
              </button>
            )}
            <span className="text-gray-300 dark:text-gray-600">|</span>
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
              <span className="text-gray-500 dark:text-gray-400">Loading {fullscreenLines.length.toLocaleString()} lines...</span>
            </div>
          </div>
        ) : (
          <div ref={fullscreenScrollRef} className="flex-1 overflow-auto bg-white dark:bg-gray-900">
            <div className="flex min-w-fit">
              <div className="flex-shrink-0 sticky left-0 bg-gray-100 dark:bg-gray-800 text-right select-none border-r dark:border-gray-700 py-2">
                {fullscreenLines.map((_, i) => (
                  <div key={i} className="px-3 font-mono text-sm text-gray-500 dark:text-gray-500 h-5 flex items-center justify-end">
                    {i + 1}
                  </div>
                ))}
              </div>
              <div className="flex-1 p-2">
                {fullscreenLines.map((line, i) => (
                  <div key={i} className="font-mono text-sm whitespace-pre text-gray-900 dark:text-gray-100 h-5">
                    {highlightFullscreenLine(line)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <Header onAboutClick={() => setShowAbout(true)} />
      
      <main className={`flex-1 flex flex-col mx-auto px-4 py-4 w-full min-h-0 overflow-hidden ${constrainWidth ? 'max-w-7xl' : ''}`}>
        {(isProcessing || isAnalyzing) && processingProgress > 0 && (
          <div className="mb-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">{isAnalyzing ? 'Analyzing...' : 'Processing...'}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{processingProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 flex-1 min-h-0 overflow-hidden">
          {showRules && (
            <aside className="lg:col-span-3 xl:col-span-3 2xl:col-span-2 min-h-0 overflow-hidden flex flex-col gap-4">
              <RulePanel />
              <div className="flex-shrink-0">
                <TimeShift />
              </div>
            </aside>
          )}
          
          <div className={`flex flex-col min-h-0 overflow-hidden ${showRules ? "lg:col-span-9 xl:col-span-9 2xl:col-span-10" : "lg:col-span-12"}`}>
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
                  className="text-sm text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hidden xl:block"
                  title={constrainWidth ? 'Use full width' : 'Constrain width'}
                >
                  {constrainWidth ? '⬌ Expand' : '⬄ Compact'}
                </button>
                {output && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600 hidden md:inline">|</span>
                    <button
                      onClick={() => setShowDiffHighlight(!showDiffHighlight)}
                      className={`text-sm flex items-center gap-1 hidden md:flex ${showDiffHighlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'}`}
                      title="Toggle diff highlighting"
                    >
                      <span className={`w-2 h-2 rounded-full ${showDiffHighlight ? 'bg-blue-500' : 'bg-gray-400'}`} />
                      Highlight
                    </button>
                  </>
                )}
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
                    className="flex items-center gap-1"
                  >
                    <input
                      type="number"
                      min="1"
                      value={goToLineValue}
                      onChange={(e) => setGoToLineValue(e.target.value)}
                      placeholder="Line #"
                      autoFocus
                      className="w-20 px-2 py-1 text-sm border dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
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
                    <button type="submit" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800">
                      Go
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setShowGoToLine(true)}
                    className="text-sm text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hidden md:block"
                    title="Go to line (⌘G)"
                  >
                    Go to Line
                  </button>
                )}
                <span className="text-gray-300 dark:text-gray-600 hidden md:inline">|</span>
                <button
                  onClick={() => setSyncScroll(!syncScroll)}
                  className={`text-sm hidden md:flex items-center gap-1 ${syncScroll ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  title="Sync scrolling between original and sanitized panes"
                >
                  <span className={`w-2 h-2 rounded-full ${syncScroll ? 'bg-blue-500' : 'bg-gray-400'}`} />
                  Sync Scroll
                </button>
                <span className="text-gray-300 dark:text-gray-600 hidden md:inline">|</span>
                <button
                  onClick={() => setShowStats(true)}
                  className="text-sm text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hidden md:flex items-center gap-1"
                  title="View detection statistics and download audit reports"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Stats
                </button>
              </div>
              <div className="flex items-center gap-2">
                {input && (
                  <button
                    onClick={handleClear}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    title="Clear all input and output text"
                  >
                    Clear
                  </button>
                )}
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
                {!output && analysisReplacements.length === 0 && (
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
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="flex-shrink-0 py-3 text-center text-xs text-gray-500 dark:text-gray-400 border-t dark:border-gray-700">
        <span>100% client-side. Your data never leaves your browser.</span>
        <span className="mx-2">•</span>
        <span className="hidden sm:inline">
          <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">⌘/Ctrl</kbd>+<kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Enter</kbd> to scrub
          <span className="mx-2">•</span>
          <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">⌘/Ctrl</kbd>+<kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">S</kbd> to download
          <span className="mx-2">•</span>
        </span>
        <span>Find this useful? <a href="https://ko-fi.com/pitstopper" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300">Buy us a coffee ☕</a></span>
      </footer>
      
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      
      {showStats && (
        <Modal onClose={() => setShowStats(false)} title="Detection Statistics">
          <Stats />
        </Modal>
      )}
    </div>
  )
}

export default App
