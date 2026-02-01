import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { AVAILABLE_MODELS } from '../utils/nerModels'

type Tab = 'active' | 'suggestions' | 'context' | 'ml'

export function Suggestions() {
  const {
    suggestions,
    activeMatches,
    unmatchedRules,
    showSuggestions,
    dismissSuggestions,
    enableSuggestedRule,
    disableActiveMatch,
    enableAllSuggested,
    disableUnmatchedRules,
    contextMatches,
    addContextMatchAsPattern,
    // ML state
    mlModelId,
    setMlModelId,
    mlLoadingState,
    mlLoadProgress,
    loadMlModel,
    analyzeText,
    input
  } = useAppStore()

  const [activeTab, setActiveTab] = useState<Tab>('suggestions')

  // Auto-select the most relevant tab only when modal first opens
  useEffect(() => {
    if (showSuggestions) {
      if (suggestions.length > 0) {
        setActiveTab('suggestions')
      } else if (activeMatches.length > 0) {
        setActiveTab('active')
      } else if (contextMatches.length > 0) {
        setActiveTab('context')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSuggestions]) // Only trigger on modal open, not on count changes

  // Auto-load ML model when ML tab is selected (if cached, loads instantly)
  useEffect(() => {
    if (activeTab === 'ml' && mlLoadingState === 'idle') {
      loadMlModel()
    }
  }, [activeTab, mlLoadingState, loadMlModel])

  // Handle Escape key to close modal
  useEffect(() => {
    if (!showSuggestions) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissSuggestions()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showSuggestions, dismissSuggestions])

  // Handle click outside to close
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      dismissSuggestions()
    }
  }, [dismissSuggestions])

  if (!showSuggestions) return null

  const totalDetections = activeMatches.reduce((sum, m) => sum + m.count, 0)

  const renderMatchList = (items: typeof activeMatches, showEnableButton: boolean, showDisableButton: boolean = false) => (
    <div className="space-y-2">
      {items.map(item => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900 dark:text-white">
                {item.label}
              </span>
              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-full font-medium">
                {item.count} found
              </span>
            </div>
            {item.samples.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                {item.samples.map((sample, i) => (
                  <code
                    key={i}
                    className="text-sm px-2 py-1 bg-gray-50 dark:bg-gray-900 rounded inline-flex items-baseline w-fit max-w-full overflow-hidden"
                    title={`${sample.truncatedBefore ? '…' : ''}${sample.before}${sample.match}${sample.after}${sample.truncatedAfter ? '…' : ''}`}
                  >
                    {sample.truncatedBefore && (
                      <span className="text-gray-400 dark:text-gray-500">…</span>
                    )}
                    <span className="text-gray-500 dark:text-gray-400">{sample.before}</span>
                    <mark className="bg-yellow-200 dark:bg-yellow-700 text-gray-900 dark:text-yellow-100 font-semibold px-1 rounded">{sample.match}</mark>
                    <span className="text-gray-500 dark:text-gray-400">{sample.after}</span>
                    {sample.truncatedAfter && (
                      <span className="text-gray-400 dark:text-gray-500">…</span>
                    )}
                  </code>
                ))}
              </div>
            )}
          </div>
          <div className="flex-shrink-0">
            {showEnableButton && (
              <button
                onClick={() => enableSuggestedRule(item.id)}
                className="text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
              >
                Enable
              </button>
            )}
            {showDisableButton && (
              <button
                onClick={() => disableActiveMatch(item.id)}
                className="text-sm px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
              >
                Disable
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Smart Suggestions
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {totalDetections} detection{totalDetections !== 1 ? 's' : ''} across {activeMatches.length} active rule{activeMatches.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={dismissSuggestions}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Continue"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Instruction */}
        <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Review <strong>Active Matches</strong> for false positives, check <strong>Suggestions</strong> for additional rules to enable, then click <strong>Continue</strong> to proceed.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'active'
                ? 'text-green-700 dark:text-green-400 bg-white dark:bg-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              Active Matches
              {activeMatches.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === 'active'
                    ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {activeMatches.length}
                </span>
              )}
            </span>
            {activeTab === 'active' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('suggestions')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'suggestions'
                ? 'text-green-700 dark:text-green-400 bg-white dark:bg-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              Suggestions
              {suggestions.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === 'suggestions'
                    ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {suggestions.length}
                </span>
              )}
            </span>
            {activeTab === 'suggestions' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('ml')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'ml'
                ? 'text-green-700 dark:text-green-400 bg-white dark:bg-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              ML Detection
              {mlLoadingState === 'ready' && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === 'ml'
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  Ready
                </span>
              )}
            </span>
            {activeTab === 'ml' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('context')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'context'
                ? 'text-green-700 dark:text-green-400 bg-white dark:bg-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              Context-Aware
              {contextMatches.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === 'context'
                    ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {contextMatches.length}
                </span>
              )}
            </span>
            {activeTab === 'context' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-500" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[400px]">
          {activeTab === 'active' && (
            <div className="space-y-4">
              {activeMatches.length > 0 ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    These enabled rules found matches in your text. Disable any that are false positives.
                  </p>
                  {renderMatchList(activeMatches, false, true)}
                </>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>No enabled rules found matches.</p>
                </div>
              )}

              {unmatchedRules.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{unmatchedRules.length}</span> enabled rule{unmatchedRules.length !== 1 ? 's' : ''} had no matches
                    </p>
                    <button
                      onClick={disableUnmatchedRules}
                      className="text-sm px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      Disable Unused Rules
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'suggestions' && (
            <div className="space-y-4">
              {suggestions.length > 0 ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    These disabled rules would find matches if enabled. Review and enable the ones you need.
                  </p>
                  {renderMatchList(suggestions, true)}
                  <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                    <strong>Note:</strong> These suggestions may include false positives. Only enable rules that match actual sensitive data in your content.
                  </p>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <p>No additional rules would find matches.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ml' && (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">ML Name Detection</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Use machine learning to detect person names, locations, and organizations that pattern-based rules might miss.
                  The model runs entirely in your browser — no data is sent to any server.
                </p>
              </div>

              {/* Model Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select Model
                </label>
                <div className="grid gap-3">
                  {AVAILABLE_MODELS.map(model => (
                    <label
                      key={model.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        mlModelId === model.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mlModel"
                        value={model.id}
                        checked={mlModelId === model.id}
                        onChange={() => setMlModelId(model.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">{model.name}</span>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                            {model.size}
                          </span>
                          {model.recommended && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{model.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Download/Status */}
              <div className="space-y-3">
                {mlLoadingState === 'idle' && (
                  <button
                    onClick={() => loadMlModel()}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Model
                  </button>
                )}

                {mlLoadingState === 'loading' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Downloading model...</span>
                      <span className="text-gray-900 dark:text-white font-medium">{Math.round(mlLoadProgress)}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${mlLoadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {mlLoadingState === 'ready' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="font-medium">Model ready</span>
                    </div>
                    <button
                      onClick={() => {
                        if (input) {
                          analyzeText(input)
                          dismissSuggestions()
                        }
                      }}
                      disabled={!input}
                      className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Run ML Analysis
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                      This will re-analyze your text using the ML model to find names, locations, and organizations.
                    </p>
                  </div>
                )}

                {mlLoadingState === 'error' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium">Failed to load model</span>
                    </div>
                    <button
                      onClick={() => loadMlModel()}
                      className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                    >
                      Retry Download
                    </button>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
                <p>
                  <strong>Note:</strong> ML detection is slower than pattern matching but can find names that don't match common patterns.
                </p>
                <p>
                  The model is downloaded once and cached in your browser for future sessions.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'context' && (
            <div className="space-y-4">
              {contextMatches.length > 0 ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Potential secrets found via JSON key analysis (e.g., "password", "token", "api_key").
                  </p>
                  <div className="space-y-2">
                    {contextMatches.map((match, index) => (
                      <div
                        key={`${match.start}-${match.end}-${index}`}
                        className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {match.key}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              match.confidence === 'high'
                                ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                            }`}>
                              {match.confidence}
                            </span>
                            <code className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                              {match.path}
                            </code>
                          </div>
                          <div className="mt-2">
                            <code className="text-sm px-2 py-1 bg-gray-50 dark:bg-gray-900 rounded inline-block max-w-full overflow-hidden text-ellipsis">
                              <mark className="bg-purple-200 dark:bg-purple-800 text-gray-900 dark:text-purple-100 font-medium px-1 rounded">
                                {match.value.length > 60 ? match.value.slice(0, 60) + '...' : match.value}
                              </mark>
                            </code>
                          </div>
                        </div>
                        <button
                          onClick={() => addContextMatchAsPattern(match)}
                          className="flex-shrink-0 text-sm px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors"
                        >
                          Add to Scrub
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p>No JSON-based secrets detected.</p>
                  <p className="text-sm mt-1">This tab analyzes JSON structures for suspicious key names.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">Esc</kbd> or click outside to continue
          </p>
          <div className="flex items-center gap-3">
            {activeTab === 'suggestions' && suggestions.length > 0 && (
              <button
                onClick={enableAllSuggested}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
              >
                Enable All Suggestions
              </button>
            )}
            <button
              onClick={dismissSuggestions}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
