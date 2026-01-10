import { useEffect, useCallback, type ReactNode } from 'react'

interface ModalProps {
  onClose: () => void
  children: ReactNode
  title?: string
  maxWidth?: string
}

export function Modal({ onClose, children, title, maxWidth = 'max-w-2xl' }: ModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-lg ${maxWidth} w-full max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
            <h2 id="modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className={title ? 'p-4' : 'p-6'}>
          {children}
        </div>
      </div>
    </div>
  )
}
