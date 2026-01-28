import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { RulePanel } from './RulePanel'
import { FileList } from './FileList'

export type SidebarTab = 'rules' | 'files'

interface SidebarPanelProps {
  activeTab?: SidebarTab
  onTabChange?: (tab: SidebarTab) => void
}

export function SidebarPanel({ activeTab: controlledTab, onTabChange }: SidebarPanelProps) {
  const { files } = useAppStore()
  const [internalTab, setInternalTab] = useState<SidebarTab>('rules')
  const [hasAutoSwitched, setHasAutoSwitched] = useState(false)

  // Use controlled or internal state
  const activeTab = controlledTab ?? internalTab
  const setActiveTab = onTabChange ?? setInternalTab

  // Auto-switch to files tab once when multiple files are first added
  useEffect(() => {
    if (files.length > 1 && !hasAutoSwitched) {
      setActiveTab('files')
      setHasAutoSwitched(true)
    }
    // Reset when files are cleared
    if (files.length === 0) {
      setHasAutoSwitched(false)
    }
  }, [files.length, hasAutoSwitched, setActiveTab])

  const showFilesTab = files.length > 0

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab bar - only show when there are files */}
      {showFilesTab && (
        <div className="flex border-b dark:border-gray-700 mb-0 flex-shrink-0">
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'rules'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-900'
            }`}
          >
            Detection Rules
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'files'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-900'
            }`}
          >
            Files
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === 'files'
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {files.length}
            </span>
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'rules' ? (
          <RulePanel />
        ) : (
          <div className="h-full p-4 bg-white dark:bg-gray-800 overflow-y-auto">
            <FileList />
          </div>
        )}
      </div>
    </div>
  )
}
