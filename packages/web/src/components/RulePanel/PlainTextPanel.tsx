import { memo } from 'react'
import { type PlainTextPattern, type ReplacementStrategy } from '../../stores/useAppStore'
import { Icon } from '../ui'

interface PlainTextPanelProps {
  patterns: PlainTextPattern[]
  displayStats: Record<string, number>
  strategyOptions: { value: ReplacementStrategy; label: string }[]
  onToggle: (id: string) => void
  onEdit: (pattern: PlainTextPattern) => void
  onDelete: (id: string) => void
  onStrategyChange: (id: string, strategy: ReplacementStrategy) => void
}

export const PlainTextPanel = memo(function PlainTextPanel({
  patterns,
  displayStats,
  strategyOptions,
  onToggle,
  onEdit,
  onDelete,
  onStrategyChange,
}: PlainTextPanelProps) {
  if (patterns.length === 0) return null

  const enabledCount = patterns.filter(p => p.enabled).length
  // Plain text patterns don't support 'fake' or 'template' strategies
  const filteredOptions = strategyOptions.filter(opt => opt.value !== 'fake' && opt.value !== 'template')

  return (
    <div className="border-b dark:border-gray-700 pb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
          Plain Text ({enabledCount}/{patterns.length})
        </span>
      </div>
      <div className="space-y-2 ml-1">
        {patterns.map(pattern => (
          <div key={pattern.id} className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
              <input
                type="checkbox"
                checked={pattern.enabled}
                onChange={() => onToggle(pattern.id)}
                className="rounded border-gray-300 dark:border-gray-600 text-orange-600 focus:ring-orange-500 focus-visible:ring-2 bg-white dark:bg-gray-700"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={pattern.text}>
                {pattern.label}
              </span>
              {displayStats[pattern.id] > 0 && (
                <span className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-full">
                  {displayStats[pattern.id]}
                </span>
              )}
            </label>

            <button
              onClick={() => onEdit({ ...pattern })}
              className="p-1 text-orange-500 hover:text-orange-700 dark:hover:text-orange-300 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              title="Edit pattern"
              aria-label={`Edit ${pattern.label}`}
            >
              <Icon name="edit" size="sm" />
            </button>

            <button
              onClick={() => onDelete(pattern.id)}
              className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-300 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              title="Delete pattern"
              aria-label={`Delete ${pattern.label}`}
            >
              <Icon name="x" size="sm" />
            </button>

            <select
              value={pattern.strategy}
              onChange={(e) => onStrategyChange(pattern.id, e.target.value as ReplacementStrategy)}
              disabled={!pattern.enabled}
              aria-label="Replacement strategy"
              className="text-xs border dark:border-gray-600 rounded px-1.5 py-1 disabled:opacity-50 w-18 bg-white dark:bg-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {filteredOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
})
