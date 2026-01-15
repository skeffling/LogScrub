import { useState, useCallback, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

const LINE_HEIGHT = 24 // slightly taller for fullscreen readability
const OVERSCAN = 20
const VIRTUALIZATION_THRESHOLD = 5000 // Use virtualization for files with more than this many lines

interface FullscreenViewerProps {
  title: string
  content: string
  fileName?: string | null
  onClose: () => void
  onDownload?: () => void
}

export function FullscreenViewer({ title, content, fileName, onClose, onDownload }: FullscreenViewerProps) {
  const lines = content.split('\n')
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null)
  const [copiedLineIndex, setCopiedLineIndex] = useState<number | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)

  const useVirtualization = lines.length > VIRTUALIZATION_THRESHOLD

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: OVERSCAN,
    enabled: useVirtualization,
  })

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
  }

  const handleCopyLine = useCallback(async (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const lineContent = lines[index]
    await navigator.clipboard.writeText(lineContent)
    setCopiedLineIndex(index)
    setTimeout(() => setCopiedLineIndex(null), 1500)
  }, [lines])

  const renderLineNumber = (index: number) => {
    const isHovered = hoveredLineIndex === index
    const isCopied = copiedLineIndex === index
    return (
      <div
        key={index}
        className="px-2 font-mono text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-end gap-1"
        style={{ height: LINE_HEIGHT }}
        onMouseEnter={() => setHoveredLineIndex(index)}
        onMouseLeave={() => setHoveredLineIndex(null)}
      >
        {isHovered && !isCopied && (
          <button
            onClick={(e) => handleCopyLine(index, e)}
            className="opacity-60 hover:opacity-100 text-gray-500 dark:text-gray-400"
            title="Copy line"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        )}
        {isCopied && (
          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        <span className="min-w-[3ch] text-gray-600 dark:text-gray-400">{index + 1}</span>
      </div>
    )
  }

  const renderLine = (index: number) => {
    const line = lines[index]
    return (
      <div
        key={index}
        className="font-mono text-sm whitespace-pre text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50"
        style={{ height: LINE_HEIGHT }}
      >
        {line || ' '}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title} {fileName && <span className="text-gray-600 dark:text-gray-400 text-sm" title={fileName}>({fileName.length > 8 ? fileName.slice(0, 8) + '…' : fileName})</span>}
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            {lines.length.toLocaleString()} lines
          </span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Copy
          </button>
          {onDownload && (
            <button
              onClick={onDownload}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Download
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>

      {useVirtualization ? (
        // Virtualized rendering for large files
        <div
          ref={parentRef}
          className="flex-1 overflow-auto bg-white dark:bg-gray-900"
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
              <div className="flex-shrink-0 sticky left-0 bg-gray-100 dark:bg-gray-950 text-right select-none border-r dark:border-gray-700 z-10">
                {virtualizer.getVirtualItems().map((virtualRow) => renderLineNumber(virtualRow.index))}
              </div>
              <div className="flex-1 px-2">
                {virtualizer.getVirtualItems().map((virtualRow) => renderLine(virtualRow.index))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Standard rendering for small files
        <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
          <div className="flex min-w-fit">
            <div className="flex-shrink-0 sticky left-0 bg-gray-100 dark:bg-gray-950 text-right select-none border-r dark:border-gray-700">
              {lines.map((_, i) => renderLineNumber(i))}
            </div>
            <div className="flex-1 px-2">
              {lines.map((_, i) => renderLine(i))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
