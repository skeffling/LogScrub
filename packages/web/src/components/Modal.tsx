import { useEffect, useCallback, useState, type ReactNode } from 'react'
import { Icon } from './ui'

export type ModalVariant = 'standard' | 'compact' | 'fullscreen'

interface ModalProps {
  onClose: () => void
  children: ReactNode
  title?: string
  maxWidth?: string
  variant?: ModalVariant
}

const variantClasses: Record<ModalVariant, string> = {
  standard: 'max-h-[85vh]',
  compact: 'max-h-[60vh]',
  fullscreen: 'w-screen h-screen max-w-none max-h-none rounded-none',
}

const variantMaxWidths: Record<ModalVariant, string> = {
  standard: 'max-w-2xl',
  compact: 'max-w-lg',
  fullscreen: '',
}

export function Modal({ onClose, children, title, maxWidth, variant = 'standard' }: ModalProps) {
  const [isVisible, setIsVisible] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    // Trigger entrance animation
    requestAnimationFrame(() => setIsVisible(true))
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const effectiveMaxWidth = maxWidth || variantMaxWidths[variant]

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 p-4 transition-all duration-200 ${
        isVisible ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/0'
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-lg ${effectiveMaxWidth} w-full ${variantClasses[variant]} overflow-y-auto transition-all duration-200 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
            <h2 id="modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Icon name="x" size="lg" />
            </button>
          </div>
        )}
        <div className={`${title ? 'p-4' : 'p-6'} ${variant === 'fullscreen' ? 'h-[calc(100%-60px)]' : ''}`}>
          {children}
        </div>
      </div>
    </div>
  )
}
