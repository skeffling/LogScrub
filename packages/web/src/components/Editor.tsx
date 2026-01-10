import { useRef, useState, useCallback, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import init, { decompress_gzip, decompress_zip, decompress_zip_file, compress_zip, compress_gzip } from '../wasm-core/wasm_core'
import { useAppStore, type ReplacementInfo, type DocumentType } from '../stores/useAppStore'
import { tokenizeWithPositions } from '../utils/syntaxHighlight'
import { Modal } from './Modal'
import { DocumentPreview } from './DocumentPreview'
import { MetadataDialog, DocumentMetadata } from './MetadataDialog'
import { extractOfficeMetadata, extractOpenDocumentMetadata, extractPdfMetadata, hasMetadata, generateMinimalCoreXml, generateMinimalAppXml, generateMinimalMetaXml } from '../utils/metadataExtractor'

// DocumentType is now imported from store

let wasmReady: Promise<unknown> | null = null
async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = init()
  }
  await wasmReady
}

function loadEditorPreference<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(`logscrub_editor_${key}`)
    if (stored !== null) return JSON.parse(stored) as T
  } catch {}
  return defaultValue
}

function saveEditorPreference<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`logscrub_editor_${key}`, JSON.stringify(value))
  } catch {}
}

type LineFilter = 'all' | 'changed' | 'unchanged'

interface EditorProps {
  input: string
  output: string
  onInputChange: (value: string) => void
  onView?: () => void
  showDiff?: boolean
  syncScroll?: boolean
  lineFilter?: LineFilter
  onLineFilterChange?: (value: LineFilter) => void
  onClearAll?: () => void
  onLeftResize?: () => void
  showLeftHandle?: boolean
}

export interface EditorHandle {
  scrollToLine: (line: number) => void
}

const LINE_HEIGHT = 20
const VIRTUAL_THRESHOLD = 500
const OVERSCAN = 15

function highlightLine(line: string, lineStart: number, replacements: ReplacementInfo[], type: 'original' | 'output', syntaxHighlight = false): React.ReactNode {
  const lineEnd = lineStart + line.length
  const relevantReplacements = replacements.filter(r =>
    r.start < lineEnd && r.end > lineStart && r.start >= 0
  )

  // No PII and no syntax highlighting - return plain text
  if (relevantReplacements.length === 0 && !syntaxHighlight) {
    return line || ' '
  }

  // With syntax highlighting but no PII - just apply syntax colors
  if (relevantReplacements.length === 0 && syntaxHighlight) {
    const segments = tokenizeWithPositions(line)
    return segments.map((seg, i) =>
      seg.className
        ? <span key={i} className={seg.className}>{seg.text}</span>
        : <span key={i}>{seg.text}</span>
    )
  }

  // Build a list of position ranges for PII
  const sortedReplacements = [...relevantReplacements].sort((a, b) => a.start - b.start)
  const piiRanges = sortedReplacements.map(rep => ({
    start: Math.max(0, rep.start - lineStart),
    end: Math.min(line.length, rep.end - lineStart),
    type: rep.pii_type
  }))

  // If no syntax highlighting, use original simple logic
  if (!syntaxHighlight) {
    const parts: React.ReactNode[] = []
    let lastEnd = 0

    for (const range of piiRanges) {
      if (range.start > lastEnd) {
        parts.push(<span key={`text-${lastEnd}`}>{line.slice(lastEnd, range.start)}</span>)
      }

      if (type === 'original') {
        parts.push(
          <span
            key={`hl-${range.start}`}
            className="bg-red-200 dark:bg-red-900/50 text-red-800 dark:text-red-200 rounded px-0.5"
            title={`${range.type}: will be replaced`}
          >
            {line.slice(range.start, range.end)}
          </span>
        )
      }
      lastEnd = range.end
    }

    if (lastEnd < line.length) {
      parts.push(<span key={`text-end`}>{line.slice(lastEnd)}</span>)
    }

    return parts.length > 0 ? parts : (line || ' ')
  }

  // With both syntax highlighting and PII - merge them
  const syntaxSegments = tokenizeWithPositions(line)
  const parts: React.ReactNode[] = []
  let keyIndex = 0

  // Check if a position is within a PII range
  const getPiiRange = (pos: number) => piiRanges.find(r => pos >= r.start && pos < r.end)

  for (const seg of syntaxSegments) {
    // Check if this segment overlaps with any PII
    const piiAtStart = getPiiRange(seg.start)

    if (piiAtStart && seg.start >= piiAtStart.start && seg.end <= piiAtStart.end) {
      // Entire segment is within PII - add background
      const bgClass = type === 'original'
        ? 'bg-red-200 dark:bg-red-900/50 rounded px-0.5'
        : ''
      const combinedClass = [seg.className, bgClass].filter(Boolean).join(' ')
      parts.push(
        <span
          key={keyIndex++}
          className={combinedClass || undefined}
          title={type === 'original' ? `${piiAtStart.type}: will be replaced` : undefined}
        >
          {seg.text}
        </span>
      )
    } else if (!getPiiRange(seg.start) && !getPiiRange(seg.end - 1)) {
      // Segment doesn't overlap with PII at all
      parts.push(
        seg.className
          ? <span key={keyIndex++} className={seg.className}>{seg.text}</span>
          : <span key={keyIndex++}>{seg.text}</span>
      )
    } else {
      // Segment partially overlaps - need to split it
      let pos = seg.start
      while (pos < seg.end) {
        const pii = getPiiRange(pos)
        if (pii) {
          const endPos = Math.min(seg.end, pii.end)
          const text = line.slice(pos, endPos)
          const bgClass = type === 'original'
            ? 'bg-red-200 dark:bg-red-900/50 rounded px-0.5'
            : ''
          const combinedClass = [seg.className, bgClass].filter(Boolean).join(' ')
          parts.push(
            <span
              key={keyIndex++}
              className={combinedClass || undefined}
              title={type === 'original' ? `${pii.type}: will be replaced` : undefined}
            >
              {text}
            </span>
          )
          pos = endPos
        } else {
          // Find where next PII starts or segment ends
          let nextPiiStart = seg.end
          for (const r of piiRanges) {
            if (r.start > pos && r.start < nextPiiStart) {
              nextPiiStart = r.start
            }
          }
          const text = line.slice(pos, nextPiiStart)
          parts.push(
            seg.className
              ? <span key={keyIndex++} className={seg.className}>{text}</span>
              : <span key={keyIndex++}>{text}</span>
          )
          pos = nextPiiStart
        }
      }
    }
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

function highlightOutputLine(line: string, replacements: ReplacementInfo[], lookup?: Map<string, ReplacementLookup>, syntaxHighlight = false): React.ReactNode {
  const patterns = replacements.map(r => ({
    pattern: r.replacement,
    type: r.pii_type
  }))

  if (patterns.length === 0) {
    if (syntaxHighlight) {
      const segments = tokenizeWithPositions(line)
      return segments.map((seg, i) =>
        seg.className
          ? <span key={i} className={seg.className}>{seg.text}</span>
          : <span key={i}>{seg.text}</span>
      )
    }
    return line || ' '
  }

  // Find all replacement positions in the line
  interface MatchInfo {
    start: number
    end: number
    type: string
    pattern: string
  }
  const matches: MatchInfo[] = []
  let searchPos = 0

  while (searchPos < line.length) {
    let earliestMatch: MatchInfo | null = null

    for (const p of patterns) {
      const idx = line.indexOf(p.pattern, searchPos)
      if (idx !== -1 && (earliestMatch === null || idx < earliestMatch.start)) {
        earliestMatch = { start: idx, end: idx + p.pattern.length, type: p.type, pattern: p.pattern }
      }
    }

    if (earliestMatch === null) break

    matches.push(earliestMatch)
    searchPos = earliestMatch.end
  }

  if (matches.length === 0) {
    if (syntaxHighlight) {
      const segments = tokenizeWithPositions(line)
      return segments.map((seg, i) =>
        seg.className
          ? <span key={i} className={seg.className}>{seg.text}</span>
          : <span key={i}>{seg.text}</span>
      )
    }
    return line || ' '
  }

  // If no syntax highlighting, use simple approach
  if (!syntaxHighlight) {
    const parts: React.ReactNode[] = []
    let lastEnd = 0
    let keyIndex = 0

    for (const match of matches) {
      if (match.start > lastEnd) {
        parts.push(<span key={`text-${keyIndex++}`}>{line.slice(lastEnd, match.start)}</span>)
      }

      const info = lookup?.get(match.pattern)
      const tooltipLines = [`Type: ${match.type}`]
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
          {line.slice(match.start, match.end)}
        </span>
      )
      lastEnd = match.end
    }

    if (lastEnd < line.length) {
      parts.push(<span key={`text-rest`}>{line.slice(lastEnd)}</span>)
    }

    return parts.length > 0 ? parts : (line || ' ')
  }

  // With syntax highlighting - merge syntax colors with replacement backgrounds
  const syntaxSegments = tokenizeWithPositions(line)
  const parts: React.ReactNode[] = []
  let keyIndex = 0

  const getMatch = (pos: number) => matches.find(m => pos >= m.start && pos < m.end)

  for (const seg of syntaxSegments) {
    const matchAtStart = getMatch(seg.start)

    if (matchAtStart && seg.start >= matchAtStart.start && seg.end <= matchAtStart.end) {
      // Entire segment is within a replacement
      const info = lookup?.get(matchAtStart.pattern)
      const tooltipLines = [`Type: ${matchAtStart.type}`]
      if (info) {
        tooltipLines.unshift(`Original: ${info.original}`)
        if (info.lines.length > 0) {
          const lineStr = info.lines.length > 5
            ? `${info.lines.slice(0, 5).join(', ')}... (${info.lines.length} total)`
            : info.lines.join(', ')
          tooltipLines.push(`Lines: ${lineStr}`)
        }
      }

      const bgClass = 'bg-green-200 dark:bg-green-900/50 rounded px-0.5 cursor-help'
      const combinedClass = [seg.className, bgClass].filter(Boolean).join(' ')
      parts.push(
        <span
          key={keyIndex++}
          className={combinedClass}
          title={tooltipLines.join('\n')}
        >
          {seg.text}
        </span>
      )
    } else if (!getMatch(seg.start) && !getMatch(seg.end - 1)) {
      // Segment doesn't overlap with any replacement
      parts.push(
        seg.className
          ? <span key={keyIndex++} className={seg.className}>{seg.text}</span>
          : <span key={keyIndex++}>{seg.text}</span>
      )
    } else {
      // Segment partially overlaps - split it
      let pos = seg.start
      while (pos < seg.end) {
        const match = getMatch(pos)
        if (match) {
          const endPos = Math.min(seg.end, match.end)
          const text = line.slice(pos, endPos)

          const info = lookup?.get(match.pattern)
          const tooltipLines = [`Type: ${match.type}`]
          if (info) {
            tooltipLines.unshift(`Original: ${info.original}`)
            if (info.lines.length > 0) {
              const lineStr = info.lines.length > 5
                ? `${info.lines.slice(0, 5).join(', ')}... (${info.lines.length} total)`
                : info.lines.join(', ')
              tooltipLines.push(`Lines: ${lineStr}`)
            }
          }

          const bgClass = 'bg-green-200 dark:bg-green-900/50 rounded px-0.5 cursor-help'
          const combinedClass = [seg.className, bgClass].filter(Boolean).join(' ')
          parts.push(
            <span
              key={keyIndex++}
              className={combinedClass}
              title={tooltipLines.join('\n')}
            >
              {text}
            </span>
          )
          pos = endPos
        } else {
          // Find where next match starts or segment ends
          let nextMatchStart = seg.end
          for (const m of matches) {
            if (m.start > pos && m.start < nextMatchStart) {
              nextMatchStart = m.start
            }
          }
          const text = line.slice(pos, nextMatchStart)
          parts.push(
            seg.className
              ? <span key={keyIndex++} className={seg.className}>{text}</span>
              : <span key={keyIndex++}>{text}</span>
          )
          pos = nextMatchStart
        }
      }
    }
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
  lineNumBg?: string
  lineNumText?: string
  paneText?: string
  syntaxHighlight?: boolean
}

function VirtualizedList({
  lines, lineOffsets, replacements, selectedLine, onLineClick,
  showDiff, type, scrollRef, onScroll, className, changedLines,
  originalLineNumbers, replacementLookup,
  lineNumBg = 'bg-gray-100 dark:bg-gray-900',
  lineNumText = 'text-gray-600 dark:text-gray-400',
  paneText = 'text-gray-900 dark:text-gray-100',
  syntaxHighlight = false
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
          <div className={`flex-shrink-0 sticky left-0 z-10 ${lineNumBg} text-right select-none border-r dark:border-gray-700`}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const lineNum = originalLineNumbers ? originalLineNumbers[virtualRow.index] : virtualRow.index
              const hasChange = changedLines?.has(lineNum)
              const lineColor = hasChange
                ? (type === 'output' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')
                : lineNumText
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
                content = highlightLine(line, lineOffsets[lineNum] ?? 0, replacements, 'original', syntaxHighlight)
              } else if (type === 'output') {
                content = showDiff && replacements.length > 0
                  ? highlightOutputLine(line, replacements, replacementLookup, syntaxHighlight)
                  : highlightLine(line, 0, [], 'output', syntaxHighlight)
              } else {
                content = showDiff && replacements.length > 0
                  ? highlightLine(line, lineOffsets[lineNum] ?? 0, replacements, 'original', syntaxHighlight)
                  : highlightLine(line, 0, [], 'original', syntaxHighlight)
              }
              return (
                <div
                  key={virtualRow.key}
                  className={`font-mono text-sm whitespace-pre ${paneText} cursor-pointer ${
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

const DONATION_DISMISSED_KEY = 'logscrub_donation_dismissed'

function shouldShowDonationModal(): boolean {
  try {
    return localStorage.getItem(DONATION_DISMISSED_KEY) !== 'true'
  } catch {
    return true
  }
}

function dismissDonationForever() {
  try {
    localStorage.setItem(DONATION_DISMISSED_KEY, 'true')
  } catch {}
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({ input, output, onInputChange, onView, showDiff: showDiffProp = true, syncScroll: syncScrollProp = true, lineFilter: lineFilterProp = 'all', onLineFilterChange, onClearAll, onLeftResize, showLeftHandle = false }, ref) {
  const { fileName, setFileName, replacements, analysisReplacements, terminalStyle, syntaxHighlight, stats, rules, consistencyMode, labelFormat, globalTemplate, documentType, setDocumentType } = useAppStore()
  const [showDonationModal, setShowDonationModal] = useState(false)
  const [showAIExplain, setShowAIExplain] = useState(false)
  const [splitRatio, setSplitRatio] = useState(() => loadEditorPreference('splitRatio', 50))
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const editorContainerRef = useRef<HTMLDivElement>(null)

  // Document preview state
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [showDocumentPreview, setShowDocumentPreview] = useState(true)
  const [scrubbedDocFile, setScrubbedDocFile] = useState<File | null>(null)
  const [showScrubbedPreview, setShowScrubbedPreview] = useState(true)
  const [previewHeight, setPreviewHeight] = useState(() => loadEditorPreference('previewHeight', 256))
  const [isResizingPreview, setIsResizingPreview] = useState(false)
  const [previewPage, setPreviewPage] = useState(0)
  const [previewScrollTop, setPreviewScrollTop] = useState(0)
  const [previewScrollLeft, setPreviewScrollLeft] = useState(0)
  const [showMetadataDialog, setShowMetadataDialog] = useState(false)
  const [documentMetadata, setDocumentMetadata] = useState<DocumentMetadata | null>(null)
  const [stripMetadataPreference, setStripMetadataPreference] = useState<boolean | null>(null)
  const originalPreviewRef = useRef<HTMLDivElement>(null)
  const scrubbedPreviewRef = useRef<HTMLDivElement>(null)

  // Terminal style classes
  const paneBg = terminalStyle ? 'bg-[#1e1e1e]' : 'bg-white dark:bg-gray-800'
  const paneText = terminalStyle ? 'text-[#d4d4d4]' : 'text-gray-900 dark:text-gray-100'
  const lineNumBg = terminalStyle ? 'bg-[#1e1e1e]' : 'bg-gray-100 dark:bg-gray-900'
  const lineNumText = terminalStyle ? 'text-[#858585]' : 'text-gray-600 dark:text-gray-400'
  const outputPaneBg = terminalStyle ? 'bg-[#1e1e1e]' : 'bg-gray-50 dark:bg-gray-900'
  const placeholderBg = terminalStyle ? 'bg-[#1e1e1e]' : 'bg-gray-50 dark:bg-gray-900'
  const placeholderText = terminalStyle ? 'text-[#858585]' : 'text-gray-600 dark:text-gray-400'

  const inputContainerRef = useRef<HTMLDivElement | null>(null)
  const outputContainerRef = useRef<HTMLDivElement | null>(null)
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [showDiff, setShowDiff] = useState(showDiffProp)
  const lineFilter = lineFilterProp
  const setLineFilter = onLineFilterChange || (() => {})
  const scrollingRef = useRef<'input' | 'output' | null>(null)

  useEffect(() => {
    setShowDiff(showDiffProp)
  }, [showDiffProp])

  useEffect(() => {
    if (output && replacements.length > 0) {
      setShowDiff(true)
    }
  }, [output, replacements.length])

  // Generate scrubbed document preview when output is available
  useEffect(() => {
    console.log('Scrubbed preview effect:', { hasOutput: !!output, hasDocFile: !!documentFile, documentType, replacementsCount: replacements.length })
    if (!output || !documentFile || !documentType || replacements.length === 0) {
      setScrubbedDocFile(null)
      return
    }

    const generateScrubbedDocPreview = async () => {
      try {
        console.log('Generating scrubbed preview for:', documentType)
        // Build replacement map
        const replacementMap = new Map<string, string>()
        for (const rep of replacements) {
          if (!replacementMap.has(rep.original)) {
            replacementMap.set(rep.original, rep.replacement)
          }
        }

        const buffer = new Uint8Array(await documentFile.arrayBuffer())
        let blob: Blob
        let mimeType: string
        let fileName: string

        if (documentType === 'pdf') {
          // Configure mupdf WASM location
          ;(globalThis as Record<string, unknown>).$libmupdf_wasm_Module = {
            locateFile: (path: string) => `/assets/${path}`
          }
          const mupdf = await import('mupdf')

          const doc = new mupdf.PDFDocument(buffer)
          const pageCount = doc.countPages()

          // Add redaction annotations for each PII match
          for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
            const page = doc.loadPage(pageIdx)
            const stext = page.toStructuredText('preserve-whitespace')

            for (const [original] of replacementMap) {
              const searchResults = stext.search(original)
              for (const quads of searchResults) {
                const annot = page.createAnnotation('Redact')
                annot.setQuadPoints(quads)
                annot.setColor([0, 0, 0])
              }
            }

            page.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_PIXELS, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)
          }

          const outputBuffer = doc.saveToBuffer()
          doc.destroy()

          blob = new Blob([outputBuffer.asUint8Array()], { type: 'application/pdf' })
          mimeType = 'application/pdf'
          fileName = 'scrubbed_preview.pdf'
        } else if (documentType === 'xlsx') {
          blob = await generateScrubbedExcel(buffer, replacementMap)
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          fileName = 'scrubbed_preview.xlsx'
        } else if (documentType === 'ods') {
          blob = await generateScrubbedOds(buffer, replacementMap)
          mimeType = 'application/vnd.oasis.opendocument.spreadsheet'
          fileName = 'scrubbed_preview.ods'
        } else if (documentType === 'docx') {
          blob = await generateScrubbedDocx(buffer, replacementMap)
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          fileName = 'scrubbed_preview.docx'
        } else if (documentType === 'odt') {
          blob = await generateScrubbedOdt(buffer, replacementMap)
          mimeType = 'application/vnd.oasis.opendocument.text'
          fileName = 'scrubbed_preview.odt'
        } else {
          return
        }

        const file = new File([blob], fileName, { type: mimeType })
        console.log('Scrubbed preview generated successfully:', fileName)
        setScrubbedDocFile(file)
      } catch (err) {
        console.error('Failed to generate scrubbed document preview:', err, documentType)
        setScrubbedDocFile(null)
      }
    }

    generateScrubbedDocPreview()
  }, [output, documentFile, documentType, replacements])

  // Save split ratio preference
  useEffect(() => {
    saveEditorPreference('splitRatio', splitRatio)
  }, [splitRatio])

  // Save preview height preference
  useEffect(() => {
    saveEditorPreference('previewHeight', previewHeight)
  }, [previewHeight])

  // Handle preview resize
  useEffect(() => {
    if (!isResizingPreview) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!originalPreviewRef.current) return
      const rect = originalPreviewRef.current.getBoundingClientRect()
      const newHeight = Math.max(100, Math.min(500, e.clientY - rect.top))
      setPreviewHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizingPreview(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingPreview])

  // Handle split resize
  useEffect(() => {
    if (!isResizingSplit) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!editorContainerRef.current) return
      const rect = editorContainerRef.current.getBoundingClientRect()
      const newRatio = Math.max(20, Math.min(80, ((e.clientX - rect.left) / rect.width) * 100))
      setSplitRatio(newRatio)
    }

    const handleMouseUp = () => {
      setIsResizingSplit(false)
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
  }, [isResizingSplit])

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
    if (lineFilter === 'all' || changedLines.size === 0) {
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
      const isChanged = changedLines.has(i)
      if ((lineFilter === 'changed' && isChanged) ||
          (lineFilter === 'unchanged' && !isChanged)) {
        lineNums.push(i)
        inLines.push(inputLines[i])
        if (outputLines[i] !== undefined) {
          outLines.push(outputLines[i])
        }
      }
    }
    return { filteredInputLines: inLines, filteredOutputLines: outLines, filteredLineNumbers: lineNums }
  }, [inputLines, outputLines, changedLines, lineFilter])

  const triggerDonationModal = useCallback(() => {
    if (shouldShowDonationModal()) {
      setTimeout(() => setShowDonationModal(true), 500)
    }
  }, [])

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
    triggerDonationModal()
  }

  const handleCopy = async () => {
    if (!output) return
    await navigator.clipboard.writeText(output)
    triggerDonationModal()
  }

  const generateAIExplanation = useCallback(() => {
    const prefix = labelFormat.prefix || '['
    const suffix = labelFormat.suffix || ']'
    const activeReplacements = replacements.length > 0 ? replacements : analysisReplacements

    // Determine document type for appropriate terminology
    const docTypeLabel = documentType === 'pdf' ? 'PDF document'
      : documentType === 'xlsx' ? 'Excel spreadsheet'
      : documentType === 'ods' ? 'LibreOffice spreadsheet'
      : documentType === 'docx' ? 'Word document'
      : documentType === 'odt' ? 'LibreOffice document'
      : 'log file'

    const docTypeShort = documentType === 'pdf' ? 'document'
      : documentType === 'xlsx' || documentType === 'ods' ? 'spreadsheet'
      : documentType === 'docx' || documentType === 'odt' ? 'document'
      : 'log'

    // Get detected types with counts and their strategies
    const detectedTypes = Object.entries(stats)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => {
        const rule = rules[type]
        const label = rule?.label || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        const strategy = rule?.strategy || 'label'
        const template = rule?.template || globalTemplate
        return { type, label, count, strategy, template }
      })
      .sort((a, b) => b.count - a.count)

    // Determine replacement strategies used
    const strategies = new Set<string>()
    detectedTypes.forEach(({ strategy }) => {
      strategies.add(strategy)
    })

    const strategyDescription = (strategy: string) => {
      switch (strategy) {
        case 'label': return 'Label'
        case 'fake': return 'Fake'
        case 'redact': return 'Redact'
        case 'template': return 'Template'
        default: return strategy
      }
    }

    let explanation = `## ${documentType === 'pdf' ? 'PDF' : documentType === 'xlsx' || documentType === 'ods' ? 'Spreadsheet' : documentType === 'docx' || documentType === 'odt' ? 'Document' : 'Log'} Redaction Context

This ${docTypeLabel} has been sanitized using LogScrub to remove personally identifiable information (PII) and sensitive data. Please analyze this ${docTypeShort} with the following context in mind:

### Replacement Strategies Used
`

    if (strategies.has('label')) {
      explanation += `- **Label tokens**: Sensitive values are replaced with tokens in the format \`${prefix}TYPE-N${suffix}\` where TYPE indicates the data category and N is a sequential number.
`
    }

    if (strategies.has('template')) {
      explanation += `- **Template tokens**: Sensitive values are replaced using a custom template format.
`
    }

    if (strategies.has('fake')) {
      explanation += `- **Fake data**: Some values are replaced with realistic but fake data (e.g., \`user1@example.com\`, \`192.0.2.x\` IP addresses).
`
    }

    if (strategies.has('redact')) {
      explanation += `- **Redacted blocks**: Some values are replaced with block characters (████) matching the original length.
`
    }

    if (consistencyMode && (strategies.has('label') || strategies.has('template') || strategies.has('fake'))) {
      explanation += `
**Consistency mode is ON**: The same original value always maps to the same replacement. For example, if you see the same token or fake value multiple times, it refers to the same original data throughout the ${docTypeShort}.
`
    } else if (!consistencyMode && (strategies.has('label') || strategies.has('template'))) {
      explanation += `
**Consistency mode is OFF**: Each occurrence gets a new number, so tokens with different numbers might refer to the same or different original values.
`
    }

    if (detectedTypes.length > 0) {
      explanation += `
### Detected & Replaced Data Types

| Type | Strategy | Count |
|------|----------|-------|
`
      detectedTypes.forEach(({ label, count, strategy }) => {
        explanation += `| ${label} | ${strategyDescription(strategy)} | ${count} |\n`
      })
    }

    // Add real examples from the session
    if (activeReplacements.length > 0) {
      explanation += `
### Actual Replacements from This Session

Here are examples of actual replacements made in this ${docTypeShort}:

| Original Value | Replaced With |
|----------------|---------------|
`
      // Get unique replacements, limit to ~10 examples
      const uniqueReplacements = new Map<string, string>()
      for (const rep of activeReplacements) {
        if (uniqueReplacements.size >= 10) break
        const key = rep.replacement
        if (!uniqueReplacements.has(key)) {
          uniqueReplacements.set(key, rep.original)
        }
      }

      uniqueReplacements.forEach((original, replacement) => {
        // Truncate long values for readability
        const truncOrig = original.length > 30 ? original.slice(0, 27) + '...' : original
        const truncRepl = replacement.length > 30 ? replacement.slice(0, 27) + '...' : replacement
        explanation += `| \`${truncOrig}\` | \`${truncRepl}\` |\n`
      })
    }

    explanation += `
### Interpretation Guidelines

1. **References**: When referring to specific replaced values, use the actual replacements shown above rather than describing generically.

2. **Correlations**: ${consistencyMode ? 'You CAN correlate replacements - same replacement = same original value.' : 'Each occurrence is replaced independently, so similar replacements might refer to different original values.'}

3. **Focus**: The ${docTypeShort} structure${documentType ? '' : ', timestamps, error messages,'} and non-sensitive data remain intact. Focus your analysis on ${documentType === 'pdf' ? 'the document content and context' : documentType === 'xlsx' || documentType === 'ods' ? 'data patterns and relationships' : documentType === 'docx' || documentType === 'odt' ? 'the document content and context' : 'patterns, errors, and flow'} rather than the specific redacted values.
`

    return explanation
  }, [stats, rules, labelFormat, consistencyMode, globalTemplate, documentType, replacements, analysisReplacements])

  const handleCopyAIExplanation = async () => {
    const explanation = generateAIExplanation()
    await navigator.clipboard.writeText(explanation)
  }

  const extractTextFromDocxXml = (xml: string): string => {
    // Parse DOCX XML (word/document.xml) and extract text content
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')

    // Extract text content from paragraphs
    const paragraphs: string[] = []
    let currentParagraph = ''

    // Track paragraph boundaries (w:p elements)
    const allNodes = doc.getElementsByTagName('*')
    for (let i = 0; i < allNodes.length; i++) {
      const node = allNodes[i]
      if (node.tagName === 'w:p') {
        if (currentParagraph) {
          paragraphs.push(currentParagraph)
          currentParagraph = ''
        }
      } else if (node.tagName === 'w:t' && node.textContent) {
        currentParagraph += node.textContent
      } else if (node.tagName === 'w:tab') {
        currentParagraph += '\t'
      } else if (node.tagName === 'w:br') {
        currentParagraph += '\n'
      }
    }

    if (currentParagraph) {
      paragraphs.push(currentParagraph)
    }

    return paragraphs.join('\n')
  }

  const extractTextFromOdtXml = (xml: string): string => {
    // Parse ODT XML (content.xml) and extract text content
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')

    const paragraphs: string[] = []
    let currentParagraph = ''

    const allNodes = doc.getElementsByTagName('*')
    for (let i = 0; i < allNodes.length; i++) {
      const node = allNodes[i]
      const localName = node.localName || node.tagName.split(':').pop()

      if (localName === 'p' || localName === 'h') {
        if (currentParagraph) {
          paragraphs.push(currentParagraph)
          currentParagraph = ''
        }
        // Get direct text content
        const textNodes = node.childNodes
        for (let j = 0; j < textNodes.length; j++) {
          const child = textNodes[j]
          if (child.nodeType === Node.TEXT_NODE && child.textContent) {
            currentParagraph += child.textContent
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const childLocal = (child as Element).localName || (child as Element).tagName.split(':').pop()
            if (childLocal === 'span' || childLocal === 's') {
              currentParagraph += child.textContent || ''
            } else if (childLocal === 'tab') {
              currentParagraph += '\t'
            } else if (childLocal === 'line-break') {
              currentParagraph += '\n'
            }
          }
        }
      }
    }

    if (currentParagraph) {
      paragraphs.push(currentParagraph)
    }

    return paragraphs.join('\n')
  }

  const extractTextFromOdsXml = (xml: string): string => {
    // Parse ODS XML (content.xml) and extract spreadsheet data
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')

    const sheets: string[] = []

    // Find all tables (sheets)
    const tables = doc.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'table')
    if (tables.length === 0) {
      // Fallback: just extract all text content
      return doc.documentElement?.textContent?.replace(/\s+/g, ' ').trim() || ''
    }

    for (let t = 0; t < tables.length; t++) {
      const table = tables[t]
      const tableName = table.getAttribute('table:name') || `Sheet${t + 1}`
      const rows: string[] = [`=== ${tableName} ===`]

      const tableRows = table.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'table-row')
      for (let r = 0; r < tableRows.length; r++) {
        const row = tableRows[r]
        const cells: string[] = []

        const tableCells = row.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:table:1.0', 'table-cell')
        for (let c = 0; c < tableCells.length; c++) {
          const cell = tableCells[c]
          // Get repeat count for empty cells
          const repeat = parseInt(cell.getAttribute('table:number-columns-repeated') || '1', 10)
          const cellText = cell.textContent?.trim() || ''

          // Only add repeats if there's content or limited repeats
          if (repeat > 1 && !cellText) {
            // Skip large empty cell spans
            if (repeat < 10) {
              for (let i = 0; i < repeat; i++) cells.push('')
            }
          } else {
            cells.push(cellText)
          }
        }

        // Skip completely empty rows
        if (cells.some(c => c)) {
          rows.push(cells.join('\t'))
        }
      }

      sheets.push(rows.join('\n'))
    }

    return sheets.join('\n\n')
  }

  const processCompressedFile = async (file: File): Promise<{ content: string; name: string; docType: DocumentType }> => {
    const ext = file.name.toLowerCase()

    // Handle DOCX files (ZIP archive containing XML)
    if (ext.endsWith('.docx')) {
      await ensureWasm()
      const buffer = await file.arrayBuffer()
      const data = new Uint8Array(buffer)

      const xml = decompress_zip_file(data, 'word/document.xml')
      const content = extractTextFromDocxXml(xml)
      const baseName = file.name.replace(/\.docx$/i, '.txt')
      return { content, name: baseName, docType: 'docx' }
    }

    // Handle ODT files (LibreOffice/OpenDocument Text)
    if (ext.endsWith('.odt')) {
      await ensureWasm()
      const buffer = await file.arrayBuffer()
      const data = new Uint8Array(buffer)

      const xml = decompress_zip_file(data, 'content.xml')
      const content = extractTextFromOdtXml(xml)
      const baseName = file.name.replace(/\.odt$/i, '.txt')
      return { content, name: baseName, docType: 'odt' }
    }

    // Handle ODS files (LibreOffice/OpenDocument Spreadsheet)
    if (ext.endsWith('.ods')) {
      await ensureWasm()
      const buffer = await file.arrayBuffer()
      const data = new Uint8Array(buffer)

      const xml = decompress_zip_file(data, 'content.xml')
      const content = extractTextFromOdsXml(xml)
      const baseName = file.name.replace(/\.ods$/i, '.txt')
      return { content, name: baseName, docType: 'ods' }
    }

    // Handle legacy XLS files - not supported
    if (ext.endsWith('.xls') && !ext.endsWith('.xlsx')) {
      throw new Error('Legacy XLS format is not supported. Please save the file as XLSX (Excel 2007+) format.')
    }

    // Handle Excel files (XLSX) via excelize-wasm
    if (ext.endsWith('.xlsx')) {
      const { init } = await import('excelize-wasm')
      const excelize = await init('/assets/excelize.wasm.gz')
      const buffer = new Uint8Array(await file.arrayBuffer())
      const f = excelize.OpenReader(buffer)

      if (f.error) {
        throw new Error(f.error)
      }

      let content = ''
      const sheets = f.GetSheetList().list
      for (const sheet of sheets) {
        const { result, error } = f.GetRows(sheet)
        if (error) continue
        content += `=== ${sheet} ===\n`
        content += result.map((row: string[]) => row.join('\t')).join('\n')
        content += '\n\n'
      }

      const baseName = file.name.replace(/\.xlsx?$/i, '.txt')
      return { content: content.trim(), name: baseName, docType: 'xlsx' }
    }

    // Handle PDF files via mupdf
    if (ext.endsWith('.pdf')) {
      // Configure mupdf WASM location before importing
      ;(globalThis as Record<string, unknown>).$libmupdf_wasm_Module = {
        locateFile: (path: string) => `/assets/${path}`
      }
      const mupdf = await import('mupdf')

      const buffer = new Uint8Array(await file.arrayBuffer())
      const doc = mupdf.PDFDocument.openDocument(buffer, 'application/pdf') as InstanceType<typeof mupdf.PDFDocument>

      let content = ''
      const pageCount = doc.countPages()
      for (let i = 0; i < pageCount; i++) {
        const page = doc.loadPage(i)
        const stext = page.toStructuredText('preserve-whitespace')
        content += stext.asText()
        content += '\n'
      }

      doc.destroy()

      const baseName = file.name.replace(/\.pdf$/i, '.txt')
      return { content: content.trim(), name: baseName, docType: 'pdf' }
    }

    if (ext.endsWith('.zip') || ext.endsWith('.gz') || ext.endsWith('.gzip')) {
      await ensureWasm()
      const buffer = await file.arrayBuffer()
      const data = new Uint8Array(buffer)

      if (ext.endsWith('.zip')) {
        const content = decompress_zip(data)
        const baseName = file.name.replace(/\.zip$/i, '')
        return { content, name: baseName, docType: null }
      }

      const content = decompress_gzip(data)
      const baseName = file.name.replace(/\.(gz|gzip)$/i, '')
      return { content, name: baseName, docType: null }
    }

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (ev) => resolve({ content: ev.target?.result as string, name: file.name, docType: null })
      reader.readAsText(file)
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const { content, name, docType } = await processCompressedFile(file)
        onInputChange(content)
        setFileName(name)
        setDocumentFile(docType ? file : null)
        setDocumentType(docType)
        setPreviewPage(0)
        // Reset metadata preference for new file
        setStripMetadataPreference(null)
        setDocumentMetadata(null)

        // Check for metadata in document files
        if (docType && file) {
          const metadata = await extractMetadataFromFile(file, docType)
          if (metadata && hasMetadata(metadata)) {
            setDocumentMetadata(metadata)
            setShowMetadataDialog(true)
          }
        }
      } catch (err) {
        console.error('File load error:', err)
        alert('Failed to read file. Make sure it\'s a valid file.')
      }
    }
  }

  const handleDownloadZip = async () => {
    if (!output) return
    await ensureWasm()
    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'sanitized_output'
    const ext = fileName?.match(/\.[^/.]+$/)?.[0] || '.txt'
    const zipData = compress_zip(output, `${baseName}${ext}`)
    const blob = new Blob([zipData], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    triggerDonationModal()
  }

  const handleDownloadGzip = async () => {
    if (!output) return
    await ensureWasm()
    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'sanitized_output'
    const ext = fileName?.match(/\.[^/.]+$/)?.[0] || '.txt'
    const gzipData = compress_gzip(output)
    const blob = new Blob([gzipData], { type: 'application/gzip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}${ext}.gz`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    triggerDonationModal()
  }

  // Extract metadata from a file (used during upload)
  const extractMetadataFromFile = async (file: File, docType: DocumentType): Promise<DocumentMetadata | null> => {
    await ensureWasm()

    try {
      if (docType === 'docx' || docType === 'xlsx') {
        return await extractOfficeMetadata(file, decompress_zip_file)
      } else if (docType === 'odt' || docType === 'ods') {
        return await extractOpenDocumentMetadata(file, decompress_zip_file)
      } else if (docType === 'pdf') {
        return await extractPdfMetadata(file)
      }
    } catch (err) {
      console.error('Failed to extract metadata:', err)
    }
    return null
  }

  // Download in original format with PII replaced/redacted
  const handleDownloadOriginalFormat = async () => {
    if (!output || !documentFile || !documentType) return

    // Use stored preference (true = strip, false = keep, null = no metadata)
    const shouldStrip = stripMetadataPreference === true
    await performDownload(shouldStrip)
  }

  // Handle metadata dialog choices (shown on file upload)
  const handleMetadataKeep = () => {
    setShowMetadataDialog(false)
    setStripMetadataPreference(false)
  }

  const handleMetadataRemove = () => {
    setShowMetadataDialog(false)
    setStripMetadataPreference(true)
  }

  const handleMetadataCancel = () => {
    setShowMetadataDialog(false)
    // Cancel = keep metadata by default
    setStripMetadataPreference(false)
  }

  // Actually perform the download
  const performDownload = async (stripMetadata: boolean) => {
    if (!output || !documentFile || !documentType) return

    try {
      // Build replacement map from the scrubbing results
      const replacementMap = new Map<string, string>()
      for (const rep of replacements) {
        if (!replacementMap.has(rep.original)) {
          replacementMap.set(rep.original, rep.replacement)
        }
      }

      const buffer = new Uint8Array(await documentFile.arrayBuffer())
      let resultBlob: Blob
      let downloadName: string

      // Get base name without extension for proper renaming
      const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'sanitized_output'

      if (documentType === 'xlsx') {
        resultBlob = await generateScrubbedExcel(buffer, replacementMap, stripMetadata)
        downloadName = `sanitized_${baseName}.xlsx`
      } else if (documentType === 'ods') {
        resultBlob = await generateScrubbedOds(buffer, replacementMap, stripMetadata)
        downloadName = `sanitized_${baseName}.ods`
      } else if (documentType === 'docx') {
        resultBlob = await generateScrubbedDocx(buffer, replacementMap, stripMetadata)
        downloadName = `sanitized_${baseName}.docx`
      } else if (documentType === 'odt') {
        resultBlob = await generateScrubbedOdt(buffer, replacementMap, stripMetadata)
        downloadName = `sanitized_${baseName}.odt`
      } else if (documentType === 'pdf') {
        resultBlob = await generateScrubbedPdf(buffer, replacementMap, stripMetadata)
        downloadName = `sanitized_${baseName}.pdf`
      } else {
        return
      }

      const url = URL.createObjectURL(resultBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = downloadName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      triggerDonationModal()
    } catch (err) {
      console.error('Format preservation error:', err)
      alert('Failed to generate original format. Downloading as plain text instead.')
      handleDownload()
    }
  }

  // Generate scrubbed Excel file with PII replaced in cells
  const generateScrubbedExcel = async (buffer: Uint8Array, replacementMap: Map<string, string>, stripMetadata: boolean = false): Promise<Blob> => {
    const { init } = await import('excelize-wasm')
    const excelize = await init('/assets/excelize.wasm.gz')
    const f = excelize.OpenReader(buffer)

    if (f.error) {
      throw new Error(f.error)
    }

    const sheetList = f.GetSheetList().list
    for (const sheetName of sheetList) {
      const { result: rows, error } = f.GetRows(sheetName)
      if (error || !rows) continue

      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx]
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          let cellValue = row[colIdx]
          if (!cellValue) continue

          // Apply all replacements to this cell
          let modified = false
          for (const [original, replacement] of replacementMap) {
            if (cellValue.includes(original)) {
              cellValue = cellValue.split(original).join(replacement)
              modified = true
            }
          }

          if (modified) {
            // Convert 0-indexed column to Excel column letter
            const colLetter = String.fromCharCode(65 + colIdx)
            const cellName = `${colLetter}${rowIdx + 1}`
            f.SetCellStr(sheetName, cellName, cellValue)
          }
        }
      }
    }

    // Write to buffer
    const { buffer: outputBuffer, error: writeError } = f.WriteToBuffer()
    if (writeError) {
      throw new Error(writeError)
    }

    // Strip metadata if requested
    if (stripMetadata) {
      await ensureWasm()
      const { compress_zip_replace } = await import('../wasm-core/wasm_core')
      // Convert to Uint8Array (outputBuffer is ArrayBuffer-like)
      let result = outputBuffer instanceof Uint8Array ? outputBuffer : new Uint8Array(outputBuffer as ArrayBuffer)

      // Replace core.xml with minimal version
      try {
        result = compress_zip_replace(result, 'docProps/core.xml', generateMinimalCoreXml())
      } catch { /* file might not exist */ }

      // Replace app.xml with minimal version
      try {
        result = compress_zip_replace(result, 'docProps/app.xml', generateMinimalAppXml())
      } catch { /* file might not exist */ }

      return new Blob([result], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    }

    return new Blob([outputBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  }

  // Generate scrubbed DOCX file with PII replaced in XML
  const generateScrubbedDocx = async (buffer: Uint8Array, replacementMap: Map<string, string>, stripMetadata: boolean = false): Promise<Blob> => {
    await ensureWasm()
    const { decompress_zip_file, compress_zip_replace } = await import('../wasm-core/wasm_core')

    // Get the document.xml content
    let documentXml = decompress_zip_file(buffer, 'word/document.xml')

    // Apply replacements to the XML content
    for (const [original, replacement] of replacementMap) {
      // Escape special XML characters in the replacement
      const escapedReplacement = replacement
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

      // Also escape in original for matching
      const escapedOriginal = original
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

      documentXml = documentXml.split(escapedOriginal).join(escapedReplacement)
    }

    // Repackage the DOCX with modified XML
    let outputBuffer = compress_zip_replace(buffer, 'word/document.xml', documentXml)

    // Strip metadata if requested
    if (stripMetadata) {
      // Replace core.xml with minimal version
      try {
        outputBuffer = compress_zip_replace(outputBuffer, 'docProps/core.xml', generateMinimalCoreXml())
      } catch { /* file might not exist */ }

      // Replace app.xml with minimal version
      try {
        outputBuffer = compress_zip_replace(outputBuffer, 'docProps/app.xml', generateMinimalAppXml())
      } catch { /* file might not exist */ }
    }

    return new Blob([outputBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  }

  // Generate scrubbed ODT file with PII replaced in XML
  const generateScrubbedOdt = async (buffer: Uint8Array, replacementMap: Map<string, string>, stripMetadata: boolean = false): Promise<Blob> => {
    await ensureWasm()
    const { decompress_zip_file, compress_zip_replace } = await import('../wasm-core/wasm_core')

    // Get the content.xml content
    let contentXml = decompress_zip_file(buffer, 'content.xml')

    // Apply replacements to the XML content
    for (const [original, replacement] of replacementMap) {
      // Escape special XML characters in the replacement
      const escapedReplacement = replacement
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

      // Also escape in original for matching
      const escapedOriginal = original
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

      contentXml = contentXml.split(escapedOriginal).join(escapedReplacement)
    }

    // Repackage the ODT with modified XML
    let outputBuffer = compress_zip_replace(buffer, 'content.xml', contentXml)

    // Strip metadata if requested
    if (stripMetadata) {
      try {
        outputBuffer = compress_zip_replace(outputBuffer, 'meta.xml', generateMinimalMetaXml())
      } catch { /* file might not exist */ }
    }

    return new Blob([outputBuffer], { type: 'application/vnd.oasis.opendocument.text' })
  }

  // Generate scrubbed ODS file with PII replaced in XML
  const generateScrubbedOds = async (buffer: Uint8Array, replacementMap: Map<string, string>, stripMetadata: boolean = false): Promise<Blob> => {
    await ensureWasm()
    const { decompress_zip_file, compress_zip_replace } = await import('../wasm-core/wasm_core')

    // Get the content.xml content
    let contentXml = decompress_zip_file(buffer, 'content.xml')

    // Apply replacements to the XML content
    for (const [original, replacement] of replacementMap) {
      // Escape special XML characters in the replacement
      const escapedReplacement = replacement
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

      // Also escape in original for matching
      const escapedOriginal = original
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

      contentXml = contentXml.split(escapedOriginal).join(escapedReplacement)
    }

    // Repackage the ODS with modified XML
    let outputBuffer = compress_zip_replace(buffer, 'content.xml', contentXml)

    // Strip metadata if requested
    if (stripMetadata) {
      try {
        outputBuffer = compress_zip_replace(outputBuffer, 'meta.xml', generateMinimalMetaXml())
      } catch { /* file might not exist */ }
    }

    return new Blob([outputBuffer], { type: 'application/vnd.oasis.opendocument.spreadsheet' })
  }

  // Generate scrubbed PDF with redaction boxes over PII
  const generateScrubbedPdf = async (buffer: Uint8Array, replacementMap: Map<string, string>, stripMetadata: boolean = false): Promise<Blob> => {
    // Configure mupdf WASM location before importing
    ;(globalThis as Record<string, unknown>).$libmupdf_wasm_Module = {
      locateFile: (path: string) => `/assets/${path}`
    }
    const mupdf = await import('mupdf')

    const doc = new mupdf.PDFDocument(buffer)
    const pageCount = doc.countPages()

    // For each page, find PII text and add redaction annotations
    for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
      const page = doc.loadPage(pageIdx)
      const stext = page.toStructuredText('preserve-whitespace')

      // Search for each original PII text
      for (const [original] of replacementMap) {
        const searchResults = stext.search(original)

        // Add redaction annotation for each match
        // searchResults is Quad[][] - array of matches, each match has array of quads
        // Process each quad individually to avoid oversized redaction boxes
        // when text wraps across multiple lines
        for (const quads of searchResults) {
          for (const quad of quads) {
            const annot = page.createAnnotation('Redact')
            annot.setQuadPoints([quad])
            // Set redaction fill color to black
            annot.setColor([0, 0, 0])
          }
        }
      }

      // Apply redactions on this page (with black boxes)
      page.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_PIXELS, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)
    }

    // Strip metadata if requested
    if (stripMetadata) {
      try {
        const trailer = doc.getTrailer()
        if (trailer) {
          // Create an empty Info dictionary
          const emptyInfo = doc.newDictionary()
          trailer.put('Info', emptyInfo)
        }
      } catch (err) {
        console.error('Failed to strip PDF metadata:', err)
      }
    }

    // Save the modified PDF
    const outputBuffer = doc.saveToBuffer()
    doc.destroy()

    return new Blob([outputBuffer.asUint8Array()], { type: 'application/pdf' })
  }

  const handleScroll = useCallback((source: 'input' | 'output') => {
    if (!syncScrollProp || lineFilter !== 'all') return
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
  }, [syncScrollProp, lineFilter])

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
        const { content, name, docType } = await processCompressedFile(file)
        onInputChange(content)
        setFileName(name)
        setDocumentFile(docType ? file : null)
        setDocumentType(docType)
        setPreviewPage(0)
        // Reset metadata preference for new file
        setStripMetadataPreference(null)
        setDocumentMetadata(null)

        // Check for metadata in document files
        if (docType && file) {
          const metadata = await extractMetadataFromFile(file, docType)
          if (metadata && hasMetadata(metadata)) {
            setDocumentMetadata(metadata)
            setShowMetadataDialog(true)
          }
        }
      } catch {
        alert('Failed to read file. Make sure it\'s a valid text, zip, or gzip file.')
      }
    }
  }

  const renderNonVirtualLines = (lines: string[], type: 'input' | 'output' | 'analysis', reps: ReplacementInfo[], changed?: Set<number>, lineNums?: number[]) => (
    <div className="inline-flex min-w-full">
      <div className={`flex-shrink-0 sticky left-0 z-10 ${lineNumBg} text-right select-none border-r dark:border-gray-700 py-2`}>
        {lines.map((_, i) => {
          const lineNum = lineNums ? lineNums[i] : i
          const hasChange = changed?.has(lineNum)
          const lineColor = hasChange
            ? (type === 'output' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')
            : lineNumText
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
              className={`font-mono text-sm whitespace-pre ${paneText} cursor-pointer h-5 ${
                selectedLine === lineNum ? 'bg-yellow-100 dark:bg-yellow-900/50' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
              onClick={() => handleLineClick(lineNum)}
            >
              {type === 'analysis'
                ? highlightLine(line, lineOffsets[lineNum] ?? 0, reps, 'original', syntaxHighlight)
                : type === 'output'
                  ? (showDiff && reps.length > 0
                      ? highlightOutputLine(line, reps, replacementLookup, syntaxHighlight)
                      : highlightLine(line, 0, [], 'output', syntaxHighlight))
                  : (showDiff && reps.length > 0
                      ? highlightLine(line, lineOffsets[lineNum] ?? 0, reps, 'original', syntaxHighlight)
                      : highlightLine(line, 0, [], 'original', syntaxHighlight))
              }
            </div>
          )
        })}
      </div>
    </div>
  )

  const hasChanges = changedLines.size > 0

  // Background color for title tab (matches the textarea/content area)
  const titleBg = paneBg

  return (
    <div ref={editorContainerRef} className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
      <div className="flex flex-col min-h-0 min-w-0 relative w-full md:w-0" style={{ flex: `0 0 ${splitRatio}%` }}>
        {/* Resize handle on left edge of Original panel (controls Rules panel width) */}
        {showLeftHandle && onLeftResize && (
          <div
            className="hidden md:block absolute top-0 left-0 w-2 h-full cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors z-10"
            onMouseDown={(e) => {
              e.preventDefault()
              onLeftResize()
            }}
            title="Drag to resize"
          />
        )}
        <div className="flex items-center justify-between mb-0 flex-shrink-0 relative z-10">
          <label
            className={`text-sm font-medium text-gray-700 dark:text-gray-300 ${titleBg} px-2 py-0.5 rounded-t border-t border-l border-r dark:border-gray-600 -mb-px ml-3 cursor-help`}
            title={[
              fileName ? `File: ${fileName}` : null,
              `${inputLines.length.toLocaleString()} lines`,
              lineFilter !== 'all' ? `Showing: ${filteredInputLines.length.toLocaleString()} ${lineFilter}` : null
            ].filter(Boolean).join('\n')}
          >
            Original
          </label>
          <div className="flex gap-2 pr-1">
            {hasChanges && output && (
              <select
                value={lineFilter}
                onChange={(e) => setLineFilter(e.target.value as 'all' | 'changed' | 'unchanged')}
                className="text-[10px] border dark:border-gray-600 rounded px-0.5 py-0 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 leading-tight"
                title={`All: ${inputLines.length.toLocaleString()} | Changed: ${changedLines.size.toLocaleString()} | Unchanged: ${(inputLines.length - changedLines.size).toLocaleString()}`}
              >
                <option value="all">All</option>
                <option value="changed">Chg ({changedLines.size})</option>
                <option value="unchanged">Unchg</option>
              </select>
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
                accept=".log,.txt,.json,.xml,.csv,.zip,.gz,.gzip,.pdf,.xlsx,.docx,.odt,.ods"
                className="hidden"
              />
            </label>
            {documentType && (
              <button
                onClick={() => setShowDocumentPreview(!showDocumentPreview)}
                className={`text-xs ${showDocumentPreview ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'} hover:text-blue-700 dark:hover:text-blue-300`}
                title={showDocumentPreview ? 'Hide document preview' : 'Show document preview'}
              >
                {showDocumentPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
            )}
            {input && (
              <button
                onClick={() => {
                  onInputChange('')
                  setFileName(null)
                  setSelectedLine(null)
                  setDocumentFile(null)
                  setDocumentType(null)
                  setScrubbedDocFile(null)
                }}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Clear the input text"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        {showDocumentPreview && documentType && documentFile && (
          <div
            ref={originalPreviewRef}
            className="flex-shrink-0 border dark:border-gray-600 rounded-lg overflow-hidden mb-2 relative"
            style={{ height: previewHeight }}
          >
            <DocumentPreview
              file={documentFile}
              fileType={documentType}
              page={syncScrollProp ? previewPage : undefined}
              onPageChange={syncScrollProp ? setPreviewPage : undefined}
              scrollTop={syncScrollProp ? previewScrollTop : undefined}
              scrollLeft={syncScrollProp ? previewScrollLeft : undefined}
              onScroll={syncScrollProp ? (top, left) => { setPreviewScrollTop(top); setPreviewScrollLeft(left) } : undefined}
              replacements={replacements.length > 0 ? replacements : analysisReplacements}
            />
            <div
              className="absolute bottom-0 left-0 right-0 h-3 cursor-row-resize bg-gray-300/50 dark:bg-gray-600/50 hover:bg-blue-500/40 active:bg-blue-500/50 transition-colors flex items-center justify-center"
              onMouseDown={(e) => {
                e.preventDefault()
                setIsResizingPreview(true)
              }}
              title="Drag to resize preview"
            >
              <div className="w-12 h-1 bg-gray-400 dark:bg-gray-500 rounded-full" />
            </div>
          </div>
        )}

        {!output && analysisReplacements.length === 0 ? (
          <div className="flex-1 min-h-0 relative">
            <textarea
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              aria-label="Original log content - paste or type your log text here"
              className={`w-full h-full p-4 font-mono text-sm border dark:border-gray-600 rounded-b-lg rounded-tr-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${paneBg} ${paneText}`}
            />
            {!input && (
              <div className={`absolute inset-0 p-4 pointer-events-none ${terminalStyle ? 'text-[#858585]' : 'text-gray-600 dark:text-gray-400'}`}>
                <div className="font-mono text-sm space-y-2">
                  <p className="font-semibold">Getting Started:</p>
                  <p>1. Paste logs here, or use <span className="text-blue-600 dark:text-blue-400">Upload</span>/drag & drop</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 ml-3">Supports: txt, log, json, csv, pdf, docx, xlsx, odt, ods, zip, gz</p>
                  <p>2. Click <span className="text-purple-600 dark:text-purple-400">Analyze</span> to detect PII and get rule suggestions</p>
                  <p>3. Enable/disable rules in Detection Rules panel</p>
                  <p>4. Click <span className="text-blue-600 dark:text-blue-400">Scrub</span> to apply replacements</p>
                  <p>5. Use diff view, fullscreen, and other tools to review, then Copy or Download</p>
                  <p className="text-yellow-600 dark:text-yellow-500 mt-2">⚠ Always double-check for PII before sharing the file!</p>
                </div>
              </div>
            )}
          </div>
        ) : !output && analysisReplacements.length > 0 ? (
          useVirtualScrolling ? (
            <div className={`flex-1 min-h-0 border-2 border-purple-400 dark:border-purple-600 rounded-b-lg rounded-tr-lg ${paneBg}`}>
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
                lineNumBg={lineNumBg}
                lineNumText={lineNumText}
                paneText={paneText}
                syntaxHighlight={syntaxHighlight}
              />
            </div>
          ) : (
            <div
              ref={inputContainerRef}
              className={`flex-1 min-h-0 border-2 border-purple-400 dark:border-purple-600 rounded-b-lg rounded-tr-lg overflow-auto ${paneBg}`}
            >
              {renderNonVirtualLines(inputLines, 'analysis', analysisReplacements, changedLines)}
            </div>
          )
        ) : useVirtualScrolling ? (
          <div className={`flex-1 min-h-0 border dark:border-gray-600 rounded-b-lg rounded-tr-lg ${paneBg}`}>
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
              lineNumBg={lineNumBg}
              lineNumText={lineNumText}
              paneText={paneText}
              syntaxHighlight={syntaxHighlight}
            />
          </div>
        ) : (
          <div
            ref={inputContainerRef}
            onScroll={() => handleScroll('input')}
            className={`flex-1 min-h-0 border dark:border-gray-600 rounded-b-lg rounded-tr-lg overflow-auto ${paneBg}`}
          >
            {renderNonVirtualLines(filteredInputLines, 'input', replacements, changedLines, filteredLineNumbers)}
          </div>
        )}
        {/* Resize handle on right edge of Original panel */}
        <div
          className="hidden md:block absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault()
            setIsResizingSplit(true)
          }}
          title="Drag to resize"
        />
      </div>

      <div className="flex flex-col min-h-0 min-w-0 relative flex-1">
        {/* Resize handle on left edge of Scrubbed panel */}
        <div
          className="hidden md:block absolute top-0 left-0 w-2 h-full cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors z-10"
          onMouseDown={(e) => {
            e.preventDefault()
            setIsResizingSplit(true)
          }}
          title="Drag to resize"
        />
        <div className="flex items-center justify-between mb-0 flex-shrink-0 relative z-10">
          <label
            className={`text-sm font-medium ${output ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'} ${output ? outputPaneBg : placeholderBg} px-2 py-0.5 rounded-t border-t border-l border-r dark:border-gray-600 -mb-px ml-3 ${output ? 'cursor-help' : ''}`}
            title={output ? [
              `${outputLines.length.toLocaleString()} lines`,
              lineFilter !== 'all' ? `Showing: ${filteredOutputLines.length.toLocaleString()} ${lineFilter}` : null
            ].filter(Boolean).join('\n') : undefined}
          >
            Scrubbed
          </label>
          <div className="flex gap-2 pr-1">
            {onClearAll && (input || output) && (
              <button
                onClick={onClearAll}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Clear all input and output text"
              >
                Clear All
              </button>
            )}
            {scrubbedDocFile && (
              <button
                onClick={() => setShowScrubbedPreview(!showScrubbedPreview)}
                className={`text-xs ${showScrubbedPreview ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'} hover:text-blue-700 dark:hover:text-blue-300`}
                title={showScrubbedPreview ? 'Hide redacted preview' : 'Show redacted preview'}
              >
                {showScrubbedPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
            )}
          {output && (
            <>
              {onView && !documentType && (
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
              {documentType ? (
                <button
                  onClick={handleDownloadOriginalFormat}
                  className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 flex items-center gap-1"
                  title={`Download as ${documentType.toUpperCase()} with PII ${documentType === 'pdf' ? 'redacted' : 'replaced'}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download {documentType.toUpperCase()}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCopy}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </button>
                  <button
                    onClick={handleDownload}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                    title="Download as plain text"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    txt
                  </button>
                  <button
                    onClick={handleDownloadZip}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                    title="Download as compressed zip"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    zip
                  </button>
                  <button
                    onClick={handleDownloadGzip}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
                    title="Download as gzip compressed"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    gz
                  </button>
                </>
              )}
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <button
                onClick={() => setShowAIExplain(true)}
                className="text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 flex items-center gap-1"
                title="Generate explanation prompt for AI assistants"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                AI Explain
              </button>
            </>
          )}
          </div>
        </div>

        {showScrubbedPreview && scrubbedDocFile && documentType && (
          <div
            ref={scrubbedPreviewRef}
            className="flex-shrink-0 border dark:border-gray-600 rounded-lg overflow-hidden mb-2 relative"
            style={{ height: previewHeight }}
          >
            <DocumentPreview
              file={scrubbedDocFile}
              fileType={documentType}
              page={syncScrollProp ? previewPage : undefined}
              onPageChange={syncScrollProp ? setPreviewPage : undefined}
              scrollTop={syncScrollProp ? previewScrollTop : undefined}
              scrollLeft={syncScrollProp ? previewScrollLeft : undefined}
              onScroll={syncScrollProp ? (top, left) => { setPreviewScrollTop(top); setPreviewScrollLeft(left) } : undefined}
            />
            <div
              className="absolute bottom-0 left-0 right-0 h-3 cursor-row-resize bg-gray-300/50 dark:bg-gray-600/50 hover:bg-blue-500/40 active:bg-blue-500/50 transition-colors flex items-center justify-center"
              onMouseDown={(e) => {
                e.preventDefault()
                setIsResizingPreview(true)
              }}
              title="Drag to resize preview"
            >
              <div className="w-12 h-1 bg-gray-400 dark:bg-gray-500 rounded-full" />
            </div>
          </div>
        )}

        {!output ? (
          <div className={`flex-1 min-h-0 p-4 font-mono text-sm border dark:border-gray-600 rounded-b-lg rounded-tr-lg ${placeholderBg} ${placeholderText} overflow-auto`}>
            Scrubbed output will appear here...
          </div>
        ) : useVirtualScrolling ? (
          <div className={`flex-1 min-h-0 border dark:border-gray-600 rounded-b-lg rounded-tr-lg ${outputPaneBg}`}>
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
              lineNumBg={lineNumBg}
              lineNumText={lineNumText}
              paneText={paneText}
              syntaxHighlight={syntaxHighlight}
            />
          </div>
        ) : (
          <div
            ref={outputContainerRef}
            onScroll={() => handleScroll('output')}
            className={`flex-1 min-h-0 border dark:border-gray-600 rounded-b-lg rounded-tr-lg overflow-auto ${outputPaneBg}`}
          >
            {renderNonVirtualLines(filteredOutputLines, 'output', replacements, changedLines, filteredLineNumbers)}
          </div>
        )}
      </div>

      {showDonationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDonationModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-4xl mb-4">☕</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Enjoying LogScrub?
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                We want to keep this tool free and ad-free for everyone. If you find it useful, please consider supporting us with a coffee!
              </p>
              <a
                href="https://ko-fi.com/logscrub"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-3 bg-[#FF5E5B] hover:bg-[#e54e4b] text-white font-medium rounded-lg mb-4 transition-colors"
              >
                Buy us a coffee on Ko-fi
              </a>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowDonationModal(false)}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    dismissDonationForever()
                    setShowDonationModal(false)
                  }}
                  className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400"
                >
                  Don't show this again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAIExplain && (
        <Modal onClose={() => setShowAIExplain(false)} title="AI Explanation Prompt" maxWidth="max-w-3xl">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Copy this explanation and paste it into your AI assistant (ChatGPT, Claude, etc.) before sharing your scrubbed {documentType === 'pdf' ? 'PDF' : documentType === 'xlsx' || documentType === 'ods' ? 'spreadsheet' : documentType === 'docx' || documentType === 'odt' ? 'document' : 'log'}. This helps the AI understand how your {documentType ? 'file' : 'log'} was sanitized.
            </p>

            <div className="relative">
              <pre className="p-4 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 overflow-auto max-h-80 whitespace-pre-wrap font-mono">
                {generateAIExplanation()}
              </pre>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {consistencyMode ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Consistency mode enabled - same values have same tokens
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-500">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Consistency mode off - same values may have different tokens
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAIExplain(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    await handleCopyAIExplanation()
                    setShowAIExplain(false)
                  }}
                  className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy & Close
                </button>
              </div>
            </div>

            <div className="pt-3 border-t dark:border-gray-700">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                <strong>Tip:</strong> Paste this explanation first, then share your scrubbed {documentType ? 'document' : 'log'}. The AI will be able to reference replacements like{' '}
                {(() => {
                  // Try to get a real example from the session first
                  const activeReps = replacements.length > 0 ? replacements : analysisReplacements
                  if (activeReps.length > 0) {
                    const example = activeReps[0].replacement
                    return <code>{example.length > 25 ? example.slice(0, 22) + '...' : example}</code>
                  }
                  // Fallback to synthetic example
                  const firstDetected = Object.entries(stats).find(([, count]) => count > 0)
                  if (!firstDetected) return <code>{labelFormat.prefix}EMAIL-1{labelFormat.suffix}</code>
                  const [type] = firstDetected
                  const rule = rules[type]
                  const strategy = rule?.strategy || 'label'
                  const template = rule?.template || globalTemplate
                  const upperType = type.toUpperCase()
                  let example: string
                  switch (strategy) {
                    case 'fake':
                      example = type === 'email' ? 'user1@example.com' : type === 'ipv4' ? '192.0.2.1' : `[fake ${type}]`
                      break
                    case 'redact':
                      example = '████████'
                      break
                    case 'template':
                      example = template ? template.replace('{T}', upperType).replace('{N}', '1') : `<${upperType}-1>`
                      break
                    default:
                      example = `${labelFormat.prefix || '['}${upperType}-1${labelFormat.suffix || ']'}`
                  }
                  return <code>{example}</code>
                })()}{' '}
                when discussing specific values.
              </p>
            </div>
          </div>
        </Modal>
      )}

      {showMetadataDialog && documentMetadata && documentType && (
        <MetadataDialog
          metadata={documentMetadata}
          documentType={documentType}
          onKeep={handleMetadataKeep}
          onRemove={handleMetadataRemove}
          onCancel={handleMetadataCancel}
        />
      )}
    </div>
  )
})
