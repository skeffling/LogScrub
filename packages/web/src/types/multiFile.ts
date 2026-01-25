import type { DetectionStats, DetectionMatches, ReplacementInfo } from '../stores/useAppStore'

export type FileStatus = 'pending' | 'analyzing' | 'analyzed' | 'processing' | 'processed' | 'error'

export interface FileEntry {
  id: string                      // crypto.randomUUID()
  name: string
  size: number
  content: string
  scrubbedContent: string | null
  status: FileStatus
  error: string | null

  // Per-file analysis results (from analyze mode)
  analysisStats: DetectionStats
  analysisMatches: DetectionMatches
  analysisReplacements: ReplacementInfo[]

  // Per-file processing results (from scrub mode)
  stats: DetectionStats
  matches: DetectionMatches
  replacements: ReplacementInfo[]
}

export interface AggregatedStats {
  totalDetections: number
  byType: DetectionStats           // Combined counts by rule type
  byFile: Record<string, number>   // fileId -> total detections
  allMatches: DetectionMatches
  allReplacements: ReplacementInfo[]
}

export interface BatchProgress {
  current: number
  total: number
  currentFileName: string
}

// File limits
export const MAX_FILES = 50
export const MAX_TOTAL_SIZE = 100 * 1024 * 1024  // 100MB
export const WARNING_SIZE = 50 * 1024 * 1024     // 50MB

// Accepted file extensions
export const ACCEPTED_EXTENSIONS = ['.log', '.txt', '.json', '.xml', '.csv', '.zip']
export const TEXT_EXTENSIONS = ['.log', '.txt', '.json', '.xml', '.csv', '.yaml', '.yml', '.toml', '.md', '.conf', '.cfg', '.ini']

export function isTextFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
  return TEXT_EXTENSIONS.includes(ext) || !ext.includes('.')
}

export function createEmptyFileEntry(name: string, size: number, content: string): FileEntry {
  return {
    id: crypto.randomUUID(),
    name,
    size,
    content,
    scrubbedContent: null,
    status: 'pending',
    error: null,
    analysisStats: {},
    analysisMatches: {},
    analysisReplacements: [],
    stats: {},
    matches: {},
    replacements: []
  }
}
