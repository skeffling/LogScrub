import { memo } from 'react'
import { type CustomRule, type ReplacementStrategy } from '../../stores/useAppStore'
import { Icon } from '../ui'

interface CustomRulesPanelProps {
  customRules: CustomRule[]
  displayStats: Record<string, number>
  strategyOptions: { value: ReplacementStrategy; label: string }[]
  onToggle: (id: string) => void
  onEdit: (rule: CustomRule) => void
  onDelete: (id: string) => void
  onStrategyChange: (id: string, strategy: ReplacementStrategy) => void
}

export const CustomRulesPanel = memo(function CustomRulesPanel({
  customRules,
  displayStats,
  strategyOptions,
  onToggle,
  onEdit,
  onDelete,
  onStrategyChange,
}: CustomRulesPanelProps) {
  if (customRules.length === 0) return null

  const enabledCount = customRules.filter(r => r.enabled).length

  return (
    <div className="border-b dark:border-gray-700 pb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-purple-700 dark:text-purple-400">
          Custom Regex ({enabledCount}/{customRules.length})
        </span>
      </div>
      <div className="space-y-2 ml-1">
        {customRules.map(rule => (
          <div key={rule.id} className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={() => onToggle(rule.id)}
                className="rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500 focus-visible:ring-2 bg-white dark:bg-gray-700"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{rule.label}</span>
              {displayStats[rule.id] > 0 && (
                <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full">
                  {displayStats[rule.id]}
                </span>
              )}
            </label>

            <button
              onClick={() => onEdit({ ...rule })}
              className="p-1 text-purple-500 hover:text-purple-700 dark:hover:text-purple-300 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              title="Edit rule"
              aria-label={`Edit ${rule.label}`}
            >
              <Icon name="edit" size="sm" />
            </button>

            <button
              onClick={() => onDelete(rule.id)}
              className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-300 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              title="Delete rule"
              aria-label={`Delete ${rule.label}`}
            >
              <Icon name="x" size="sm" />
            </button>

            <select
              value={rule.strategy}
              onChange={(e) => onStrategyChange(rule.id, e.target.value as ReplacementStrategy)}
              disabled={!rule.enabled}
              aria-label="Replacement strategy"
              className="text-xs border dark:border-gray-600 rounded px-1.5 py-1 disabled:opacity-50 w-18 bg-white dark:bg-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              {strategyOptions.map((opt) => (
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
