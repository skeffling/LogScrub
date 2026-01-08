interface FullscreenViewerProps {
  title: string
  content: string
  fileName?: string | null
  onClose: () => void
  onDownload?: () => void
}

export function FullscreenViewer({ title, content, fileName, onClose, onDownload }: FullscreenViewerProps) {
  const lines = content.split('\n')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title} {fileName && <span className="text-gray-500 dark:text-gray-400 text-sm">({fileName})</span>}
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
          <div className="flex-shrink-0 sticky left-0 bg-gray-100 dark:bg-gray-950 text-gray-500 dark:text-gray-500 text-right select-none border-r dark:border-gray-700">
            {lines.map((_, i) => (
              <div key={i} className="px-3 font-mono text-sm leading-6">
                {i + 1}
              </div>
            ))}
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
