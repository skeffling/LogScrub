import Prism from 'prismjs'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-javascript'

type Language = 'json' | 'markup' | 'sql' | 'bash' | 'javascript' | 'plain'

// Detect language from content patterns
export function detectLanguage(text: string): Language {
  const trimmed = text.trim()

  // JSON detection
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.includes('": ') || trimmed.includes('":')) {
    return 'json'
  }

  // XML/HTML detection
  if (trimmed.startsWith('<') && trimmed.includes('>')) {
    return 'markup'
  }

  // SQL detection (case-insensitive)
  const sqlKeywords = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|FROM|WHERE|JOIN|TABLE|INDEX)\b/i
  if (sqlKeywords.test(trimmed)) {
    return 'sql'
  }

  // Shell command detection
  if (trimmed.startsWith('$') || trimmed.startsWith('#') || trimmed.startsWith('>')) {
    return 'bash'
  }

  // JavaScript detection (function declarations, const/let/var, arrow functions)
  if (/\b(function|const|let|var|=>|import|export)\b/.test(trimmed)) {
    return 'javascript'
  }

  return 'plain'
}

// Token type to CSS class mapping for syntax highlighting
// Uses colors that work well on both light and dark backgrounds
const tokenColors: Record<string, string> = {
  // JSON
  'property': 'text-purple-600 dark:text-purple-400',
  'string': 'text-green-600 dark:text-green-400',
  'number': 'text-blue-600 dark:text-blue-400',
  'boolean': 'text-orange-600 dark:text-orange-400',
  'null': 'text-gray-500 dark:text-gray-400',
  'punctuation': 'text-gray-600 dark:text-gray-400',
  'operator': 'text-pink-600 dark:text-pink-400',

  // XML/HTML
  'tag': 'text-red-600 dark:text-red-400',
  'attr-name': 'text-orange-600 dark:text-orange-400',
  'attr-value': 'text-green-600 dark:text-green-400',

  // SQL
  'keyword': 'text-blue-600 dark:text-blue-400',
  'function': 'text-purple-600 dark:text-purple-400',

  // Bash
  'builtin': 'text-blue-600 dark:text-blue-400',
  'variable': 'text-orange-600 dark:text-orange-400',
  'shebang': 'text-gray-500 dark:text-gray-400',

  // JavaScript
  'class-name': 'text-yellow-600 dark:text-yellow-400',
  'constant': 'text-orange-600 dark:text-orange-400',
  'comment': 'text-gray-500 dark:text-gray-400 italic',
}

// Convert Prism token to React element
function tokenToElement(token: string | Prism.Token, key: number): React.ReactNode {
  if (typeof token === 'string') {
    return token
  }

  const content = typeof token.content === 'string'
    ? token.content
    : Array.isArray(token.content)
      ? token.content.map((t, i) => tokenToElement(t, i))
      : tokenToElement(token.content, 0)

  const tokenType = Array.isArray(token.type) ? token.type[0] : token.type
  const className = tokenColors[tokenType] || ''

  if (!className) {
    return content
  }

  return (
    <span key={key} className={className}>
      {content}
    </span>
  )
}

// Apply syntax highlighting to text, returning React elements
export function applySyntaxHighlighting(text: string, language?: Language): React.ReactNode {
  const lang = language || detectLanguage(text)

  if (lang === 'plain') {
    return text
  }

  try {
    const grammar = Prism.languages[lang]
    if (!grammar) {
      return text
    }

    const tokens = Prism.tokenize(text, grammar)
    return tokens.map((token, index) => tokenToElement(token, index))
  } catch {
    // If tokenization fails, return plain text
    return text
  }
}

// Apply syntax highlighting while preserving byte positions for PII overlay
// Returns an array of segments with their character offsets
export interface SyntaxSegment {
  text: string
  className: string
  start: number
  end: number
}

export function tokenizeWithPositions(text: string, language?: Language): SyntaxSegment[] {
  const lang = language || detectLanguage(text)
  const segments: SyntaxSegment[] = []

  if (lang === 'plain') {
    segments.push({ text, className: '', start: 0, end: text.length })
    return segments
  }

  try {
    const grammar = Prism.languages[lang]
    if (!grammar) {
      segments.push({ text, className: '', start: 0, end: text.length })
      return segments
    }

    const tokens = Prism.tokenize(text, grammar)
    let position = 0

    function processToken(token: string | Prism.Token): void {
      if (typeof token === 'string') {
        segments.push({
          text: token,
          className: '',
          start: position,
          end: position + token.length
        })
        position += token.length
      } else {
        const content = token.content
        const tokenType = Array.isArray(token.type) ? token.type[0] : token.type
        const className = tokenColors[tokenType] || ''

        if (typeof content === 'string') {
          segments.push({
            text: content,
            className,
            start: position,
            end: position + content.length
          })
          position += content.length
        } else if (Array.isArray(content)) {
          // For nested tokens, process each child
          content.forEach(processToken)
        } else {
          processToken(content)
        }
      }
    }

    tokens.forEach(processToken)
    return segments
  } catch {
    segments.push({ text, className: '', start: 0, end: text.length })
    return segments
  }
}
