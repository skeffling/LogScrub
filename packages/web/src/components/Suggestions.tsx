import { useState } from 'react'
import { useAppStore } from '../stores/useAppStore'

type Tab = 'active' | 'suggestions'

export function Suggestions() {
  const {
    suggestions,
    activeMatches,
    unmatchedRules,
    showSuggestions,
    dismissSuggestions,
    enableSuggestedRule,
    enableAllSuggested,
    disableUnmatchedRules,
    toggleRule
  } = useAppStore()

  const [activeTab, setActiveTab] = useState<Tab>('suggestions')

  if (!showSuggestions || (suggestions.length === 0 && activeMatches.length === 0)) return null

  const renderMatchList = (items: typeof activeMatches, showEnableButton: boolean, showDisableButton: boolean = false) => (
    <div className="space-y-2 max-h-48 overflow-y-auto">
      {items.map(item => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded p-2 border border-green-100 dark:border-green-900"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900 dark:text-white">
                {item.label}
              </span>
              <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                {item.count} found
              </span>
            </div>
            {item.samples.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {item.samples.map((sample, i) => {
                  const fullText = `${sample.truncatedBefore ? '…' : ''}${sample.before}${sample.match}${sample.after}${sample.truncatedAfter ? '…' : ''}`
                  const totalLen = sample.before.length + sample.match.length + sample.after.length
                  const needsTruncate = totalLen > 55

                  // For truncation, prioritize showing the match with balanced context
                  let displayBefore = sample.before
                  let displayAfter = sample.after
                  if (needsTruncate) {
                    const availableContext = 55 - sample.match.length
                    const halfContext = Math.floor(availableContext / 2)
                    if (sample.before.length > halfContext) {
                      displayBefore = sample.before.slice(-halfContext)
                    }
                    if (sample.after.length > halfContext) {
                      displayAfter = sample.after.slice(0, halfContext)
                    }
                  }

                  return (
                    <code
                      key={i}
                      className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded max-w-[300px] inline-flex items-baseline"
                      title={fullText}
                    >
                      {(sample.truncatedBefore || displayBefore.length < sample.before.length) && (
                        <span className="text-gray-400 dark:text-gray-500">…</span>
                      )}
                      <span className="text-gray-500 dark:text-gray-400">{displayBefore}</span>
                      <mark className="bg-yellow-200 dark:bg-yellow-700 text-gray-900 dark:text-yellow-100 font-medium px-0.5 rounded-sm">{sample.match}</mark>
                      <span className="text-gray-500 dark:text-gray-400">{displayAfter}</span>
                      {(sample.truncatedAfter || displayAfter.length < sample.after.length) && (
                        <span className="text-gray-400 dark:text-gray-500">…</span>
                      )}
                    </code>
                  )
                })}
              </div>
            )}
          </div>
          {showEnableButton && (
            <button
              onClick={() => enableSuggestedRule(item.id)}
              className="flex-shrink-0 text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Enable
            </button>
          )}
          {showDisableButton && (
            <button
              onClick={() => toggleRule(item.id)}
              className="flex-shrink-0 text-xs px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Disable
            </button>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h3 className="font-medium text-green-800 dark:text-green-200">
              Smart Suggestions
            </h3>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-3 border-b border-green-200 dark:border-green-800">
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                activeTab === 'suggestions'
                  ? 'bg-white dark:bg-gray-800 text-green-800 dark:text-green-200 border border-b-0 border-green-200 dark:border-green-800'
                  : 'text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30'
              }`}
            >
              Suggestions
              {suggestions.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                  {suggestions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                activeTab === 'active'
                  ? 'bg-white dark:bg-gray-800 text-green-800 dark:text-green-200 border border-b-0 border-green-200 dark:border-green-800'
                  : 'text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30'
              }`}
            >
              Active Matches
              {activeMatches.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                  {activeMatches.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'active' && (
            <div>
              {activeMatches.length > 0 ? (
                <>
                  <p className="text-xs text-green-600 dark:text-green-400 mb-2">
                    Enabled rules that found matches:
                  </p>
                  {renderMatchList(activeMatches, false, true)}
                </>
              ) : (
                <p className="text-sm text-green-600 dark:text-green-400">
                  No enabled rules found matches.
                </p>
              )}

              {unmatchedRules.length > 0 && (
                <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {unmatchedRules.length} enabled rule{unmatchedRules.length !== 1 ? 's' : ''} had no matches
                    </p>
                    <button
                      onClick={disableUnmatchedRules}
                      className="text-xs px-2 py-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                    >
                      Disable Unused
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'suggestions' && (
            <div>
              {suggestions.length > 0 ? (
                <>
                  <p className="text-xs text-green-600 dark:text-green-400 mb-2">
                    Disabled rules that would find matches if enabled:
                  </p>
                  {renderMatchList(suggestions, true)}
                  <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-3 italic">
                    Note: These suggestions may include false positives. Only enable rules that match actual sensitive data in your logs.
                    {activeMatches.length > 0 && (
                      <> Check the <button onClick={() => setActiveTab('active')} className="underline hover:text-green-700 dark:hover:text-green-300">Active Matches</button> tab too — some matches there may also be false positives that need their rules disabled.</>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-sm text-green-600 dark:text-green-400">
                  No disabled rules would find matches.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {activeTab === 'suggestions' && suggestions.length > 0 && (
            <button
              onClick={enableAllSuggested}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 whitespace-nowrap"
            >
              Enable All
            </button>
          )}
          <button
            onClick={dismissSuggestions}
            className="text-xs px-3 py-1.5 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
