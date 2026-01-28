import { useMemo } from 'react'
import { useAppStore } from '../stores/useAppStore'
import type { FileEntry, FileStatus } from '../types/multiFile'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getStatusBadge(status: FileStatus, error: string | null) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          Pending
        </span>
      )
    case 'analyzing':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Analyzing
        </span>
      )
    case 'analyzed':
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
          Analyzed
        </span>
      )
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Scrubbing
        </span>
      )
    case 'processed':
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
          Done
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" title={error || 'Error'}>
          Error
        </span>
      )
    default:
      return null
  }
}

function getDetectionCount(file: FileEntry): number {
  // Use processed stats if available, otherwise analysis stats
  const stats = Object.keys(file.stats).length > 0 ? file.stats : file.analysisStats
  return Object.values(stats).reduce((sum, count) => sum + count, 0)
}

function downloadFile(file: FileEntry) {
  // Download scrubbed version if processed, original otherwise
  const content = file.scrubbedContent ?? file.content
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  // Add _scrubbed suffix if downloading processed version
  const fileName = file.scrubbedContent
    ? file.name.replace(/(\.[^.]+)$/, '_scrubbed$1')
    : file.name
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function FileList() {
  const {
    files,
    selectedFileId,
    selectFile,
    removeFile,
    clearAllFiles,
    analyzeAllFiles,
    processAllFiles,
    isBatchAnalyzing,
    isBatchProcessing,
    batchProgress,
    aggregatedStats,
    exportAllAsZip
  } = useAppStore()

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files])
  const hasProcessedFiles = files.some(f => f.status === 'processed')
  const isBusy = isBatchAnalyzing || isBatchProcessing

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400">
        <p className="text-sm">No files uploaded yet.</p>
        <p className="text-xs mt-1">Upload files to see them here.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Batch action buttons */}
      <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b dark:border-gray-700">
        <button
          onClick={() => analyzeAllFiles()}
          disabled={isBusy}
          className="flex-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBatchAnalyzing ? (
            <span className="flex items-center justify-center gap-1">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {batchProgress.current}/{batchProgress.total}
            </span>
          ) : (
            'Analyze All'
          )}
        </button>
        <button
          onClick={() => processAllFiles()}
          disabled={isBusy}
          className="flex-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBatchProcessing ? (
            <span className="flex items-center justify-center gap-1">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {batchProgress.current}/{batchProgress.total}
            </span>
          ) : (
            'Scrub All'
          )}
        </button>
        {hasProcessedFiles && (
          <button
            onClick={() => exportAllAsZip()}
            disabled={isBusy}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export ZIP
          </button>
        )}
      </div>

      {/* Progress indicator */}
      {isBusy && (
        <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-300 mb-1">
            <span>{isBatchAnalyzing ? 'Analyzing' : 'Scrubbing'}: {batchProgress.currentFileName}</span>
            <span>{batchProgress.current}/{batchProgress.total}</span>
          </div>
          <div className="h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto -mx-3 px-3">
        <div className="space-y-1">
          {files.map((file) => {
            const isSelected = file.id === selectedFileId
            const detections = getDetectionCount(file)

            return (
              <div
                key={file.id}
                onClick={() => selectFile(file.id)}
                className={`group relative p-2 rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-500'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* File icon */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded flex items-center justify-center ${
                    isSelected ? 'bg-blue-200 dark:bg-blue-800' : 'bg-gray-100 dark:bg-gray-700'
                  }`}>
                    <svg className={`w-4 h-4 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${
                        isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {file.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {formatFileSize(file.size)}
                      </span>
                      {getStatusBadge(file.status, file.error)}
                      {detections > 0 && (
                        <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
                          {detections} PII
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Download button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadFile(file)
                    }}
                    className="flex-shrink-0 p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={file.scrubbedContent ? 'Download scrubbed file' : 'Download file'}
                  >
                    <svg className="w-4 h-4 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>

                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(file.id)
                    }}
                    className="flex-shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove file"
                  >
                    <svg className="w-4 h-4 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary and clear button */}
      <div className="mt-3 pt-3 border-t dark:border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {files.length} file{files.length !== 1 ? 's' : ''} ({formatFileSize(totalSize)})
          </span>
          <button
            onClick={clearAllFiles}
            disabled={isBusy}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs disabled:opacity-50"
          >
            Clear All
          </button>
        </div>
        {aggregatedStats && aggregatedStats.totalDetections > 0 && (
          <div className="mt-1 text-xs text-orange-600 dark:text-orange-400">
            {aggregatedStats.totalDetections} total PII detections across all files
          </div>
        )}
      </div>
    </div>
  )
}
