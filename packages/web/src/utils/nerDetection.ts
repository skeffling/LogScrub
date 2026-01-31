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
  const entities = await pipeline(text, {
    aggregation_strategy: 'simple'
  })

  const processingTimeMs = performance.now() - startTime

  // Map the results to our format
  const mappedEntities: NEREntity[] = entities.map((e: NEREntity) => {
    // Extract entity group from entity label (e.g., "B-PER" -> "PER")
    let entityGroup: NEREntity['entityGroup'] = 'MISC'
    const entity = String(e.entity || '')
    if (entity.includes('PER')) entityGroup = 'PER'
    else if (entity.includes('LOC')) entityGroup = 'LOC'
    else if (entity.includes('ORG')) entityGroup = 'ORG'

    return {
      entity: entity,
      word: e.word,
      score: e.score,
      start: e.start,
      end: e.end,
      entityGroup
    }
  })

  return {
    entities: mappedEntities,
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
