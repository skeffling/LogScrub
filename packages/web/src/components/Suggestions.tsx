import { useAppStore } from '../stores/useAppStore'

export function Suggestions() {
  const { suggestions, showSuggestions, dismissSuggestions, enableSuggestedRule, enableAllSuggested } = useAppStore()

  if (!showSuggestions || suggestions.length === 0) return null

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h3 className="font-medium text-amber-800 dark:text-amber-200">
              Smart Suggestions
            </h3>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {suggestions.length} disabled rule{suggestions.length !== 1 ? 's' : ''} found matches
            </span>
          </div>
          
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {suggestions.map(suggestion => (
              <div 
                key={suggestion.id}
                className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded p-2 border border-amber-100 dark:border-amber-900"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900 dark:text-white">
                      {suggestion.label}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded">
                      {suggestion.count} found
                    </span>
                  </div>
                  {suggestion.samples.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {suggestion.samples.map((sample, i) => (
                        <code 
                          key={i}
                          className="text-xs px-1 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded truncate max-w-[150px]"
                          title={sample}
                        >
                          {sample.length > 25 ? sample.slice(0, 25) + '...' : sample}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => enableSuggestedRule(suggestion.id)}
                  className="flex-shrink-0 text-xs px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
                >
                  Enable
                </button>
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex flex-col gap-2">
          <button
            onClick={enableAllSuggested}
            className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 whitespace-nowrap"
          >
            Enable All
          </button>
          <button
            onClick={dismissSuggestions}
            className="text-xs px-3 py-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
