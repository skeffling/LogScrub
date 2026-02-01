import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

const LINE_HEIGHT = 20

interface Replacement {
  original: string
  replacement: string
  pii_type: string
  start: number
}

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

interface FullscreenViewerProps {
  output: string
  input: string
  fileName: string | null
  replacements: Replacement[]
  documentType: string | null
  changedLinesSet: Set<number>
  onDownload: () => void
  onDownloadZip: () => void
  onDownloadGzip: () => void
}

export function FullscreenViewer({
  output,
  input,
  fileName,
  replacements,
  documentType,
  changedLinesSet,
  onDownload,
  onDownloadZip,
  onDownloadGzip,
}: FullscreenViewerProps) {
  const [highlight, setHighlight] = useState(true)
  const [loading, setLoading] = useState(true)
  const [goToLine, setGoToLine] = useState(false)
  const [goToLineValue, setGoToLineValue] = useState('')
  const [lineFilter, setLineFilter] = useState<'all' | 'changed' | 'unchanged'>('all')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Remove loading state after initial render
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setLoading(false)
      })
    })
  }, [])

  const lines = useMemo(() => output.split('\n'), [output])

  const { filteredLines, filteredLineNumbers } = useMemo(() => {
    if (lineFilter === 'all' || changedLinesSet.size === 0) {
      return { filteredLines: lines, filteredLineNumbers: undefined }
    }
    const lineNums: number[] = []
    const filtered: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const isChanged = changedLinesSet.has(i)
      if ((lineFilter === 'changed' && isChanged) ||
          (lineFilter === 'unchanged' && !isChanged)) {
        lineNums.push(i)
        filtered.push(lines[i])
      }
    }
    return { filteredLines: filtered, filteredLineNumbers: lineNums }
  }, [lines, changedLinesSet, lineFilter])

  const replacementLookup = useMemo(() => {
    const lineOffsets: number[] = []
    let offset = 0
    const inputLines = input.split('\n')
    for (const l of inputLines) {
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

  const highlightLine = useCallback((line: string): React.ReactNode => {
    if (!highlight || replacements.length === 0) return line || ' '

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

      const info = replacementLookup.get(earliestMatch.pattern)
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
  }, [highlight, replacements, replacementLookup])

  const handleGoToLine = (e: React.FormEvent) => {
    e.preventDefault()
    const lineNum = parseInt(goToLineValue, 10)
    if (!isNaN(lineNum) && lineNum > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = (lineNum - 1) * LINE_HEIGHT
    }
    setGoToLine(false)
    setGoToLineValue('')
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Scrubbed Output {fileName && <span className="text-gray-600 dark:text-gray-400 text-sm" title={fileName}>({fileName.length > 8 ? fileName.slice(0, 8) + '…' : fileName})</span>}
          <span className="ml-2 text-xs text-gray-400">
            ({filteredLines.length.toLocaleString()} lines{lineFilter !== 'all' && ` of ${lines.length.toLocaleString()}`})
          </span>
        </h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setHighlight(!highlight)}
            className={`text-sm flex items-center gap-1 ${highlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}
            title="Toggle highlighting of replaced values"
          >
            <span className={`w-2 h-2 rounded-full ${highlight ? 'bg-blue-500' : 'bg-gray-400'}`} />
            Diff
          </button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          {changedLinesSet.size > 0 && (
            <>
              <button
                onClick={() => setLineFilter('all')}
                className={`text-sm ${lineFilter === 'all' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title={`All ${lines.length.toLocaleString()} lines (${changedLinesSet.size.toLocaleString()} changed, ${(lines.length - changedLinesSet.size).toLocaleString()} unchanged)`}
              >
                All
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <button
                onClick={() => setLineFilter('changed')}
                className={`text-sm ${lineFilter === 'changed' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title={`${changedLinesSet.size.toLocaleString()} changed lines`}
              >
                Changed
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <button
                onClick={() => setLineFilter('unchanged')}
                className={`text-sm ${lineFilter === 'unchanged' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                title={`${(lines.length - changedLinesSet.size).toLocaleString()} unchanged lines`}
              >
                Unchanged
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
            </>
          )}
          {!documentType && (
            <>
              {goToLine ? (
                <form
                  onSubmit={handleGoToLine}
                  className="flex items-center text-sm text-gray-600 dark:text-gray-400"
                >
                  <span>Line</span>
                  <input
                    type="number"
                    min="1"
                    max={lines.length}
                    value={goToLineValue}
                    onChange={(e) => setGoToLineValue(e.target.value)}
                    placeholder="#"
                    autoFocus
                    className="w-12 px-1 mx-1 text-sm bg-transparent border-b border-gray-400 dark:border-gray-500 focus:border-blue-500 dark:focus:border-blue-400 outline-none text-gray-700 dark:text-gray-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    onBlur={() => { if (!goToLineValue) setGoToLine(false) }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setGoToLine(false); setGoToLineValue('') } }}
                  />
                  <button type="submit" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">↵</button>
                </form>
              ) : (
                <button
                  onClick={() => setGoToLine(true)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  title="Go to line"
                >
                  Go to Line
                </button>
              )}
              <span className="text-gray-300 dark:text-gray-600">|</span>
            </>
          )}
          <button
            onClick={onDownload}
            className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border dark:border-gray-600 rounded"
            title="Download as plain text"
          >
            .txt
          </button>
          <button
            onClick={onDownloadZip}
            className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border dark:border-gray-600 rounded"
            title="Download as compressed zip"
          >
            .zip
          </button>
          <button
            onClick={onDownloadGzip}
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
      {loading ? (
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-gray-600 dark:text-gray-400">Loading {lines.length.toLocaleString()} lines...</span>
          </div>
        </div>
      ) : (
        <FullscreenVirtualList
          lines={filteredLines}
          lineNumbers={filteredLineNumbers}
          changedLines={changedLinesSet}
          highlightLine={highlightLine}
          scrollRef={scrollRef}
        />
      )}
    </div>
  )
}
