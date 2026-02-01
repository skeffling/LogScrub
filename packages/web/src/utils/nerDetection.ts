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

  // Debug: log raw output from model
  console.log('[ML NER] Raw pipeline output:', rawEntities)

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

  console.log('[ML NER] Aggregated entities before filtering:', aggregatedEntities)

  for (const agg of aggregatedEntities) {
    // Reconstruct the full text (join words with spaces)
    const fullWord = agg.words.join(' ')
    const avgScore = agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length

    console.log('[ML NER] Processing entity:', { fullWord, avgScore: avgScore.toFixed(3), type: agg.type })

    // Skip low confidence
    if (avgScore < 0.5) {
      console.log('[ML NER] Skipped (low confidence):', fullWord)
      continue
    }

    // Skip very short words - single letters/chars are almost always false positives
    // Real names, locations, and organizations are at least 2 characters
    if (fullWord.length < 2) {
      console.log('[ML NER] Skipped (too short):', fullWord)
      continue
    }

    // Map entity type
    let entityGroup: NEREntity['entityGroup'] = 'MISC'
    if (agg.type === 'PER') entityGroup = 'PER'
    else if (agg.type === 'LOC') entityGroup = 'LOC'
    else if (agg.type === 'ORG') entityGroup = 'ORG'

    // Find position in text (case-insensitive search)
    let start = agg.start
    let end = agg.end

    if (start === undefined || end === undefined) {
      // Search for the word in the text, avoiding already-used positions
      const searchWord = fullWord.toLowerCase()
      const textLower = text.toLowerCase()
      const usedForThisWord = usedPositions.get(searchWord) || []

      console.log('[ML NER] Searching for:', JSON.stringify(searchWord), 'in text starting:', JSON.stringify(textLower.slice(0, 100)))

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
        // Can't find any more occurrences in text - skip this entity
        // Try searching for individual words as fallback
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
              console.log('[ML NER] Found via word-by-word search:', { firstWord, lastWord, start, end })
            }
          }
        }

        if (start === undefined || end === undefined) {
          console.log('[ML NER] Skipped (not found in text):', fullWord)
          continue
        }
      }
    }

    // Validate span
    if (start === undefined || end === undefined) {
      console.log('[ML NER] Skipped (undefined span):', fullWord)
      continue
    }
    if (end - start > 100 || end - start <= 0) {
      console.log('[ML NER] Skipped (invalid span):', fullWord, { start, end })
      continue
    }

    // Use actual text at position
    const actualWord = text.slice(start, end)

    console.log('[ML NER] Adding entity:', { actualWord, entityGroup, score: avgScore.toFixed(3), start, end })
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
