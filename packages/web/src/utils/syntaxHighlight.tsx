import Prism from 'prismjs'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-ini'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-nginx'
import 'prismjs/components/prism-diff'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-log'        // Built-in log format with stack traces, IPs, UUIDs, etc.
import 'prismjs/components/prism-http'       // HTTP requests/responses
import 'prismjs/components/prism-apacheconf' // Apache config

// Define custom CSV language for Prism
Prism.languages['csv'] = {
  'header': {
    pattern: /^.+$/m,
    inside: {
      'header-cell': /[^,\n]+/
    }
  },
  'quoted': {
    pattern: /"(?:[^"\\]|\\.)*"/,
    alias: 'string'
  },
  'number': {
    pattern: /\b\d+(?:\.\d+)?\b/,
    alias: 'number'
  },
  'delimiter': {
    pattern: /,/,
    alias: 'punctuation'
  }
}

type Language = 'json' | 'markup' | 'sql' | 'bash' | 'javascript' | 'yaml' | 'ini' | 'toml' | 'nginx' | 'diff' | 'python' | 'java' | 'csharp' | 'go' | 'csv' | 'http' | 'apacheconf' | 'log' | 'plain'

// Detect language from content patterns
export function detectLanguage(text: string): Language {
  const trimmed = text.trim()
  const firstLine = trimmed.split('\n')[0]

  // Diff detection (must be early - very distinctive)
  if (/^(diff\s|---\s|@@\s|\+\+\+\s|[-+]\s)/m.test(trimmed) ||
      (trimmed.includes('\n--- ') && trimmed.includes('\n+++ '))) {
    return 'diff'
  }

  // JSON detection
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.includes('": ') || trimmed.includes('":')) {
    return 'json'
  }

  // XML/HTML detection
  if (trimmed.startsWith('<') && trimmed.includes('>')) {
    return 'markup'
  }

  // YAML detection (must be before INI - both use key: value)
  if (/^---\s*$/m.test(trimmed) ||
      /^[a-zA-Z_][a-zA-Z0-9_]*:\s*[|>]?\s*$/m.test(trimmed) ||
      /^\s*-\s+[a-zA-Z_]/.test(trimmed) ||
      /^[a-zA-Z_][a-zA-Z0-9_]*:\s*\n\s+-/.test(trimmed)) {
    return 'yaml'
  }

  // TOML detection
  if (/^\[[a-zA-Z_][a-zA-Z0-9_.-]*\]\s*$/m.test(trimmed) ||
      /^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*\[/.test(trimmed) ||
      /^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*"""/.test(trimmed)) {
    return 'toml'
  }

  // INI/Properties detection
  if (/^\[[^\]]+\]\s*$/m.test(trimmed) && /^[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(trimmed)) {
    return 'ini'
  }

  // HTTP request/response detection
  if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE)\s+\S+\s+HTTP\//m.test(trimmed) ||
      /^HTTP\/[\d.]+\s+\d{3}\s+/m.test(trimmed)) {
    return 'http'
  }

  // Apache config detection
  if (/^<(VirtualHost|Directory|Location|Files|IfModule|IfDefine)\s/m.test(trimmed) ||
      /^\s*(ServerName|DocumentRoot|ErrorLog|CustomLog|RewriteRule|RewriteCond)\s/m.test(trimmed)) {
    return 'apacheconf'
  }

  // Nginx config detection
  if (/\b(server|location|upstream|http|events)\s*\{/.test(trimmed) ||
      /\b(proxy_pass|fastcgi_pass|root|index|listen)\s+/.test(trimmed)) {
    return 'nginx'
  }

  // SQL detection (case-insensitive)
  const sqlKeywords = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|FROM|WHERE|JOIN|TABLE|INDEX)\b/i
  if (sqlKeywords.test(trimmed)) {
    return 'sql'
  }

  // Python detection
  if (/^(def|class|import|from|if __name__)\s/.test(trimmed) ||
      /^\s*(def|class)\s+\w+.*:/.test(trimmed) ||
      /^#!.*python/.test(firstLine)) {
    return 'python'
  }

  // Java detection
  if (/\b(public|private|protected)\s+(static\s+)?(class|void|int|String|boolean)/.test(trimmed) ||
      /^package\s+[a-z]/.test(trimmed) ||
      /^import\s+java\./.test(trimmed)) {
    return 'java'
  }

  // C# detection
  if (/\bnamespace\s+\w+/.test(trimmed) ||
      /\b(public|private|internal)\s+(class|interface|struct|enum)/.test(trimmed) ||
      /^using\s+System/.test(trimmed)) {
    return 'csharp'
  }

  // Go detection
  if (/^package\s+\w+\s*$/.test(firstLine) ||
      /^func\s+(\w+|\([^)]+\)\s*\w+)\s*\(/.test(trimmed) ||
      /^import\s+\(/.test(trimmed)) {
    return 'go'
  }

  // Shell command detection
  if (trimmed.startsWith('$') || /^#!\/.*sh/.test(firstLine)) {
    return 'bash'
  }

  // JavaScript/TypeScript detection
  if (/\b(function|const|let|var|=>|import|export)\b/.test(trimmed)) {
    return 'javascript'
  }

  // CSV detection (comma-separated with consistent column count)
  const lines = trimmed.split('\n').slice(0, 5)
  if (lines.length >= 2) {
    const commaCount = (lines[0].match(/,/g) || []).length
    if (commaCount >= 2 && lines.every(l => (l.match(/,/g) || []).length === commaCount)) {
      return 'csv'
    }
  }

  // Log file detection - timestamps at start of lines or log levels
  const logPatterns = [
    /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/m,  // ISO timestamp
    /^\[\d{1,2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}/m,  // Apache CLF
    /^[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/m,  // Syslog
    /^\([A-Za-z]{3},\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\)/m,  // Chat transcript
    /\b(?:INFO|WARN|ERROR|DEBUG|TRACE|FATAL|NOTICE)\b/i,  // Log levels
  ]
  if (logPatterns.some(p => p.test(trimmed))) {
    return 'log'
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

  // Log files
  'timestamp': 'text-cyan-600 dark:text-cyan-400',
  'log-level-error': 'text-red-600 dark:text-red-400 font-semibold',
  'log-level-warn': 'text-yellow-600 dark:text-yellow-400 font-semibold',
  'log-level-info': 'text-blue-600 dark:text-blue-400',
  'log-level-debug': 'text-gray-500 dark:text-gray-500',
  'deleted': 'text-red-600 dark:text-red-400 font-semibold',
  'warning': 'text-yellow-600 dark:text-yellow-400 font-semibold',
  'ip-address': 'text-purple-600 dark:text-purple-400',
  'uuid': 'text-teal-600 dark:text-teal-400',
  'url': 'text-blue-600 dark:text-blue-400 underline',
  'key-value': 'text-purple-600 dark:text-purple-400',
  'quoted-string': 'text-green-600 dark:text-green-400',
  'bracketed': 'text-orange-600 dark:text-orange-400',
  'symbol': 'text-teal-600 dark:text-teal-400',

  // Diff
  'inserted': 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
  'coord': 'text-cyan-600 dark:text-cyan-400',

  // YAML/INI/TOML
  'atrule': 'text-purple-600 dark:text-purple-400',  // YAML keys
  'selector': 'text-blue-600 dark:text-blue-400',    // INI sections
  'section': 'text-blue-600 dark:text-blue-400',     // INI/TOML sections
  'title': 'text-blue-600 dark:text-blue-400',       // TOML tables
  'table': 'text-blue-600 dark:text-blue-400',       // TOML tables

  // CSV
  'header-cell': 'text-blue-600 dark:text-blue-400 font-semibold',
  'delimiter': 'text-gray-400 dark:text-gray-500',

  // Nginx
  'directive': 'text-blue-600 dark:text-blue-400',

  // Additional language tokens
  'decorator': 'text-yellow-600 dark:text-yellow-400',  // Python decorators
  'annotation': 'text-yellow-600 dark:text-yellow-400', // Java annotations
  'namespace': 'text-purple-600 dark:text-purple-400',
  'package': 'text-purple-600 dark:text-purple-400',

  // HTTP
  'method': 'text-blue-600 dark:text-blue-400 font-semibold',
  'request-target': 'text-green-600 dark:text-green-400',
  'http-version': 'text-gray-500 dark:text-gray-400',
  'status-code': 'text-orange-600 dark:text-orange-400 font-semibold',
  'reason-phrase': 'text-gray-600 dark:text-gray-400',
  'header-name': 'text-purple-600 dark:text-purple-400',
  'header-value': 'text-green-600 dark:text-green-400',

  // Log format (Prism built-in)
  'level': 'text-blue-600 dark:text-blue-400',
  'error': 'text-red-600 dark:text-red-400 font-semibold',
  'important': 'font-semibold',
  'info': 'text-blue-600 dark:text-blue-400',
  'debug': 'text-gray-500 dark:text-gray-400',
  'trace': 'text-gray-400 dark:text-gray-500 italic',
  'exception': 'text-red-600 dark:text-red-400',
  'date': 'text-cyan-600 dark:text-cyan-400',
  'time': 'text-cyan-600 dark:text-cyan-400',
  'file-path': 'text-green-600 dark:text-green-400',
  'domain': 'text-blue-600 dark:text-blue-400',
  'mac-address': 'text-purple-600 dark:text-purple-400',
  'hash': 'text-teal-600 dark:text-teal-400',
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
