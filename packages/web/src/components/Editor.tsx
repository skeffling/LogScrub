import { useRef, useState, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import init, { decompress_gzip, decompress_zip, compress_zip, compress_gzip } from '../wasm-core/wasm_core'
import { useAppStore, type ReplacementInfo } from '../stores/useAppStore'

let wasmReady: Promise<unknown> | null = null
async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = init()
  }
  await wasmReady
}

interface EditorProps {
  input: string
  output: string
  onInputChange: (value: string) => void
  onView?: () => void
  showDiff?: boolean
  syncScroll?: boolean
}

export interface EditorHandle {
  scrollToLine: (line: number) => void
}

const LINE_HEIGHT = 20
const VIRTUAL_THRESHOLD = 500
const OVERSCAN = 15

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

interface ReplacementLookup {
  original: string
  type: string
  lines: number[]
}

function buildReplacementLookup(replacements: ReplacementInfo[], inputText: string): Map<string, ReplacementLookup> {
  const lineOffsets: number[] = []
  let offset = 0
  const lines = inputText.split('\n')
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

  const lookup = new Map<string, ReplacementLookup>()
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
}

function highlightOutputLine(line: string, replacements: ReplacementInfo[], lookup?: Map<string, ReplacementLookup>): React.ReactNode {
  const patterns = replacements.map(r => ({
    pattern: r.replacement,
    type: r.pii_type
  }))

  if (patterns.length === 0) return line || ' '

  const parts: React.ReactNode[] = []
  let remaining = line
  let keyIndex = 0

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

    const info = lookup?.get(earliestMatch.pattern)
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
      <span
        key={`hl-${keyIndex++}`}
        className="bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-200 rounded px-0.5 cursor-help"
        title={tooltipLines.join('\n')}
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
  originalLineNumbers?: number[]
  replacementLookup?: Map<string, ReplacementLookup>
}

function VirtualizedList({
  lines, lineOffsets, replacements, selectedLine, onLineClick,
  showDiff, type, scrollRef, onScroll, className, changedLines,
  originalLineNumbers, replacementLookup
}: VirtualizedListProps) {
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
    overscan: OVERSCAN,
  })

  const handleScroll = useCallback(() => {
    onScroll?.()
  }, [onScroll])

  return (
    <div 
      ref={parentRef}
      onScroll={handleScroll}
      className={`overflow-auto ${className || ''}`}
      style={{ height: '100%' }}
    >
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
          <div className="flex-shrink-0 sticky left-0 z-10 bg-gray-100 dark:bg-gray-900 text-right select-none border-r dark:border-gray-700">
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const lineNum = originalLineNumbers ? originalLineNumbers[virtualRow.index] : virtualRow.index
              const hasChange = changedLines?.has(lineNum)
              const lineColor = hasChange
                ? (type === 'output' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')
                : 'text-gray-500 dark:text-gray-500'
              return (
                <div
                  key={virtualRow.key}
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
          <div className="px-2">
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const line = lines[virtualRow.index]
              const lineNum = originalLineNumbers ? originalLineNumbers[virtualRow.index] : virtualRow.index
              let content: React.ReactNode
              if (type === 'analysis') {
                content = highlightLine(line, lineOffsets[lineNum] ?? 0, replacements, 'original')
              } else if (type === 'output') {
                content = showDiff && replacements.length > 0 ? highlightOutputLine(line, replacements, replacementLookup) : (line || ' ')
              } else {
                content = showDiff && replacements.length > 0 ? highlightLine(line, lineOffsets[lineNum] ?? 0, replacements, 'original') : (line || ' ')
              }
              return (
                <div
                  key={virtualRow.key}
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

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({ input, output, onInputChange, onView, showDiff: showDiffProp = true, syncScroll: syncScrollProp = true }, ref) {
  const { fileName, setFileName, replacements, analysisReplacements } = useAppStore()
  const inputContainerRef = useRef<HTMLDivElement | null>(null)
  const outputContainerRef = useRef<HTMLDivElement | null>(null)
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [showDiff, setShowDiff] = useState(showDiffProp)
  const [showChangedOnly, setShowChangedOnly] = useState(false)
  const scrollingRef = useRef<'input' | 'output' | null>(null)

  useEffect(() => {
    setShowDiff(showDiffProp)
  }, [showDiffProp])

  useEffect(() => {
    if (output && replacements.length > 0) {
      setShowDiff(true)
    }
  }, [output, replacements.length])

  useEffect(() => {
    setShowChangedOnly(false)
  }, [input, output])

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

  const replacementLookup = useMemo(() => {
    const reps = output ? replacements : analysisReplacements
    return buildReplacementLookup(reps, input)
  }, [replacements, analysisReplacements, input, output])

  const { filteredInputLines, filteredOutputLines, filteredLineNumbers } = useMemo(() => {
    if (!showChangedOnly || changedLines.size === 0) {
      return { 
        filteredInputLines: inputLines, 
        filteredOutputLines: outputLines, 
        filteredLineNumbers: undefined 
      }
    }
    const lineNums: number[] = []
    const inLines: string[] = []
    const outLines: string[] = []
    for (let i = 0; i < inputLines.length; i++) {
      if (changedLines.has(i)) {
        lineNums.push(i)
        inLines.push(inputLines[i])
        if (outputLines[i] !== undefined) {
          outLines.push(outputLines[i])
        }
      }
    }
    return { filteredInputLines: inLines, filteredOutputLines: outLines, filteredLineNumbers: lineNums }
  }, [inputLines, outputLines, changedLines, showChangedOnly])

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

  const processCompressedFile = async (file: File): Promise<{ content: string; name: string }> => {
    const ext = file.name.toLowerCase()
    
    if (ext.endsWith('.zip') || ext.endsWith('.gz') || ext.endsWith('.gzip')) {
      await ensureWasm()
      const buffer = await file.arrayBuffer()
      const data = new Uint8Array(buffer)
      
      if (ext.endsWith('.zip')) {
        const content = decompress_zip(data)
        const baseName = file.name.replace(/\.zip$/i, '')
        return { content, name: baseName }
      }
      
      const content = decompress_gzip(data)
      const baseName = file.name.replace(/\.(gz|gzip)$/i, '')
      return { content, name: baseName }
    }
    
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (ev) => resolve({ content: ev.target?.result as string, name: file.name })
      reader.readAsText(file)
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const { content, name } = await processCompressedFile(file)
        onInputChange(content)
        setFileName(name)
      } catch {
        alert('Failed to read file. Make sure it\'s a valid text, zip, or gzip file.')
      }
    }
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

  const handleScroll = useCallback((source: 'input' | 'output') => {
    if (!syncScrollProp || showChangedOnly) return
    if (scrollingRef.current && scrollingRef.current !== source) return
    
    scrollingRef.current = source
    const sourceEl = source === 'input' ? inputContainerRef.current : outputContainerRef.current
    const targetEl = source === 'input' ? outputContainerRef.current : inputContainerRef.current
    
    if (sourceEl && targetEl) {
      targetEl.scrollTop = sourceEl.scrollTop
      targetEl.scrollLeft = sourceEl.scrollLeft
    }
    
    requestAnimationFrame(() => {
      scrollingRef.current = null
    })
  }, [syncScrollProp, showChangedOnly])

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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files[0]
    if (file) {
      try {
        const { content, name } = await processCompressedFile(file)
        onInputChange(content)
        setFileName(name)
      } catch {
        alert('Failed to read file. Make sure it\'s a valid text, zip, or gzip file.')
      }
    }
  }

  const renderNonVirtualLines = (lines: string[], type: 'input' | 'output' | 'analysis', reps: ReplacementInfo[], changed?: Set<number>, lineNums?: number[]) => (
    <div className="inline-flex min-w-full">
      <div className="flex-shrink-0 sticky left-0 z-10 bg-gray-100 dark:bg-gray-900 text-right select-none border-r dark:border-gray-700 py-2">
        {lines.map((_, i) => {
          const lineNum = lineNums ? lineNums[i] : i
          const hasChange = changed?.has(lineNum)
          const lineColor = hasChange
            ? (type === 'output' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')
            : 'text-gray-500 dark:text-gray-500'
          return (
            <div
              key={lineNum}
              className={`px-2 font-mono text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 h-5 flex items-center justify-end ${lineColor} ${
                selectedLine === lineNum ? 'bg-yellow-200 dark:bg-yellow-900' : ''
              }`}
              onClick={() => handleLineClick(lineNum)}
            >
              {lineNum + 1}
            </div>
          )
        })}
      </div>
      <div className="p-2">
        {lines.map((line, i) => {
          const lineNum = lineNums ? lineNums[i] : i
          return (
            <div
              key={lineNum}
              className={`font-mono text-sm whitespace-pre text-gray-900 dark:text-gray-100 cursor-pointer h-5 ${
                selectedLine === lineNum ? 'bg-yellow-100 dark:bg-yellow-900/50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
              onClick={() => handleLineClick(lineNum)}
            >
              {type === 'analysis'
                ? highlightLine(line, lineOffsets[lineNum] ?? 0, reps, 'original')
                : type === 'output'
                  ? (showDiff && reps.length > 0 ? highlightOutputLine(line, reps, replacementLookup) : (line || ' '))
                  : (showDiff && reps.length > 0 ? highlightLine(line, lineOffsets[lineNum] ?? 0, reps, 'original') : (line || ' '))
              }
            </div>
          )
        })}
      </div>
    </div>
  )

  const hasChanges = changedLines.size > 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
      <div className="flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Original {fileName && <span className="text-gray-500 dark:text-gray-400" title={fileName}>({fileName.length > 8 ? fileName.slice(0, 8) + '…' : fileName})</span>}
            {useVirtualScrolling && inputLines.length > VIRTUAL_THRESHOLD && (
              <span className="ml-2 text-xs text-gray-400">
                ({(showChangedOnly ? filteredInputLines.length : inputLines.length).toLocaleString()} lines{showChangedOnly && ` of ${inputLines.length.toLocaleString()}`})
              </span>
            )}
          </label>
          <div className="flex gap-2">
            {hasChanges && output && (
              <button
                onClick={() => setShowChangedOnly(!showChangedOnly)}
                className={`text-xs flex items-center gap-1 ${showChangedOnly ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-500'}`}
                title="Show only lines with changes"
              >
                <span className={`w-2 h-2 rounded-full ${showChangedOnly ? 'bg-blue-500' : 'bg-gray-400'}`} />
                Changed only
              </button>
            )}
            <label 
              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              title="Upload a log file (.log, .txt, .json, .xml, .csv, .zip, .gz). Compressed files are automatically extracted."
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload
              <input
                type="file"
                onChange={handleFileUpload}
                accept=".log,.txt,.json,.xml,.csv,.zip,.gz,.gzip"
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
              lines={filteredInputLines}
              lineOffsets={lineOffsets}
              replacements={replacements}
              selectedLine={selectedLine}
              onLineClick={handleLineClick}
              showDiff={showDiff}
              type="input"
              scrollRef={inputContainerRef}
              onScroll={() => handleScroll('input')}
              changedLines={changedLines}
              originalLineNumbers={filteredLineNumbers}
            />
          </div>
        ) : (
          <div
            ref={inputContainerRef}
            onScroll={() => handleScroll('input')}
            className="flex-1 min-h-0 border dark:border-gray-600 rounded-lg overflow-auto bg-white dark:bg-gray-800"
          >
            {renderNonVirtualLines(filteredInputLines, 'input', replacements, changedLines, filteredLineNumbers)}
          </div>
        )}
      </div>
      
      <div className="flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Scrubbed
            {useVirtualScrolling && outputLines.length > VIRTUAL_THRESHOLD && output && (
              <span className="ml-2 text-xs text-gray-400">
                ({(showChangedOnly ? filteredOutputLines.length : outputLines.length).toLocaleString()} lines{showChangedOnly && ` of ${outputLines.length.toLocaleString()}`})
              </span>
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
                title="Download as plain text"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                .txt
              </button>
              <button
                onClick={handleDownloadZip}
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                title="Download as compressed zip"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                .zip
              </button>
              <button
                onClick={handleDownloadGzip}
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                title="Download as gzip compressed"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                .gz
              </button>
            </div>
          )}
        </div>
        
        {!output ? (
          <div className="flex-1 min-h-0 p-4 font-mono text-sm border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500 overflow-auto">
            Scrubbed output will appear here...
          </div>
        ) : useVirtualScrolling ? (
          <div className="flex-1 min-h-0 border dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900">
            <VirtualizedList
              lines={filteredOutputLines}
              lineOffsets={[]}
              replacements={replacements}
              selectedLine={selectedLine}
              onLineClick={handleLineClick}
              showDiff={showDiff}
              type="output"
              scrollRef={outputContainerRef}
              onScroll={() => handleScroll('output')}
              changedLines={changedLines}
              originalLineNumbers={filteredLineNumbers}
              replacementLookup={replacementLookup}
            />
          </div>
        ) : (
          <div
            ref={outputContainerRef}
            onScroll={() => handleScroll('output')}
            className="flex-1 min-h-0 border dark:border-gray-600 rounded-lg overflow-auto bg-gray-50 dark:bg-gray-900"
          >
            {renderNonVirtualLines(filteredOutputLines, 'output', replacements, changedLines, filteredLineNumbers)}
          </div>
        )}
      </div>
    </div>
  )
})
