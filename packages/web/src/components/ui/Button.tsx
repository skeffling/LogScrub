import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  iconPosition?: 'left' | 'right'
  loading?: boolean
  children?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 focus-visible:ring-blue-500',
  secondary: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 focus-visible:ring-gray-500',
  ghost: 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white focus-visible:ring-gray-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400 focus-visible:ring-red-500',
  success: 'bg-green-600 text-white hover:bg-green-700 disabled:bg-green-400 focus-visible:ring-green-500',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs gap-1',
  md: 'px-3 py-1.5 text-sm gap-1.5',
  lg: 'px-4 py-2 text-base gap-2',
}

const iconSizeMap: Record<ButtonSize, 'sm' | 'md' | 'lg'> = {
  sm: 'sm',
  md: 'md',
  lg: 'md',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconPosition = 'left',
    loading = false,
    disabled,
    children,
    className = '',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading

  const baseClasses = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed'

  const combinedClassName = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()

  const iconSize = iconSizeMap[size]

  const iconElement = loading ? (
    <Icon name="spinner" size={iconSize} />
  ) : icon ? (
    <Icon name={icon} size={iconSize} />
  ) : null

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={combinedClassName}
      {...props}
    >
      {iconElement && iconPosition === 'left' && iconElement}
      {children}
      {iconElement && iconPosition === 'right' && iconElement}
    </button>
  )
})

// IconButton variant for icon-only buttons with sr-only labels
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    variant = 'ghost',
    size = 'md',
    loading = false,
    disabled,
    className = '',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading

  const baseClasses = 'inline-flex items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed'

  const paddingClasses: Record<ButtonSize, string> = {
    sm: 'p-1',
    md: 'p-1.5',
    lg: 'p-2',
  }

  const combinedClassName = `${baseClasses} ${variantClasses[variant]} ${paddingClasses[size]} ${className}`.trim()

  const iconSize = iconSizeMap[size]

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={combinedClassName}
      title={label}
      aria-label={label}
      {...props}
    >
      {loading ? (
        <Icon name="spinner" size={iconSize} />
      ) : (
        <Icon name={icon} size={iconSize} />
      )}
      <span className="sr-only">{label}</span>
    </button>
  )
})

// Text button variant for toolbar-style text buttons
interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  children: ReactNode
}

export const TextButton = forwardRef<HTMLButtonElement, TextButtonProps>(function TextButton(
  { active = false, children, className = '', disabled, ...props },
  ref
) {
  const baseClasses = 'text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 dark:focus-visible:ring-offset-gray-900 rounded'

  const activeClasses = active
    ? 'text-blue-600 dark:text-blue-400'
    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'

  const disabledClasses = disabled
    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
    : ''

  const combinedClassName = `${baseClasses} ${disabled ? disabledClasses : activeClasses} ${className}`.trim()

  return (
    <button
      ref={ref}
      disabled={disabled}
      className={combinedClassName}
      {...props}
    >
      {children}
    </button>
  )
})
