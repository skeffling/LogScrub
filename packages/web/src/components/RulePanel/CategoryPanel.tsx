import { memo } from 'react'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Icon } from '../ui'

interface CategoryPanelProps {
  id: string
  isExpanded: boolean
  enabledCount: number
  totalCount: number
  isDragDisabled?: boolean
  onToggleExpand: () => void
  onEnableAll: () => void
  onDisableAll: () => void
  children: React.ReactNode
}

export const CategoryPanel = memo(function CategoryPanel({
  id,
  isExpanded,
  enabledCount,
  totalCount,
  isDragDisabled,
  onToggleExpand,
  onEnableAll,
  onDisableAll,
  children
}: CategoryPanelProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isDragDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-b dark:border-gray-700 pb-3 last:border-b-0"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          {!isDragDisabled && (
            <button
              {...attributes}
              {...listeners}
              className="p-0.5 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 select-none touch-none rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Drag to reorder category"
              aria-label={`Drag to reorder ${id} category`}
            >
              <Icon name="drag-handle-double" size="sm" />
            </button>
          )}
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded px-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-expanded={isExpanded}
            aria-controls={`category-${id}`}
          >
            <Icon
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              size="sm"
              className="transition-transform"
            />
            {id}
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              ({enabledCount}/{totalCount})
            </span>
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEnableAll}
            className="text-xs px-1.5 py-0.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title={`Enable all rules in ${id}`}
          >
            All
          </button>
          <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">|</span>
          <button
            onClick={onDisableAll}
            className="text-xs px-1.5 py-0.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
            title={`Disable all rules in ${id}`}
          >
            None
          </button>
        </div>
      </div>
      {isExpanded && (
        <div id={`category-${id}`} className="space-y-1.5 ml-2 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
          {children}
        </div>
      )}
    </div>
  )
})

// Sortable rule item within a category
interface SortableRuleItemProps {
  id: string
  isDragDisabled?: boolean
  children: React.ReactNode
}

export const SortableRuleItem = memo(function SortableRuleItem({
  id,
  isDragDisabled,
  children,
}: SortableRuleItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isDragDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      {!isDragDisabled && (
        <button
          {...attributes}
          {...listeners}
          className="p-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 select-none touch-none rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Drag to reorder rule"
          aria-label="Drag to reorder"
        >
          <Icon name="drag-handle" size="sm" />
        </button>
      )}
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
})
