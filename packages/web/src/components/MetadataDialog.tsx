import { useState } from 'react'

export interface DocumentMetadata {
  // Common fields
  title?: string
  subject?: string
  creator?: string
  author?: string
  lastModifiedBy?: string
  company?: string
  manager?: string
  created?: string
  modified?: string
  revision?: string
  keywords?: string
  description?: string
  category?: string
  // PDF specific
  producer?: string
  pdfVersion?: string
  // App info
  application?: string
}

interface MetadataDialogProps {
  metadata: DocumentMetadata
  documentType: 'pdf' | 'docx' | 'xlsx' | 'odt' | 'ods'
  onKeep: () => void
  onRemove: () => void
  onCancel: () => void
}

export function MetadataDialog({ metadata, documentType, onKeep, onRemove, onCancel }: MetadataDialogProps) {
  const [isRemoving, setIsRemoving] = useState(false)

  const formatLabel = (key: string): string => {
    const labels: Record<string, string> = {
      title: 'Title',
      subject: 'Subject',
      creator: 'Creator',
      author: 'Author',
      lastModifiedBy: 'Last Modified By',
      company: 'Company',
      manager: 'Manager',
      created: 'Created',
      modified: 'Modified',
      revision: 'Revision',
      keywords: 'Keywords',
      description: 'Description',
      category: 'Category',
      producer: 'PDF Producer',
      pdfVersion: 'PDF Version',
      application: 'Application'
    }
    return labels[key] || key
  }

  const metadataEntries = Object.entries(metadata).filter(([, value]) => value && value.trim())

  const handleRemove = async () => {
    setIsRemoving(true)
    await onRemove()
  }

  const formatTypeName = (type: string): string => {
    const names: Record<string, string> = {
      pdf: 'PDF',
      docx: 'Word Document',
      xlsx: 'Excel Spreadsheet',
      odt: 'OpenDocument Text',
      ods: 'OpenDocument Spreadsheet'
    }
    return names[type] || type.toUpperCase()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Document Metadata Detected
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            This {formatTypeName(documentType)} contains metadata that may include sensitive information.
          </p>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border dark:border-gray-700">
            <table className="w-full text-sm">
              <tbody>
                {metadataEntries.map(([key, value], idx) => (
                  <tr key={key} className={idx !== metadataEntries.length - 1 ? 'border-b dark:border-gray-700' : ''}>
                    <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap w-1/3">
                      {formatLabel(key)}
                    </td>
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100 break-all">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {metadataEntries.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No readable metadata found.
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onKeep}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Keep Metadata
          </button>
          <button
            onClick={handleRemove}
            disabled={isRemoving}
            className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {isRemoving ? 'Removing...' : 'Remove Metadata'}
          </button>
        </div>
      </div>
    </div>
  )
}
