import { Modal } from './Modal'

interface SipTraceModalProps {
  firstLine: string
  onClose: () => void
  onLoadPreset: () => void
}

export function SipTraceModal({ firstLine, onClose, onLoadPreset }: SipTraceModalProps) {
  return (
    <Modal onClose={onClose} title="SIP Trace Detected" maxWidth="max-w-lg">
      <div className="space-y-4">
        <p className="text-gray-700 dark:text-gray-300">
          This file appears to contain SIP protocol traces:
        </p>

        <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg font-mono text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
          {firstLine || 'INVITE sip:user@example.com SIP/2.0'}
        </div>

        <p className="text-gray-700 dark:text-gray-300">
          SIP traces often contain sensitive information like usernames, phone numbers, IP addresses, and authentication data.
        </p>

        <p className="text-gray-700 dark:text-gray-300">
          Would you like to load the <strong>SIP / VoIP</strong> preset? This will enable rules optimized for sanitizing SIP protocol data.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            No thanks
          </button>
          <button
            onClick={() => {
              onLoadPreset()
              onClose()
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Load SIP Preset
          </button>
        </div>
      </div>
    </Modal>
  )
}
