import { useCallback, useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { ensureWasm } from '../utils/wasm'

interface FileUploadProps {
  onFilesAdded?: () => void
}

export function FileUpload({ onFilesAdded }: FileUploadProps) {
  const { setInput, setFileName, addFiles, addFilesFromZip, files } = useAppStore()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList)
    if (filesArray.length === 0) return

    setError(null)
    setIsLoading(true)

    try {
      // Check if any file is a ZIP
      const zipFiles = filesArray.filter(f => f.name.toLowerCase().endsWith('.zip'))
      const textFiles = filesArray.filter(f => !f.name.toLowerCase().endsWith('.zip'))

      // Handle text files
      if (textFiles.length > 0) {
        // Single file mode - use legacy behavior for backward compatibility
        if (textFiles.length === 1 && files.length === 0 && zipFiles.length === 0) {
          const file = textFiles[0]
          const reader = new FileReader()
          reader.onload = (e) => {
            const text = e.target?.result as string
            setInput(text)
            setFileName(file.name)
            setIsLoading(false)
            onFilesAdded?.()
          }
          reader.onerror = () => {
            setError('Failed to read file')
            setIsLoading(false)
          }
          reader.readAsText(file)
          return
        }

        // Multi-file mode
        await addFiles(textFiles)
      }

      // Handle ZIP files
      for (const zipFile of zipFiles) {
        await ensureWasm()
        const arrayBuffer = await zipFile.arrayBuffer()
        const data = new Uint8Array(arrayBuffer)
        await addFilesFromZip(data, zipFile.name)
      }

      onFilesAdded?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process files')
    } finally {
      setIsLoading(false)
    }
  }, [setInput, setFileName, addFiles, addFilesFromZip, files.length, onFilesAdded])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }, [handleFiles])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
        isLoading
          ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400'
      }`}
    >
      <input
        type="file"
        onChange={handleInputChange}
        accept=".log,.txt,.json,.xml,.csv,.zip,.pcap,.pcapng,.gpx,.fit"
        className="hidden"
        id="file-upload"
        multiple
      />
      <label htmlFor="file-upload" className="cursor-pointer">
        {isLoading ? (
          <>
            <svg className="mx-auto h-12 w-12 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
              Processing files...
            </p>
          </>
        ) : (
          <>
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500">Upload files</span> or drag and drop
            </p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              .log, .txt, .json, .xml, .csv, .zip, .pcap, .gpx, .fit (multiple files supported)
            </p>
          </>
        )}
      </label>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
