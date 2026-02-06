import { ReactNode } from 'react'
import { Icon } from './ui'

type ColorScheme = 'blue' | 'purple' | 'orange' | 'red' | 'amber' | 'green' | 'indigo'

interface DetectionBannerProps {
  icon: ReactNode
  colorScheme: ColorScheme
  message: string | ReactNode
  actionLabel: string
  onAction: () => void
  onDismiss: () => void
}

const colorClasses: Record<ColorScheme, {
  bg: string
  border: string
  text: string
  button: string
  dismiss: string
}> = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-200',
    button: 'bg-blue-600 hover:bg-blue-700',
    dismiss: 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-800 dark:text-purple-200',
    button: 'bg-purple-600 hover:bg-purple-700',
    dismiss: 'text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-800 dark:text-orange-200',
    button: 'bg-orange-600 hover:bg-orange-700',
    dismiss: 'text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    button: 'bg-red-600 hover:bg-red-700',
    dismiss: 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-800 dark:text-amber-200',
    button: 'bg-amber-600 hover:bg-amber-700',
    dismiss: 'text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-800 dark:text-green-200',
    button: 'bg-green-600 hover:bg-green-700',
    dismiss: 'text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    border: 'border-indigo-200 dark:border-indigo-800',
    text: 'text-indigo-800 dark:text-indigo-200',
    button: 'bg-indigo-600 hover:bg-indigo-700',
    dismiss: 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200',
  },
}

export function DetectionBanner({
  icon,
  colorScheme,
  message,
  actionLabel,
  onAction,
  onDismiss,
}: DetectionBannerProps) {
  const colors = colorClasses[colorScheme]

  return (
    <div className={`mb-3 p-3 ${colors.bg} border ${colors.border} rounded-lg flex items-center gap-3`}>
      {icon}
      <span className={`${colors.text} text-sm flex-1`}>
        {message}
      </span>
      <button
        onClick={onAction}
        className={`px-3 py-1.5 ${colors.button} text-white text-sm rounded`}
      >
        {actionLabel}
      </button>
      <button
        onClick={onDismiss}
        className={colors.dismiss}
        title="Dismiss"
      >
        <Icon name="x" size="sm" />
      </button>
    </div>
  )
}
