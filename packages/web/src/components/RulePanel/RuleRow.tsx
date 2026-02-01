import { memo } from 'react'
import { type ReplacementStrategy } from '../../stores/useAppStore'
import { Icon } from '../ui'

interface RuleRowProps {
  label: string
  enabled: boolean
  strategy: ReplacementStrategy
  matchCount?: number
  onToggle: () => void
  onStrategyChange: (strategy: ReplacementStrategy) => void
  onViewPattern: () => void
  onEditTemplate: () => void
  strategyOptions?: { value: ReplacementStrategy; label: string }[]
}

const DEFAULT_STRATEGY_OPTIONS: { value: ReplacementStrategy; label: string }[] = [
  { value: 'label', label: 'Label' },
  { value: 'realistic', label: 'Fake' },
  { value: 'redact', label: 'Redact' },
  { value: 'template', label: 'Template' },
]

export const RuleRow = memo(function RuleRow({
  label,
  enabled,
  strategy,
  matchCount,
  onToggle,
  onStrategyChange,
  onViewPattern,
  onEditTemplate,
  strategyOptions = DEFAULT_STRATEGY_OPTIONS
}: RuleRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 focus-visible:ring-2 bg-white dark:bg-gray-700"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{label}</span>
        {matchCount !== undefined && matchCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
            {matchCount}
          </span>
        )}
      </label>

      <button
        onClick={onViewPattern}
        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        title="View regex pattern"
        aria-label={`View pattern for ${label}`}
      >
        <Icon name="settings" size="sm" />
      </button>

      <select
        value={strategy}
        onChange={(e) => onStrategyChange(e.target.value as ReplacementStrategy)}
        disabled={!enabled}
        aria-label="Replacement strategy"
        className="text-xs border dark:border-gray-600 rounded px-1.5 py-1 disabled:opacity-50 w-18 bg-white dark:bg-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {strategyOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {strategy === 'template' && (
        <button
          onClick={onEditTemplate}
          className="p-1 text-purple-500 hover:text-purple-700 dark:text-purple-400 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          title="Edit template"
          aria-label={`Edit template for ${label}`}
        >
          <Icon name="edit" size="sm" />
        </button>
      )}
    </div>
  )
})
