import { useState, useRef, memo } from 'react'
import { BUILTIN_PRESETS, type BuiltinPreset } from '../../data/presets'
import { type RulePreset } from '../../stores/useAppStore'
import { Icon } from '../ui'

interface PresetPanelProps {
  savedPresets: RulePreset[]
  onLoadBuiltinPreset: (preset: BuiltinPreset) => void
  onLoadUserPreset: (preset: RulePreset) => void
  onDeletePreset: (name: string) => void
  onSavePreset: (name: string) => void
  onExport: () => void
  onImport: (file: File) => void
  onReset: () => void
}

export const PresetPanel = memo(function PresetPanel({
  savedPresets,
  onLoadBuiltinPreset,
  onLoadUserPreset,
  onDeletePreset,
  onSavePreset,
  onExport,
  onImport,
  onReset,
}: PresetPanelProps) {
  const [newPresetName, setNewPresetName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    const name = newPresetName.trim()
    if (!name) return
    onSavePreset(name)
    setNewPresetName('')
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onImport(file)
    }
    e.target.value = ''
  }

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border dark:border-gray-700 space-y-4">
      {/* Quick Presets */}
      <div>
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Quick Presets</p>
        <div className="flex flex-wrap gap-1.5">
          {BUILTIN_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => onLoadBuiltinPreset(preset)}
              className="text-xs px-2.5 py-1.5 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <hr className="dark:border-gray-700" />

      {/* User Presets */}
      <div>
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Your Presets</p>

        {/* Save new preset */}
        <div className="flex gap-1.5 mb-3">
          <input
            type="text"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Save current as..."
            className="flex-1 px-2.5 py-1.5 text-xs border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSave}
            disabled={!newPresetName.trim()}
            className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Save current rule configuration as a preset"
          >
            Save
          </button>
        </div>

        {/* Saved presets list */}
        {savedPresets.length > 0 ? (
          <div className="space-y-1 max-h-24 overflow-y-auto mb-3">
            {savedPresets.map((preset) => (
              <div key={preset.name} className="flex items-center justify-between gap-1.5 text-xs">
                <button
                  onClick={() => onLoadUserPreset(preset)}
                  className="flex-1 text-left px-2.5 py-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 truncate transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {preset.name}
                </button>
                <button
                  onClick={() => onDeletePreset(preset.name)}
                  className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  title="Delete preset"
                  aria-label={`Delete preset ${preset.name}`}
                >
                  <Icon name="x" size="sm" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">No saved presets yet</p>
        )}

        {/* Import/Export/Reset */}
        <div className="flex gap-1.5 pt-2 border-t dark:border-gray-700">
          <button
            onClick={onExport}
            className="text-xs px-2.5 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
            title="Export current rule configuration as JSON file"
          >
            Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs px-2.5 py-1.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
            title="Import rule configuration from JSON file"
          >
            Import
          </button>
          <button
            onClick={onReset}
            className="text-xs px-2.5 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 rounded-md"
            title="Reset all rules to their default enabled/disabled state and strategies"
          >
            Reset
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          aria-label="Import preset file"
          className="hidden"
        />
      </div>
    </div>
  )
})
