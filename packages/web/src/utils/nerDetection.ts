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
  entityGroup: 'PER' | 'LOC' | 'ORG' | 'MISC' | 'ID' | 'CONTACT' | 'FINANCIAL' | 'CREDENTIAL' | 'TEMPORAL' | 'NETWORK'
}

/**
 * Maps PII model entity types to entity groups.
 * Supports the sfermion/bert-pii-detector-onnx model (27 entity types).
 */
const PII_ENTITY_MAP: Record<string, NEREntity['entityGroup']> = {
  // Personal identifiers -> PER (sfermion/bert-pii-detector-onnx)
  givenname1: 'PER',
  givenname2: 'PER',
  lastname1: 'PER',
  lastname2: 'PER',
  lastname3: 'PER',
  title: 'PER',
  sex: 'PER',
  bod: 'PER', // birth date

  // Location -> LOC
  street: 'LOC',
  city: 'LOC',
  state: 'LOC',
  country: 'LOC',
  postcode: 'LOC',
  building: 'LOC',
  secaddress: 'LOC', // secondary address
  geocoord: 'LOC',

  // ID documents -> ID
  passport: 'ID',
  idcard: 'ID',
  driverlicense: 'ID',
  socialnumber: 'ID',

  // Contact info -> CONTACT
  email: 'CONTACT',
  tel: 'CONTACT',

  // Credentials/secrets -> CREDENTIAL
  username: 'CREDENTIAL',
  pass: 'CREDENTIAL', // password

  // Temporal -> TEMPORAL
  date: 'TEMPORAL',
  time: 'TEMPORAL',

  // Network -> NETWORK
  ip: 'NETWORK'
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
let currentDevice: 'webgpu' | 'wasm' | null = null

/**
 * Check if WebGPU is available in this browser.
 * WebGPU provides 40-100x speedup over WASM for ML inference.
 */
async function isWebGPUSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false
  }
  // Type assertion needed as WebGPU types may not be in older TypeScript libs
  const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown | null> } }
  if (!nav.gpu) {
    return false
  }
  try {
    const adapter = await nav.gpu.requestAdapter()
    return adapter !== null
  } catch {
    return false
  }
}

/**
 * Get the current compute device being used
 */
export function getCurrentDevice(): 'webgpu' | 'wasm' | null {
  return currentDevice
}

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
export function getLoadingState(): { state: NERLoadingState; error: string | null; modelId: string | null; device: 'webgpu' | 'wasm' | null } {
  return { state: loadingState, error: loadError, modelId: currentModelId, device: currentDevice }
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
    console.log('[ML NER] Loading model:', modelId)
    const { pipeline: createPipeline, env } = await import('@huggingface/transformers')

    // Configure Transformers.js
    env.useBrowserCache = true

    // Self-hosted models
    if (modelHostUrl) {
      console.log('[ML NER] Using self-hosted models from:', modelHostUrl)
      env.localModelPath = modelHostUrl
      env.allowRemoteModels = false
      env.allowLocalModels = true
    } else {
      console.log('[ML NER] Using Hugging Face Hub')
      env.allowRemoteModels = true
      env.allowLocalModels = false
    }

    // Check for WebGPU support (40-100x faster than WASM)
    const webgpuSupported = await isWebGPUSupported()
    const device = webgpuSupported ? 'webgpu' : 'wasm'
    console.log('[ML NER] Using device:', device, webgpuSupported ? '(GPU accelerated)' : '(CPU fallback)')

    // Create pipeline with progress tracking
    console.log('[ML NER] Creating pipeline...')
    pipeline = await createPipeline('token-classification', modelId, {
      device,
      progress_callback: (progress: { status: string; progress?: number; file?: string }) => {
        if (progress.status === 'progress' && progress.progress !== undefined) {
          loadProgressCallback?.(progress.progress)
        }
        // Log download progress for debugging
        if (progress.file) {
          console.log('[ML NER] Downloading:', progress.file, progress.progress?.toFixed(1) + '%')
        }
      }
    }) as unknown as NERPipeline
    currentDevice = device

    console.log('[ML NER] Model loaded successfully')
    loadingState = 'ready'
    loadProgressCallback?.(100)
  } catch (err) {
    console.error('[ML NER] Failed to load model:', err)
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
  currentDevice = null
}

/**
 * Run NER on the given text.
 * Returns detected entities with their positions and types.
 *
 * The model returns raw tokens with B-XXX/I-XXX labels and token indices.
 * We manually aggregate these into complete entities with character positions.
 */
export async function runNER(text: string): Promise<NERResult> {
  if (!pipeline) {
    throw new Error('NER pipeline not loaded. Call loadNERPipeline first.')
  }

  const startTime = performance.now()

  // Run inference - model returns raw tokens
  const rawEntities = await pipeline(text)

  // Raw token format from model:
  // { entity: "B-PER", score: 0.99, index: 7, word: "ami" }
  // { entity: "B-PER", score: 0.97, index: 8, word: "##t" }  (WordPiece continuation)
  // { entity: "I-PER", score: 0.99, index: 9, word: "kumar" }
  interface RawToken {
    entity: string      // B-PER, I-PER, B-LOC, etc.
    score: number
    index: number       // Token index (not character position)
    word: string        // Token text (may be WordPiece like "##t")
    start?: number      // Some models include character positions
    end?: number
  }

  // Aggregate tokens into entities
  // B-XXX starts a new entity, I-XXX continues it, ##xxx is a WordPiece continuation
  const aggregatedEntities: Array<{
    type: string
    words: string[]
    scores: number[]
    start?: number
    end?: number
  }> = []

  let currentEntity: typeof aggregatedEntities[0] | null = null

  for (const token of rawEntities as unknown as RawToken[]) {
    const entity = token.entity || ''
    const isBegin = entity.startsWith('B-')
    const isInside = entity.startsWith('I-')
    const entityType = entity.replace(/^[BI]-/, '')

    // WordPiece continuation (##xxx) - append to current word
    if (token.word.startsWith('##') && currentEntity) {
      const lastIdx = currentEntity.words.length - 1
      if (lastIdx >= 0) {
        currentEntity.words[lastIdx] += token.word.slice(2) // Remove ## prefix
        currentEntity.scores.push(token.score)
        if (token.end !== undefined) currentEntity.end = token.end
      }
      continue
    }

    // B-XXX starts a new entity
    if (isBegin) {
      // Save previous entity if exists
      if (currentEntity) {
        aggregatedEntities.push(currentEntity)
      }
      currentEntity = {
        type: entityType,
        words: [token.word],
        scores: [token.score],
        start: token.start,
        end: token.end
      }
      continue
    }

    // I-XXX continues current entity (if same type)
    if (isInside && currentEntity && currentEntity.type === entityType) {
      currentEntity.words.push(token.word)
      currentEntity.scores.push(token.score)
      if (token.end !== undefined) currentEntity.end = token.end
      continue
    }

    // Different entity type or no current entity - start new
    if (currentEntity) {
      aggregatedEntities.push(currentEntity)
    }
    if (isInside || isBegin) {
      currentEntity = {
        type: entityType,
        words: [token.word],
        scores: [token.score],
        start: token.start,
        end: token.end
      }
    } else {
      currentEntity = null
    }
  }

  // Don't forget last entity
  if (currentEntity) {
    aggregatedEntities.push(currentEntity)
  }

  // Convert to final format and find positions in text
  const entities: NEREntity[] = []

  // Track positions we've already used to avoid duplicates
  // Key: word (lowercase), Value: array of start positions already used
  const usedPositions: Map<string, number[]> = new Map()

  for (const agg of aggregatedEntities) {
    // Reconstruct the full text (join words with spaces)
    const fullWord = agg.words.join(' ')
    const avgScore = agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length

    // Skip low confidence
    if (avgScore < 0.5) continue

    // Skip very short words - single letters/chars are almost always false positives
    // Real names, locations, and organizations are at least 2 characters
    if (fullWord.length < 2) continue

    // Map entity type based on model type
    // Standard NER models use PER/LOC/ORG, PII models use specific types like first_name, ssn
    const currentModel = AVAILABLE_MODELS.find(m => m.id === currentModelId)
    const isPiiModel = currentModel?.modelType === 'pii'

    let entityGroup: NEREntity['entityGroup'] = 'MISC'
    if (isPiiModel) {
      // PII model: map specific types to groups
      const entityType = agg.type.toLowerCase()
      entityGroup = PII_ENTITY_MAP[entityType] || 'MISC'
    } else {
      // Standard NER model
      if (agg.type === 'PER') entityGroup = 'PER'
      else if (agg.type === 'LOC') entityGroup = 'LOC'
      else if (agg.type === 'ORG') entityGroup = 'ORG'
    }

    // Find position in text (case-insensitive search)
    let start = agg.start
    let end = agg.end

    if (start === undefined || end === undefined) {
      // Search for the word in the text, avoiding already-used positions
      const searchWord = fullWord.toLowerCase()
      const textLower = text.toLowerCase()
      const usedForThisWord = usedPositions.get(searchWord) || []

      // Find the next occurrence that hasn't been used yet
      let searchFrom = 0
      let idx = -1
      while (true) {
        idx = textLower.indexOf(searchWord, searchFrom)
        if (idx === -1) break

        // Check if this position is already used
        if (!usedForThisWord.includes(idx)) {
          break // Found an unused position
        }

        // Try searching from after this position
        searchFrom = idx + 1
      }

      if (idx !== -1) {
        start = idx
        end = idx + fullWord.length
        // Mark this position as used
        usedForThisWord.push(idx)
        usedPositions.set(searchWord, usedForThisWord)
      } else {
        // Can't find joined word - try searching for individual words as fallback
        // This handles cases where the text has different whitespace than expected
        const words = agg.words
        if (words.length > 1) {
          // Try to find the first word and last word to get the span
          const firstWord = words[0].toLowerCase()
          const lastWord = words[words.length - 1].toLowerCase()
          const firstIdx = textLower.indexOf(firstWord)
          if (firstIdx !== -1) {
            // Search for last word after first word
            const lastIdx = textLower.indexOf(lastWord, firstIdx + firstWord.length)
            if (lastIdx !== -1) {
              start = firstIdx
              end = lastIdx + lastWord.length
            }
          }
        }

        if (start === undefined || end === undefined) {
          continue
        }
      }
    }

    // Validate span
    if (start === undefined || end === undefined) continue
    if (end - start > 100 || end - start <= 0) continue

    // Use actual text at position
    const actualWord = text.slice(start, end)

    entities.push({
      entity: agg.type,
      word: actualWord,
      score: avgScore,
      start,
      end,
      entityGroup
    })
  }

  const processingTimeMs = performance.now() - startTime


  return {
    entities,
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

/**
 * Check if a model is cached in the browser.
 * Transformers.js uses the Cache API with cache name 'transformers-cache'.
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    // Transformers.js uses the Cache API
    const cache = await caches.open('transformers-cache')
    const keys = await cache.keys()

    // Check if any cached URL contains this model ID
    // URLs look like: https://huggingface.co/Xenova/bert-base-NER/resolve/main/...
    const modelPattern = modelId.replace('/', '/')
    return keys.some(request => request.url.includes(modelPattern))
  } catch {
    // Cache API not available or error
    return false
  }
}

/**
 * Get cache status for all available models.
 * Returns a map of model ID to cached status.
 */
export async function getModelCacheStatus(): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {}

  try {
    const cache = await caches.open('transformers-cache')
    const keys = await cache.keys()
    const urls = keys.map(request => request.url)

    for (const model of AVAILABLE_MODELS) {
      const modelPattern = model.id.replace('/', '/')
      status[model.id] = urls.some(url => url.includes(modelPattern))
    }
  } catch {
    // Cache API not available - mark all as not cached
    for (const model of AVAILABLE_MODELS) {
      status[model.id] = false
    }
  }

  return status
}

/**
 * Delete a cached model from the browser.
 * This removes all cached files for the specified model.
 */
export async function deleteModelCache(modelId: string): Promise<boolean> {
  try {
    const cache = await caches.open('transformers-cache')
    const keys = await cache.keys()

    // Find all cached URLs for this model
    const modelPattern = modelId.replace('/', '/')
    const modelKeys = keys.filter(request => request.url.includes(modelPattern))

    if (modelKeys.length === 0) {
      return false // Nothing to delete
    }

    // Delete all matching entries
    await Promise.all(modelKeys.map(key => cache.delete(key)))

    // If this is the currently loaded model, unload it
    if (currentModelId === modelId) {
      unloadNERPipeline()
    }

    return true
  } catch (err) {
    console.error('[ML NER] Failed to delete model cache:', err)
    return false
  }
}

/**
 * Get approximate size of cached model files.
 * Returns size in bytes, or 0 if not cached or error.
 */
export async function getCachedModelSize(modelId: string): Promise<number> {
  try {
    const cache = await caches.open('transformers-cache')
    const keys = await cache.keys()

    const modelPattern = modelId.replace('/', '/')
    const modelKeys = keys.filter(request => request.url.includes(modelPattern))

    let totalSize = 0
    for (const key of modelKeys) {
      const response = await cache.match(key)
      if (response) {
        const blob = await response.clone().blob()
        totalSize += blob.size
      }
    }

    return totalSize
  } catch {
    return 0
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
