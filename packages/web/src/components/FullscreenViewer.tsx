import { useState, useCallback } from 'react'

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title} {fileName && <span className="text-gray-600 dark:text-gray-400 text-sm" title={fileName}>({fileName.length > 8 ? fileName.slice(0, 8) + '…' : fileName})</span>}
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
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
        <div className="flex min-w-fit">
          <div className="flex-shrink-0 sticky left-0 bg-gray-100 dark:bg-gray-950 text-gray-600 dark:text-gray-400 text-right select-none border-r dark:border-gray-700">
            {lines.map((_, i) => {
              const isHovered = hoveredLineIndex === i
              const isCopied = copiedLineIndex === i
              return (
                <div
                  key={i}
                  className="px-2 font-mono text-sm leading-6 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-end gap-1"
                  onMouseEnter={() => setHoveredLineIndex(i)}
                  onMouseLeave={() => setHoveredLineIndex(null)}
                >
                  {isHovered && !isCopied && (
                    <button
                      onClick={(e) => handleCopyLine(i, e)}
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
                  <span className="min-w-[2ch]">{i + 1}</span>
                </div>
              )
            })}
          </div>
          <div className="flex-1 p-2">
            {lines.map((line, i) => (
              <div
                key={i}
                className="font-mono text-sm leading-6 whitespace-pre text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                {line || ' '}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
