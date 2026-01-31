/**
 * Available NER models for ML Name Detection
 * Separated from nerDetection.ts to allow static import without loading Transformers.js
 */

export interface NERModel {
  id: string
  name: string
  description: string
  size: string // Approximate download size
  accuracy: 'high' | 'medium' | 'low'
  speed: 'fast' | 'medium' | 'slow'
}

export const AVAILABLE_MODELS: NERModel[] = [
  {
    id: 'Xenova/bert-base-NER',
    name: 'BERT Base NER',
    description: 'Best accuracy, larger download',
    size: '~420 MB',
    accuracy: 'high',
    speed: 'slow'
  },
  {
    id: 'Xenova/distilbert-base-NER',
    name: 'DistilBERT NER',
    description: 'Good balance of speed and accuracy',
    size: '~250 MB',
    accuracy: 'medium',
    speed: 'medium'
  },
  {
    id: 'Xenova/bert-base-NER-uncased',
    name: 'BERT Base NER (uncased)',
    description: 'Case-insensitive matching',
    size: '~420 MB',
    accuracy: 'high',
    speed: 'slow'
  }
]

export const DEFAULT_MODEL_ID = 'Xenova/distilbert-base-NER'
