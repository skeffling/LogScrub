import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { AVAILABLE_MODELS } from '../utils/nerModels'
import { getCurrentDevice, getModelCacheStatus, deleteModelCache, getCachedModelSize, formatBytes } from '../utils/nerDetection'

export function SettingsPanel() {
  const {
    showSettings,
    dismissSettings,
    consistencyMode,
    setConsistencyMode,
    preservePrivateIPs,
    setPreservePrivateIPs,
    resetToDefaults,
    // ML state
    mlModelId,
    setMlModelId,
    mlLoadingState,
    mlLoadProgress,
    loadMlModel,
    setMlNameDetection,
    analyzeText,
    input
  } = useAppStore()

  const [modelCacheStatus, setModelCacheStatus] = useState<Record<string, boolean>>({})
  const [modelCacheSizes, setModelCacheSizes] = useState<Record<string, number>>({})
  const [deletingModel, setDeletingModel] = useState<string | null>(null)

  const loadCacheStatus = useCallback(async () => {
    const status = await getModelCacheStatus()
    setModelCacheStatus(status)
    const sizes: Record<string, number> = {}
    for (const [modelId, isCached] of Object.entries(status)) {
      if (isCached) {
        sizes[modelId] = await getCachedModelSize(modelId)
      }
    }
    setModelCacheSizes(sizes)
  }, [])

  const handleDeleteCache = useCallback(async (modelId: string) => {
    setDeletingModel(modelId)
    try {
      await deleteModelCache(modelId)
      await loadCacheStatus()
    } finally {
      setDeletingModel(null)
    }
  }, [loadCacheStatus])

  // Load cache status when panel is shown
  useEffect(() => {
    if (showSettings) {
      loadCacheStatus()
    }
  }, [showSettings, loadCacheStatus])

  // Refresh cache status when a model finishes loading
  useEffect(() => {
    if (mlLoadingState === 'ready') {
      loadCacheStatus()
    }
  }, [mlLoadingState, loadCacheStatus])

  if (!showSettings) return null

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <div className="space-y-6">
          {/* Processing Options */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Processing Options</h3>
            <label className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Consistency Mode</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Same input values produce the same replacements</p>
              </div>
              <input
                type="checkbox"
                checked={consistencyMode}
                onChange={(e) => setConsistencyMode(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
              />
            </label>
            <label className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Preserve Private IPs</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Keep RFC1918 private IP addresses (10.x, 172.16-31.x, 192.168.x) unchanged</p>
              </div>
              <input
                type="checkbox"
                checked={preservePrivateIPs}
                onChange={(e) => setPreservePrivateIPs(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
              />
            </label>
            <button
              onClick={resetToDefaults}
              className="text-xs px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Reset Rules to Defaults
            </button>
          </div>

          <hr className="dark:border-gray-700" />

          {/* ML Detection */}
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">ML Name Detection</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Use machine learning to detect person names, locations, and organizations that pattern-based rules might miss.
                The model runs entirely in your browser — no data is sent to any server.
              </p>
            </div>

            {/* Model Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Select Model</label>
              <div className="grid gap-3">
                {AVAILABLE_MODELS.map(model => {
                  const isCached = modelCacheStatus[model.id]
                  const cacheSize = modelCacheSizes[model.id]
                  const isDeleting = deletingModel === model.id

                  return (
                    <div
                      key={model.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        mlModelId === model.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <label className="flex items-start gap-3 flex-1 cursor-pointer">
                        <input type="radio" name="mlModel" value={model.id} checked={mlModelId === model.id} onChange={() => setMlModelId(model.id)} className="mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 dark:text-white">{model.name}</span>
                            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">{model.size}</span>
                            {isCached && (
                              <span className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded flex items-center gap-1" title={cacheSize ? `Cached: ${formatBytes(cacheSize)}` : 'Downloaded'}>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Downloaded
                              </span>
                            )}
                            {model.recommended && <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">Recommended</span>}
                            {model.url && (
                              <a href={model.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                HuggingFace
                              </a>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{model.description}</p>
                        </div>
                      </label>
                      {isCached && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCache(model.id) }}
                          disabled={isDeleting}
                          className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
                          title={`Delete cached model${cacheSize ? ` (${formatBytes(cacheSize)})` : ''}`}
                        >
                          {isDeleting ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          )}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Download/Status */}
            <div className="space-y-3">
              {mlLoadingState === 'idle' && (
                <button onClick={() => loadMlModel()} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
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
                    <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${mlLoadProgress}%` }} />
                  </div>
                </div>
              )}
              {mlLoadingState === 'ready' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="font-medium">Model ready</span>
                    {getCurrentDevice() === 'webgpu' && (
                      <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-full font-medium">GPU Accelerated</span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (input) {
                        setMlNameDetection(true)
                        analyzeText(input)
                        dismissSettings()
                      }
                    }}
                    disabled={!input}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
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
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span className="font-medium">Failed to load model</span>
                  </div>
                  <button onClick={() => loadMlModel()} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">Retry Download</button>
                </div>
              )}
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
              <p><strong>Note:</strong> ML detection is slower than pattern matching but can find names that don't match common patterns.</p>
              <p>The model is downloaded once and cached in your browser for future sessions.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
