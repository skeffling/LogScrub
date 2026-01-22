import { forwardRef, type InputHTMLAttributes } from 'react'

export type ToggleSize = 'sm' | 'md'

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string
  description?: string
  size?: ToggleSize
}

const sizeClasses: Record<ToggleSize, { track: string; thumb: string; translate: string }> = {
  sm: {
    track: 'w-7 h-4',
    thumb: 'w-3 h-3',
    translate: 'translate-x-3',
  },
  md: {
    track: 'w-9 h-5',
    thumb: 'w-4 h-4',
    translate: 'translate-x-4',
  },
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  { label, description, size = 'md', className = '', disabled, checked, ...props },
  ref
) {
  const sizes = sizeClasses[size]

  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}>
      <div className="relative">
        <input
          ref={ref}
          type="checkbox"
          className="sr-only peer"
          disabled={disabled}
          checked={checked}
          {...props}
        />
        <div
          className={`${sizes.track} bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-blue-600 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-gray-900`}
        />
        <div
          className={`${sizes.thumb} absolute top-0.5 left-0.5 bg-white rounded-full shadow-sm transition-transform peer-checked:${sizes.translate}`}
        />
      </div>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
          )}
          {description && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{description}</span>
          )}
        </div>
      )}
    </label>
  )
})

// ToggleIndicator - visual dot indicator for toggle state (used in toolbar buttons)
interface ToggleIndicatorProps {
  active: boolean
  disabled?: boolean
  size?: ToggleSize
}

export function ToggleIndicator({ active, disabled = false, size = 'sm' }: ToggleIndicatorProps) {
  const dotSizes: Record<ToggleSize, string> = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
  }

  const colorClasses = disabled
    ? 'bg-gray-300 dark:bg-gray-600'
    : active
      ? 'bg-blue-500'
      : 'bg-gray-400'

  return (
    <span className={`${dotSizes[size]} rounded-full ${colorClasses}`} aria-hidden="true" />
  )
}

// ToggleButton - combined button with indicator for toolbar toggles
interface ToggleButtonProps {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
  className?: string
}

export function ToggleButton({ active, disabled = false, onClick, children, title, className = '' }: ToggleButtonProps) {
  const baseClasses = 'text-sm flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 rounded px-1'

  const colorClasses = disabled
    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
    : active
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${baseClasses} ${colorClasses} ${className}`}
      title={title}
      aria-pressed={active}
    >
      <ToggleIndicator active={active} disabled={disabled} />
      {children}
    </button>
  )
}
