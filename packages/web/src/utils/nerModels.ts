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
  recommended?: boolean
  /**
   * Model type affects entity mapping:
   * - 'ner': Standard NER (PER, LOC, ORG, MISC)
   * - 'pii': PII-specific model (maps detailed types like first_name, ssn to groups)
   */
  modelType?: 'ner' | 'pii'
  /** URL to the model's Hugging Face page */
  url?: string
}

export const AVAILABLE_MODELS: NERModel[] = [
  {
    id: 'Xenova/bert-base-NER',
    name: 'BERT Base NER',
    description: 'Best accuracy for English names',
    size: '~420 MB',
    accuracy: 'high',
    speed: 'medium',
    recommended: true,
    modelType: 'ner',
    url: 'https://huggingface.co/Xenova/bert-base-NER'
  },
  {
    id: 'Xenova/bert-base-NER-uncased',
    name: 'BERT Base NER (uncased)',
    description: 'Case-insensitive matching',
    size: '~420 MB',
    accuracy: 'high',
    speed: 'medium',
    modelType: 'ner',
    url: 'https://huggingface.co/Xenova/bert-base-NER-uncased'
  },
  {
    id: 'Xenova/bert-base-multilingual-cased-ner-hrl',
    name: 'BERT Multilingual NER',
    description: 'Supports multiple languages',
    size: '~680 MB',
    accuracy: 'high',
    speed: 'slow',
    modelType: 'ner',
    url: 'https://huggingface.co/Xenova/bert-base-multilingual-cased-ner-hrl'
  },
  {
    id: 'Xenova/distilbert-base-multilingual-cased-ner-hrl',
    name: 'DistilBERT Multilingual NER',
    description: 'Faster multilingual model',
    size: '~270 MB',
    accuracy: 'medium',
    speed: 'fast',
    modelType: 'ner',
    url: 'https://huggingface.co/Xenova/distilbert-base-multilingual-cased-ner-hrl'
  },
  {
    id: 'OpenMed/OpenMed-PII-BioClinicalModern-Base-149M-v1',
    name: 'OpenMed PII (Medical/Clinical)',
    description: '54 PII types including SSN, medical records, credentials',
    size: '~600 MB',
    accuracy: 'high',
    speed: 'medium',
    modelType: 'pii',
    url: 'https://huggingface.co/OpenMed/OpenMed-PII-BioClinicalModern-Base-149M-v1'
  }
]

export const DEFAULT_MODEL_ID = 'Xenova/bert-base-NER'
