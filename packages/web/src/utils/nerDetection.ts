/**
 * ML-based Named Entity Recognition using Transformers.js
 *
 * This module provides lazy-loaded NER for detecting person names, locations,
 * and organizations that pattern-based detection may miss.
 *
 * All processing happens in the browser - models are downloaded and cached in IndexedDB.
 */

import { DEFAULT_MODEL_ID, AVAILABLE_MODELS } from './nerModels'
export type { NERModel } from './nerModels'
export { AVAILABLE_MODELS, DEFAULT_MODEL_ID } from './nerModels'

export interface NEREntity {
  entity: string
  word: string
  score: number
  start: number
  end: number
  entityGroup: 'PER' | 'LOC' | 'ORG' | 'MISC'
}

export interface NERResult {
  entities: NEREntity[]
  processingTimeMs: number
}

export type NERLoadingState = 'idle' | 'loading' | 'ready' | 'error'

interface NERPipeline {
  (text: string, options?: { aggregation_strategy?: string }): Promise<NEREntity[]>
}

// Singleton state for the pipeline
let pipeline: NERPipeline | null = null
let loadingState: NERLoadingState = 'idle'
let loadError: string | null = null
let currentModelId: string | null = null
let loadProgressCallback: ((progress: number) => void) | null = null

/**
 * Register a callback to receive model download progress updates
 */
export function onLoadProgress(callback: (progress: number) => void): () => void {
  loadProgressCallback = callback
  return () => {
    loadProgressCallback = null
  }
}

/**
 * Get the current loading state
 */
export function getLoadingState(): { state: NERLoadingState; error: string | null; modelId: string | null } {
  return { state: loadingState, error: loadError, modelId: currentModelId }
}

/**
 * Base URL for self-hosted models.
 * Set to a URL like "/models" or "https://cdn.example.com/models"
 * Models should be at: {baseUrl}/{modelId}/ (e.g., /models/Xenova/bert-base-NER/)
 */
let modelHostUrl: string | null = null

/**
 * Configure self-hosted model location.
 *
 * @example
 * // Models in public/models/ folder (served at /models/)
 * setModelHost('/models')
 *
 * // Models on a CDN
 * setModelHost('https://cdn.example.com/ml-models')
 *
 * // Reset to use Hugging Face Hub
 * setModelHost(null)
 */
export function setModelHost(baseUrl: string | null): void {
  modelHostUrl = baseUrl
}

/**
 * Get current model host URL
 */
export function getModelHost(): string | null {
  return modelHostUrl
}

/**
 * Load the NER pipeline with the specified model.
 * The model and tokenizer are cached in IndexedDB after first download.
 *
 * Models can be loaded from:
 * 1. Hugging Face Hub (default) - e.g., "Xenova/bert-base-NER"
 * 2. Self-hosted - call setModelHost('/models') first
 *
 * To self-host models:
 * 1. Download from: https://huggingface.co/Xenova/bert-base-NER/tree/main
 * 2. Put files in: public/models/Xenova/bert-base-NER/
 *    - onnx/model_quantized.onnx (or model.onnx)
 *    - config.json
 *    - tokenizer.json
 *    - tokenizer_config.json
 * 3. Call setModelHost('/models') before loading
 */
export async function loadNERPipeline(modelId: string = DEFAULT_MODEL_ID): Promise<void> {
  if (loadingState === 'loading') {
    throw new Error('Model is already loading')
  }

  if (loadingState === 'ready' && currentModelId === modelId) {
    return
  }

  loadingState = 'loading'
  loadError = null
  currentModelId = modelId

  try {
    const { pipeline: createPipeline, env } = await import('@huggingface/transformers')

    // Configure Transformers.js
    env.useBrowserCache = true

    // Self-hosted models
    if (modelHostUrl) {
      env.localModelPath = modelHostUrl
      env.allowRemoteModels = false
      env.allowLocalModels = true
    } else {
      env.allowRemoteModels = true
      env.allowLocalModels = false
    }

    // Create pipeline with progress tracking
    pipeline = await createPipeline('token-classification', modelId, {
      progress_callback: (progress: { status: string; progress?: number }) => {
        if (progress.status === 'progress' && progress.progress !== undefined) {
          loadProgressCallback?.(progress.progress)
        }
      }
    }) as unknown as NERPipeline

    loadingState = 'ready'
    loadProgressCallback?.(100)
  } catch (err) {
    loadingState = 'error'
    loadError = err instanceof Error ? err.message : 'Failed to load NER model'
    pipeline = null
    throw err
  }
}

/**
 * Unload the NER pipeline to free memory
 */
export function unloadNERPipeline(): void {
  pipeline = null
  loadingState = 'idle'
  loadError = null
  currentModelId = null
}

/**
 * Run NER on the given text.
 * Returns detected entities with their positions and types.
 */
export async function runNER(text: string): Promise<NERResult> {
  if (!pipeline) {
    throw new Error('NER pipeline not loaded. Call loadNERPipeline first.')
  }

  const startTime = performance.now()

  // Run inference with aggregation to combine word pieces
  // Using 'average' strategy which typically works better for merging subwords
  const rawEntities = await pipeline(text, {
    aggregation_strategy: 'average'
  })

  // Post-process to merge adjacent entities of the same type
  // Some models don't fully aggregate multi-word names like "Steve Bull"
  const mergedEntities: NEREntity[] = []

  // Raw entities from pipeline have slightly different shape
  interface RawEntity {
    entity?: string
    entity_group?: string
    word: string
    score: number
    start: number
    end: number
  }

  for (const e of rawEntities as RawEntity[]) {
    // Extract entity group from entity label (e.g., "B-PER" -> "PER", "PER" -> "PER")
    let entityGroup: NEREntity['entityGroup'] = 'MISC'
    const entityLabel = String(e.entity || e.entity_group || '')
    if (entityLabel.includes('PER')) entityGroup = 'PER'
    else if (entityLabel.includes('LOC')) entityGroup = 'LOC'
    else if (entityLabel.includes('ORG')) entityGroup = 'ORG'

    // Skip WordPiece continuation tokens that weren't aggregated
    const word = String(e.word || '')
    if (word.startsWith('##')) continue

    // Validate positions are reasonable
    const spanLength = e.end - e.start
    if (spanLength <= 0 || spanLength > 100) {
      // Skip entities with invalid or unreasonably large spans
      // Names, locations, orgs are typically < 100 chars
      continue
    }

    // Use the actual text at the position, not the model's word
    // This ensures positions are accurate
    const actualText = text.slice(e.start, e.end)

    // Skip if the extracted text doesn't look like the entity
    // (basic sanity check - at least some overlap)
    const wordLower = word.toLowerCase().replace(/\s+/g, '')
    const actualLower = actualText.toLowerCase().replace(/\s+/g, '')
    if (wordLower.length > 0 && actualLower.length > 0) {
      // Check if either contains the other or they share significant overlap
      const hasOverlap = wordLower.includes(actualLower.slice(0, 3)) ||
                         actualLower.includes(wordLower.slice(0, 3))
      if (!hasOverlap && wordLower !== actualLower) {
        // Positions don't match the expected word - skip
        continue
      }
    }

    const current: NEREntity = {
      entity: entityLabel,
      word: actualText, // Use actual text from source
      score: e.score,
      start: e.start,
      end: e.end,
      entityGroup
    }

    // Check if we should merge with the previous entity
    // Only merge adjacent words that form multi-word names like "Steve Bull"
    const prev = mergedEntities[mergedEntities.length - 1]
    if (prev && prev.entityGroup === current.entityGroup) {
      const gap = current.start - prev.end
      // Only merge if:
      // 1. Gap is exactly 1 character (a space between words)
      // 2. The gap character is whitespace
      // 3. The merged result won't be too long (max ~50 chars for a name)
      // 4. Previous entity isn't already too long from prior merges
      if (gap === 1 && prev.end - prev.start < 40) {
        const gapChar = text.slice(prev.end, current.start)
        if (gapChar === ' ') {
          // Merge: extend previous entity to include current
          prev.end = current.end
          prev.word = text.slice(prev.start, prev.end)
          prev.score = Math.min(prev.score, current.score)
          continue
        }
      }
    }

    mergedEntities.push(current)
  }

  const processingTimeMs = performance.now() - startTime

  return {
    entities: mergedEntities,
    processingTimeMs
  }
}

/**
 * Filter NER results to only include person names with high confidence
 */
export function filterPersonNames(result: NERResult, minScore: number = 0.85): NEREntity[] {
  return result.entities.filter(e => e.entityGroup === 'PER' && e.score >= minScore)
}

/**
 * Check if the model is ready for inference
 */
export function isModelReady(): boolean {
  return loadingState === 'ready' && pipeline !== null
}

/**
 * Get estimated model download size for display
 */
export function getModelSize(modelId: string): string {
  const model = AVAILABLE_MODELS.find(m => m.id === modelId)
  return model?.size || 'Unknown'
}
