import { useRef, useState, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useAppStore, type ReplacementInfo } from '../stores/useAppStore'

interface EditorProps {
  input: string
  output: string
  onInputChange: (value: string) => void
  onView?: () => void
  showDiff?: boolean
}

export interface EditorHandle {
  scrollToLine: (line: number) => void
}

const LINE_HEIGHT = 20
const VIRTUAL_THRESHOLD = 500
const OVERSCAN = 10

function highlightLine(line: string, lineStart: number, replacements: ReplacementInfo[], type: 'original' | 'output'): React.ReactNode {
  const lineEnd = lineStart + line.length
  const relevantReplacements = replacements.filter(r => 
    r.start < lineEnd && r.end > lineStart && r.start >= 0
  )
  
  if (relevantReplacements.length === 0) {
    return line || ' '
  }

  const parts: React.ReactNode[] = []
  let lastEnd = 0

  const sortedReplacements = [...relevantReplacements].sort((a, b) => a.start - b.start)

  for (const rep of sortedReplacements) {
    const relStart = Math.max(0, rep.start - lineStart)
    const relEnd = Math.min(line.length, rep.end - lineStart)

    if (relStart > lastEnd) {
      parts.push(<span key={`text-${lastEnd}`}>{line.slice(lastEnd, relStart)}</span>)
    }

    if (type === 'original') {
      parts.push(
        <span 
          key={`hl-${rep.start}`} 
          className="bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-200 rounded px-0.5"
          title={`${rep.pii_type}: will be replaced`}
        >
          {line.slice(relStart, relEnd)}
        </span>
      )
    }

    lastEnd = relEnd
  }

  if (lastEnd < line.length) {
    parts.push(<span key={`text-end`}>{line.slice(lastEnd)}</span>)
  }

  return parts.length > 0 ? parts : (line || ' ')
}

function highlightOutputLine(line: string, replacements: ReplacementInfo[]): React.ReactNode {
  const patterns = replacements.map(r => ({
    pattern: r.replacement,
    type: r.pii_type
  }))

  if (patterns.length === 0) return line || ' '

  const parts: React.ReactNode[] = []
  let remaining = line
  let keyIndex = 0

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
      <span 
        key={`hl-${keyIndex++}`}
        className="bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-200 rounded px-0.5"
        title={`${earliestMatch.type}: replacement`}
      >
        {remaining.slice(earliestMatch.index, earliestMatch.index + earliestMatch.length)}
      </span>
    )

    remaining = remaining.slice(earliestMatch.index + earliestMatch.length)
  }

  return parts.length > 0 ? parts : (line || ' ')
}

interface VirtualizedListProps {
  lines: string[]
  lineOffsets: number[]
  replacements: ReplacementInfo[]
  selectedLine: number | null
  onLineClick: (lineNum: number) => void
  showDiff: boolean
  type: 'input' | 'output' | 'analysis'
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>
  onScroll?: () => void
  className?: string
  changedLines?: Set<number>
}

function VirtualizedList({ 
  lines, lineOffsets, replacements, selectedLine, onLineClick, 
  showDiff, type, scrollRef, onScroll, className, changedLines 
}: VirtualizedListProps) {
  const internalRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(400)

  useEffect(() => {
    if (scrollRef && internalRef.current) {
      scrollRef.current = internalRef.current
    }
  }, [scrollRef])

  useEffect(() => {
    const updateHeight = () => {
      if (internalRef.current) {
        setContainerHeight(internalRef.current.clientHeight)
      }
    }
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    if (internalRef.current) observer.observe(internalRef.current)
    return () => observer.disconnect()
  }, [])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
    onScroll?.()
  }, [onScroll])

  const totalHeight = lines.length * LINE_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(lines.length, Math.ceil((scrollTop + containerHeight) / LINE_HEIGHT) + OVERSCAN)
  const visibleLines = lines.slice(startIndex, endIndex)

  return (
    <div 
      ref={internalRef}
      onScroll={handleScroll}
      className={`overflow-auto ${className || ''}`}
      style={{ height: '100%' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div 
          className="flex absolute w-full"
          style={{ top: startIndex * LINE_HEIGHT }}
        >
          <div className="flex-shrink-0 sticky left-0 bg-gray-100 dark:bg-gray-900 text-right select-none border-r dark:border-gray-700 z-10">
            {visibleLines.map((_, i) => {
              const lineNum = startIndex + i
              const hasChange = changedLines?.has(lineNum)
              const lineColor = hasChange
                ? (type === 'output' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')
                : 'text-gray-500 dark:text-gray-500'
              return (
                <div
                  key={lineNum}
                  className={`px-2 font-mono text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-end ${lineColor} ${
                    selectedLine === lineNum ? 'bg-yellow-200 dark:bg-yellow-900' : ''
                  }`}
                  style={{ height: LINE_HEIGHT }}
                  onClick={() => onLineClick(lineNum)}
                >
                  {lineNum + 1}
                </div>
              )
            })}
          </div>
          <div className="flex-1 px-2">
            {visibleLines.map((line, i) => {
              const lineNum = startIndex + i
              let content: React.ReactNode
              if (type === 'analysis') {
                content = highlightLine(line, lineOffsets[lineNum], replacements, 'original')
              } else if (type === 'output') {
                content = showDiff && replacements.length > 0 ? highlightOutputLine(line, replacements) : (line || ' ')
              } else {
                content = showDiff && replacements.length > 0 ? highlightLine(line, lineOffsets[lineNum], replacements, 'original') : (line || ' ')
              }
              return (
                <div
                  key={lineNum}
                  className={`font-mono text-sm whitespace-pre text-gray-900 dark:text-gray-100 cursor-pointer ${
                    selectedLine === lineNum ? 'bg-yellow-100 dark:bg-yellow-900/50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                  style={{ height: LINE_HEIGHT }}
                  onClick={() => onLineClick(lineNum)}
                >
                  {content}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({ input, output, onInputChange, onView, showDiff: showDiffProp = true }, ref) {
  const { fileName, setFileName, replacements, analysisReplacements, analysisStats, analyzeText, clearAnalysis, isAnalyzing } = useAppStore()
  const inputContainerRef = useRef<HTMLDivElement | null>(null)
  const outputContainerRef = useRef<HTMLDivElement | null>(null)
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [showDiff, setShowDiff] = useState(showDiffProp)
  const scrollingRef = useRef<'input' | 'output' | null>(null)

  useEffect(() => {
    setShowDiff(showDiffProp)
  }, [showDiffProp])

  useImperativeHandle(ref, () => ({
    scrollToLine: (line: number) => {
      const scrollTop = line * LINE_HEIGHT
      if (inputContainerRef.current) {
        inputContainerRef.current.scrollTop = scrollTop
      }
      if (outputContainerRef.current) {
        outputContainerRef.current.scrollTop = scrollTop
      }
      setSelectedLine(line)
    }
  }), [])

  const inputLines = useMemo(() => input.split('\n'), [input])
  const outputLines = useMemo(() => output.split('\n'), [output])
  
  const useVirtualScrolling = inputLines.length > VIRTUAL_THRESHOLD || outputLines.length > VIRTUAL_THRESHOLD

  const lineOffsets = useMemo(() => {
    const offsets: number[] = []
    let offset = 0
    for (const line of inputLines) {
      offsets.push(offset)
      offset += line.length + 1
    }
    return offsets
  }, [inputLines])

  const changedLines = useMemo(() => {
    const lines = new Set<number>()
    const reps = output ? replacements : analysisReplacements
    for (const r of reps) {
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
  }, [replacements, analysisReplacements, lineOffsets, output])

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

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        onInputChange(ev.target?.result as string)
        setFileName(file.name)
      }
      reader.readAsText(file)
    }
  }

  const handleScroll = useCallback((source: 'input' | 'output') => {
    if (scrollingRef.current && scrollingRef.current !== source) return
    
    scrollingRef.current = source
    const sourceEl = source === 'input' ? inputContainerRef.current : outputContainerRef.current
    const targetEl = source === 'input' ? outputContainerRef.current : inputContainerRef.current
    
    if (sourceEl && targetEl) {
      targetEl.scrollTop = sourceEl.scrollTop
    }
    
    requestAnimationFrame(() => {
      scrollingRef.current = null
    })
  }, [])

  const handleLineClick = (lineNum: number) => {
    setSelectedLine(lineNum === selectedLine ? null : lineNum)
  }

  useEffect(() => {
    setSelectedLine(null)
  }, [output])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        onInputChange(ev.target?.result as string)
        setFileName(file.name)
      }
      reader.readAsText(file)
    }
  }

  const renderNonVirtualLines = (lines: string[], type: 'input' | 'output' | 'analysis', reps: ReplacementInfo[], changed?: Set<number>) => (
    <div className="flex min-w-fit">
      <div className="flex-shrink-0 sticky left-0 bg-gray-100 dark:bg-gray-900 text-right select-none border-r dark:border-gray-700 py-2">
        {lines.map((_, i) => {
          const hasChange = changed?.has(i)
          const lineColor = hasChange
            ? (type === 'output' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')
            : 'text-gray-500 dark:text-gray-500'
          return (
            <div
              key={i}
              className={`px-2 font-mono text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 h-5 flex items-center justify-end ${lineColor} ${
                selectedLine === i ? 'bg-yellow-200 dark:bg-yellow-900' : ''
              }`}
              onClick={() => handleLineClick(i)}
            >
              {i + 1}
            </div>
          )
        })}
      </div>
      <div className="flex-1 p-2">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`font-mono text-sm whitespace-pre text-gray-900 dark:text-gray-100 cursor-pointer h-5 ${
              selectedLine === i ? 'bg-yellow-100 dark:bg-yellow-900/50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
            onClick={() => handleLineClick(i)}
          >
            {type === 'analysis' 
              ? highlightLine(line, lineOffsets[i], reps, 'original')
              : type === 'output'
                ? (showDiff && reps.length > 0 ? highlightOutputLine(line, reps) : (line || ' '))
                : (showDiff && reps.length > 0 ? highlightLine(line, lineOffsets[i], reps, 'original') : (line || ' '))
            }
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
      <div className="flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Original {fileName && <span className="text-gray-500 dark:text-gray-400">({fileName})</span>}
            {useVirtualScrolling && inputLines.length > VIRTUAL_THRESHOLD && (
              <span className="ml-2 text-xs text-gray-400">({inputLines.length.toLocaleString()} lines)</span>
            )}
          </label>
          <div className="flex gap-2">
            {output && (
              <button
                onClick={() => setShowDiff(!showDiff)}
                className={`text-xs flex items-center gap-1 ${showDiff ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
                title={showDiff ? 'Hide diff highlighting - stop showing what changed' : 'Show diff highlighting - highlight detected and replaced values'}
              >
                <span className={`w-2 h-2 rounded-full ${showDiff ? 'bg-blue-500' : 'bg-gray-400'}`} />
                Diff
              </button>
            )}
            {input && !output && (
              analysisReplacements.length > 0 ? (
                <button
                  onClick={clearAnalysis}
                  className="text-xs text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 flex items-center gap-1"
                  title="Clear the analysis preview and return to editing mode"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear Preview ({Object.values(analysisStats).reduce((a, b) => a + b, 0)} matches)
                </button>
              ) : (
                <button
                  onClick={() => { analyzeText(input); window.umami?.track('analyze') }}
                  disabled={isAnalyzing}
                  className="text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 flex items-center gap-1 disabled:opacity-50"
                  title="Preview what will be detected without sanitizing - also suggests disabled rules that would match"
                >
                  {isAnalyzing ? (
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                  {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                </button>
              )
            )}
            <label 
              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              title="Upload a log file (.log, .txt, .json, .xml, .csv)"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload
              <input
                type="file"
                onChange={handleFileUpload}
                accept=".log,.txt,.json,.xml,.csv"
                className="hidden"
              />
            </label>
            {input && (
              <button
                onClick={() => {
                  onInputChange('')
                  setFileName(null)
                  setSelectedLine(null)
                }}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Clear the input text"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        {!output && analysisReplacements.length === 0 ? (
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            placeholder="Paste your logs here, upload, or drag & drop a file..."
            className="flex-1 min-h-0 p-4 font-mono text-sm border dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
        ) : !output && analysisReplacements.length > 0 ? (
          useVirtualScrolling ? (
            <div className="flex-1 min-h-0 border-2 border-purple-400 dark:border-purple-600 rounded-lg bg-white dark:bg-gray-800">
              <VirtualizedList
                lines={inputLines}
                lineOffsets={lineOffsets}
                replacements={analysisReplacements}
                selectedLine={selectedLine}
                onLineClick={handleLineClick}
                showDiff={true}
                type="analysis"
                scrollRef={inputContainerRef}
                changedLines={changedLines}
              />
            </div>
          ) : (
            <div
              ref={inputContainerRef}
              className="flex-1 min-h-0 border-2 border-purple-400 dark:border-purple-600 rounded-lg overflow-auto bg-white dark:bg-gray-800"
            >
              {renderNonVirtualLines(inputLines, 'analysis', analysisReplacements, changedLines)}
            </div>
          )
        ) : useVirtualScrolling ? (
          <div className="flex-1 min-h-0 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
            <VirtualizedList
              lines={inputLines}
              lineOffsets={lineOffsets}
              replacements={replacements}
              selectedLine={selectedLine}
              onLineClick={handleLineClick}
              showDiff={showDiff}
              type="input"
              scrollRef={inputContainerRef}
              onScroll={() => handleScroll('input')}
              changedLines={changedLines}
            />
          </div>
        ) : (
          <div
            ref={inputContainerRef}
            onScroll={() => handleScroll('input')}
            className="flex-1 min-h-0 border dark:border-gray-600 rounded-lg overflow-auto bg-white dark:bg-gray-800"
          >
            {renderNonVirtualLines(inputLines, 'input', replacements, changedLines)}
          </div>
        )}
      </div>
      
      <div className="flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Sanitized
            {useVirtualScrolling && outputLines.length > VIRTUAL_THRESHOLD && output && (
              <span className="ml-2 text-xs text-gray-400">({outputLines.length.toLocaleString()} lines)</span>
            )}
          </label>
          {output && (
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </button>
              {onView && (
                <button
                  onClick={onView}
                  className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View
                </button>
              )}
              <button
                onClick={handleDownload}
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
          )}
        </div>
        
        {!output ? (
          <div className="flex-1 min-h-0 p-4 font-mono text-sm border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500 overflow-auto">
            Sanitized output will appear here...
          </div>
        ) : useVirtualScrolling ? (
          <div className="flex-1 min-h-0 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900">
            <VirtualizedList
              lines={outputLines}
              lineOffsets={[]}
              replacements={replacements}
              selectedLine={selectedLine}
              onLineClick={handleLineClick}
              showDiff={showDiff}
              type="output"
              scrollRef={outputContainerRef}
              onScroll={() => handleScroll('output')}
              changedLines={changedLines}
            />
          </div>
        ) : (
          <div
            ref={outputContainerRef}
            onScroll={() => handleScroll('output')}
            className="flex-1 min-h-0 border dark:border-gray-600 rounded-lg overflow-auto bg-gray-50 dark:bg-gray-900"
          >
            {renderNonVirtualLines(outputLines, 'output', replacements, changedLines)}
          </div>
        )}
      </div>
    </div>
  )
})
