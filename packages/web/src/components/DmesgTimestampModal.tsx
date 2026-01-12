import { useMemo } from 'react'
import { Modal } from './Modal'

interface DmesgTimestampModalProps {
  firstLine: string
  onClose: () => void
}

export function DmesgTimestampModal({ firstLine, onClose }: DmesgTimestampModalProps) {
  const exampleTimestamp = useMemo(() => {
    const now = new Date()
    // Format: "Mon Jan 13 10:30:45 2025"
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const day = days[now.getDay()]
    const month = months[now.getMonth()]
    const date = now.getDate()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    const seconds = now.getSeconds().toString().padStart(2, '0')
    const year = now.getFullYear()
    return `${day} ${month} ${date} ${hours}:${minutes}:${seconds} ${year}`
  }, [])

  return (
    <Modal onClose={onClose} title="dmesg Timestamp Format Detected" maxWidth="max-w-lg">
      <div className="space-y-4">
        <p className="text-gray-700 dark:text-gray-300">
          This file appears to contain kernel <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm">dmesg</code> logs with relative timestamps:
        </p>

        <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg font-mono text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
          {firstLine || '[4203828.436896] nf_conntrack: table full, dropping packet'}
        </div>

        <p className="text-gray-700 dark:text-gray-300">
          These timestamps show seconds since boot, not human-readable dates. For easier analysis, consider re-exporting your logs with:
        </p>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg font-mono text-sm text-blue-800 dark:text-blue-200">
          dmesg -T
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          The <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">-T</code> flag converts timestamps to human-readable format (e.g., "{exampleTimestamp}").
        </p>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Got it
          </button>
        </div>
      </div>
    </Modal>
  )
}
