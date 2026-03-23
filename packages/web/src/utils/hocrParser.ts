import type { ReplacementInfo } from '../stores/useAppStore'

export interface HocrWord {
  text: string
  bbox: { x1: number; y1: number; x2: number; y2: number }
  textStart: number
  textEnd: number
}

export interface HocrPage {
  words: HocrWord[]
  fullText: string
  width: number
  height: number
}

export interface RedactionBox {
  bbox: { x1: number; y1: number; x2: number; y2: number }
  piiType: string
  original: string
  replacement: string
}

/**
 * Parse an hOCR HTML string into structured word data with bounding boxes.
 * Builds fullText from the words themselves to guarantee position alignment.
 */
export function parseHocr(hocrHtml: string): HocrPage {
  const parser = new DOMParser()
  const doc = parser.parseFromString(hocrHtml, 'text/html')

  // Extract page dimensions from ocr_page div
  let pageWidth = 0
  let pageHeight = 0
  const pageDiv = doc.querySelector('.ocr_page')
  if (pageDiv) {
    const title = pageDiv.getAttribute('title') || ''
    const bboxMatch = title.match(/bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/)
    if (bboxMatch) {
      pageWidth = parseInt(bboxMatch[3], 10)
      pageHeight = parseInt(bboxMatch[4], 10)
    }
  }

  // Extract all words with bounding boxes
  const wordSpans = doc.querySelectorAll('.ocrx_word')
  const words: HocrWord[] = []
  let offset = 0

  wordSpans.forEach((span) => {
    const text = span.textContent || ''
    if (!text.trim()) return

    const title = span.getAttribute('title') || ''
    const bboxMatch = title.match(/bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/)
    if (!bboxMatch) return

    // Add space separator between words (except for the first word)
    if (offset > 0) offset += 1

    words.push({
      text,
      bbox: {
        x1: parseInt(bboxMatch[1], 10),
        y1: parseInt(bboxMatch[2], 10),
        x2: parseInt(bboxMatch[3], 10),
        y2: parseInt(bboxMatch[4], 10),
      },
      textStart: offset,
      textEnd: offset + text.length,
    })

    offset += text.length
  })

  // Build fullText from words to ensure alignment
  const fullText = words.map(w => w.text).join(' ')

  return { words, fullText, width: pageWidth, height: pageHeight }
}

/**
 * Map ReplacementInfo ranges (which reference fullText offsets) to
 * bounding boxes from hOCR words. A single replacement may span
 * multiple words, producing multiple boxes.
 */
export function mapReplacementsToBoxes(
  words: HocrWord[],
  replacements: ReplacementInfo[]
): RedactionBox[] {
  const boxes: RedactionBox[] = []

  for (const rep of replacements) {
    for (const word of words) {
      // Check if word range overlaps with replacement range
      if (word.textEnd > rep.start && word.textStart < rep.end) {
        boxes.push({
          bbox: word.bbox,
          piiType: rep.pii_type,
          original: rep.original,
          replacement: rep.replacement,
        })
      }
    }
  }

  return boxes
}
