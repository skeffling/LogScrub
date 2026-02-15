import { memo, useState } from 'react'
import { Icon, ToggleButton } from './ui'

// Separator component for visual grouping
function ToolbarSeparator() {
  return (
    <div className="hidden md:block h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1" aria-hidden="true" />
  )
}

interface ToolbarProps {
  // View controls
  showRules: boolean
  onToggleRules: () => void
  constrainWidth: boolean
  onToggleConstrainWidth: () => void

  // Display options
  showDiffHighlight: boolean
  onToggleDiffHighlight: () => void
  syntaxHighlight: boolean
  onToggleSyntaxHighlight: () => void

  // Navigation
  onGoToLine: (line: number) => void
  hasInput: boolean

  // Sync & stats
  syncScroll: boolean
  onToggleSyncScroll: () => void
  lineFilter: 'all' | 'changed' | 'unchanged'
  onShowStats: () => void

  // Document type (hides some controls)
  documentType?: string | null
}

export const Toolbar = memo(function Toolbar({
  showRules,
  onToggleRules,
  constrainWidth,
  onToggleConstrainWidth,
  showDiffHighlight,
  onToggleDiffHighlight,
  syntaxHighlight,
  onToggleSyntaxHighlight,
  onGoToLine,
  hasInput,
  syncScroll,
  onToggleSyncScroll,
  lineFilter,
  onShowStats,
  documentType,
}: ToolbarProps) {
  const [showGoToLine, setShowGoToLine] = useState(false)
  const [goToLineValue, setGoToLineValue] = useState('')

  const handleGoToLineSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const line = parseInt(goToLineValue, 10)
    if (!isNaN(line) && line > 0) {
      onGoToLine(line - 1)
    }
    setShowGoToLine(false)
    setGoToLineValue('')
  }

  const isDisabled = !hasInput
  const isSyncDisabled = isDisabled || lineFilter !== 'all'

  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-2" role="toolbar" aria-label="Editor controls">
      {/* View Controls Group */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleRules}
          className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title={showRules ? 'Hide the detection rules panel' : 'Show the detection rules panel'}
          aria-expanded={showRules}
          aria-controls="rules-panel"
        >
          <Icon name={showRules ? 'chevron-left' : 'chevron-right'} size="sm" />
          <span>{showRules ? 'Hide Rules' : 'Show Rules'}</span>
        </button>

        <button
          onClick={onToggleConstrainWidth}
          className="hidden xl:flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title={constrainWidth ? 'Use full width' : 'Constrain width'}
          aria-pressed={constrainWidth}
        >
          <Icon name={constrainWidth ? 'fullscreen' : 'fullscreen-exit'} size="sm" />
          <span>{constrainWidth ? 'Expand' : 'Compact'}</span>
        </button>
      </div>

      <ToolbarSeparator />

      {/* Display Options Group */}
      <div className="hidden md:flex items-center gap-1">
        <ToggleButton
          active={showDiffHighlight}
          disabled={isDisabled}
          onClick={onToggleDiffHighlight}
          title={isDisabled ? 'Load a log file first' : 'Toggle diff highlighting'}
        >
          Diff
        </ToggleButton>

        <ToggleButton
          active={syntaxHighlight}
          disabled={isDisabled}
          onClick={onToggleSyntaxHighlight}
          title={isDisabled ? 'Load a log file first' : 'Toggle syntax highlighting (JSON, XML, SQL)'}
        >
          Syntax
        </ToggleButton>
      </div>

      {/* Navigation Group */}
      {!documentType && (
        <>
          <ToolbarSeparator />

          <div className="hidden md:flex items-center">
            {showGoToLine ? (
              <form
                onSubmit={handleGoToLineSubmit}
                className="flex items-center text-sm text-gray-600 dark:text-gray-400"
              >
                <span>Line</span>
                <input
                  type="number"
                  min="1"
                  value={goToLineValue}
                  onChange={(e) => setGoToLineValue(e.target.value)}
                  placeholder="#"
                  autoFocus
                  className="w-12 px-1 mx-1 text-sm bg-transparent border-b border-gray-400 dark:border-gray-500 focus:border-blue-500 dark:focus:border-blue-400 outline-none text-gray-700 dark:text-gray-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  onBlur={() => {
                    if (!goToLineValue) setShowGoToLine(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowGoToLine(false)
                      setGoToLineValue('')
                    }
                  }}
                />
                <button
                  type="submit"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  aria-label="Go to line"
                >
                  ↵
                </button>
              </form>
            ) : (
              <button
                onClick={() => hasInput && setShowGoToLine(true)}
                disabled={isDisabled}
                className={`text-sm px-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isDisabled
                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                title={isDisabled ? 'Load a log file first' : 'Go to line (⌘G)'}
              >
                Go to Line
              </button>
            )}
          </div>
        </>
      )}

      <ToolbarSeparator />

      {/* Sync & Stats Group */}
      <div className="hidden md:flex items-center gap-1">
        <ToggleButton
          active={syncScroll}
          disabled={isSyncDisabled}
          onClick={onToggleSyncScroll}
          title={
            isDisabled
              ? 'Load a log file first'
              : lineFilter !== 'all'
                ? 'Disabled while filtering lines'
                : 'Sync scrolling between original and sanitized panes'
          }
        >
          ScrollSync
        </ToggleButton>

        <ToolbarSeparator />

        <button
          onClick={() => hasInput && onShowStats()}
          disabled={isDisabled}
          className={`flex items-center gap-1 text-sm px-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            isDisabled
              ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
          title={isDisabled ? 'Load a log file first' : 'View detection statistics and download audit reports'}
        >
          <Icon name="chart-bar" size="md" />
          <span>Stats &amp; Map</span>
        </button>
      </div>
    </div>
  )
})

// Action buttons component for the right side of the toolbar area
interface ActionButtonsProps {
  // Analysis state
  isAnalyzing: boolean
  analysisReplacementsCount: number
  hasOutput: boolean
  onAnalyze: () => void
  onClearAnalysis: () => void

  // Time shift
  hasTimestamps: boolean
  timeShiftEnabled: boolean
  onShowTimeShift: () => void

  // Processing
  isProcessing: boolean
  canCancel: boolean
  onProcess: () => void
  onCancel: () => void

  // State
  hasInput: boolean
}

export const ActionButtons = memo(function ActionButtons({
  isAnalyzing,
  analysisReplacementsCount,
  hasOutput,
  onAnalyze,
  onClearAnalysis,
  hasTimestamps,
  timeShiftEnabled,
  onShowTimeShift,
  isProcessing,
  canCancel,
  onProcess,
  onCancel,
  hasInput,
}: ActionButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Clear Preview / Analyze buttons */}
      {analysisReplacementsCount > 0 && !hasOutput ? (
        <button
          onClick={onClearAnalysis}
          className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          title="Clear the analysis preview"
        >
          <Icon name="x" size="md" />
          <span>Clear Preview</span>
        </button>
      ) : analysisReplacementsCount === 0 ? (
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing || !hasInput}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          title="Preview what will be detected without scrubbing"
        >
          {isAnalyzing ? (
            <Icon name="spinner" size="md" />
          ) : (
            <Icon name="lightbulb" size="md" />
          )}
          <span>{isAnalyzing ? 'Analyzing...' : 'Analyze'}</span>
        </button>
      ) : null}

      {/* TimeShift button */}
      {hasTimestamps && (
        <button
          onClick={onShowTimeShift}
          className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
            timeShiftEnabled
              ? 'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 focus-visible:ring-gray-500'
          }`}
          title="Shift timestamps to anonymize temporal data"
        >
          <Icon name="clock" size="md" />
          <span>TimeShift</span>
          {timeShiftEnabled && <span className="text-xs">On</span>}
        </button>
      )}

      {/* Process / Cancel button */}
      {isProcessing && canCancel ? (
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          title="Cancel the current processing operation (Escape)"
        >
          <Icon name="x" size="md" />
          <span>Cancel</span>
        </button>
      ) : (
        <button
          onClick={onProcess}
          disabled={isProcessing || !hasInput}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          title="Apply all enabled detection rules and scrub the input text (⌘/Ctrl+Enter)"
        >
          {isProcessing && <Icon name="spinner" size="md" />}
          <span>{isProcessing ? 'Processing...' : 'Scrub'}</span>
          <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-xs bg-blue-500 rounded">⌘↵</kbd>
        </button>
      )}
    </div>
  )
})
