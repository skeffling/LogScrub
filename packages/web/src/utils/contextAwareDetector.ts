/**
 * Context-aware detection for JSON-structured logs.
 * Parses JSON and flags values associated with suspicious keys.
 */

export interface ContextMatch {
  type: 'json_key'
  key: string           // The suspicious key name
  value: string         // The value to potentially redact
  path: string          // JSON path (e.g., "config.database.password")
  start: number         // Position in original text
  end: number
  confidence: 'high' | 'medium'
}

// High confidence keys - exact matches
const HIGH_CONFIDENCE_KEYS = new Set([
  'password', 'passwd', 'pwd', 'secret', 'token', 'auth',
  'credential', 'credentials', 'api_key', 'apikey', 'apiKey',
  'access_key', 'accessKey', 'private_key', 'privateKey',
  'client_secret', 'clientSecret', 'auth_token', 'authToken',
  'access_token', 'accessToken', 'refresh_token', 'refreshToken',
  'bearer', 'jwt', 'ssh_key', 'sshKey',
  'passphrase', 'session_token', 'sessionToken',
  'secret_key', 'secretKey', 'encryption_key', 'encryptionKey',
  'signing_key', 'signingKey', 'master_key', 'masterKey'
])

// Medium confidence patterns - partial matches
const MEDIUM_CONFIDENCE_PATTERNS = [
  /_key$/i,
  /_token$/i,
  /_secret$/i,
  /_password$/i,
  /^auth/i,
  /cred/i,
  /pass$/i
]

function getKeyConfidence(key: string): 'high' | 'medium' | null {
  const lowerKey = key.toLowerCase()

  // Check high confidence exact matches
  if (HIGH_CONFIDENCE_KEYS.has(lowerKey) || HIGH_CONFIDENCE_KEYS.has(key)) {
    return 'high'
  }

  // Check medium confidence patterns
  for (const pattern of MEDIUM_CONFIDENCE_PATTERNS) {
    if (pattern.test(key)) {
      return 'medium'
    }
  }

  return null
}

/**
 * Check if a string is likely to be a value worth flagging.
 * Excludes empty strings, very short values, obvious placeholders, etc.
 */
function isSignificantValue(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (value.length < 3) return false

  // Skip obvious placeholders
  const placeholders = ['null', 'none', 'undefined', 'xxx', '***', '...', 'n/a', 'na']
  if (placeholders.includes(value.toLowerCase())) return false

  // Skip values that are just repeated characters
  if (/^(.)\1+$/.test(value)) return false

  return true
}

interface JsonFragment {
  text: string
  start: number
  end: number
}

/**
 * Extract JSON fragments from text (handles pure JSON, NDJSON, and embedded JSON)
 */
function extractJsonFragments(text: string): JsonFragment[] {
  const fragments: JsonFragment[] = []

  // Try parsing as pure JSON first
  const trimmed = text.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      fragments.push({ text: trimmed, start: text.indexOf(trimmed), end: text.indexOf(trimmed) + trimmed.length })
      return fragments
    } catch {
      // Not pure JSON, continue to other methods
    }
  }

  // Try NDJSON (newline-delimited JSON) - common in logs
  const lines = text.split('\n')
  let lineStart = 0
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
      try {
        JSON.parse(trimmedLine)
        const actualStart = lineStart + line.indexOf(trimmedLine)
        fragments.push({
          text: trimmedLine,
          start: actualStart,
          end: actualStart + trimmedLine.length
        })
      } catch {
        // Not valid JSON, skip
      }
    }
    lineStart += line.length + 1 // +1 for newline
  }

  if (fragments.length > 0) {
    return fragments
  }

  // Look for embedded JSON objects in log lines
  // Pattern: anything followed by JSON object
  const embeddedPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
  let match
  while ((match = embeddedPattern.exec(text)) !== null) {
    try {
      JSON.parse(match[0])
      fragments.push({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length
      })
    } catch {
      // Not valid JSON, skip
    }
  }

  return fragments
}

/**
 * Recursively walk a JSON object and find suspicious key-value pairs.
 */
function walkObject(
  obj: unknown,
  path: string,
  jsonText: string,
  baseOffset: number,
  matches: ContextMatch[]
): void {
  if (typeof obj !== 'object' || obj === null) return

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      walkObject(item, `${path}[${index}]`, jsonText, baseOffset, matches)
    })
    return
  }

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key
    const confidence = getKeyConfidence(key)

    if (confidence && isSignificantValue(value)) {
      // Find the position of this value in the JSON text
      // We search for the key-value pair pattern to find accurate positions
      const valueStr = typeof value === 'string' ? value : String(value)
      const escapedValue = JSON.stringify(value)

      // Build a regex to find the key-value pair
      const keyPattern = `"${key}"\\s*:\\s*${escapedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      const regex = new RegExp(keyPattern, 'g')
      const keyMatch = regex.exec(jsonText)

      if (keyMatch) {
        // Find where the value starts within the match
        const valueStart = keyMatch.index + keyMatch[0].indexOf(escapedValue)
        const valueEnd = valueStart + escapedValue.length

        matches.push({
          type: 'json_key',
          key,
          value: valueStr,
          path: currentPath,
          start: baseOffset + valueStart,
          end: baseOffset + valueEnd,
          confidence
        })
      }
    }

    // Recurse into nested objects
    if (typeof value === 'object' && value !== null) {
      walkObject(value, currentPath, jsonText, baseOffset, matches)
    }
  }
}

/**
 * Detect secrets in JSON by looking at suspicious key names.
 */
export function detectJsonSecrets(text: string): ContextMatch[] {
  const matches: ContextMatch[] = []
  const fragments = extractJsonFragments(text)

  for (const fragment of fragments) {
    try {
      const parsed = JSON.parse(fragment.text)
      walkObject(parsed, '', fragment.text, fragment.start, matches)
    } catch {
      // Skip invalid JSON
    }
  }

  // Deduplicate matches by position
  const seen = new Set<string>()
  return matches.filter(m => {
    const key = `${m.start}-${m.end}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Quick check if text likely contains JSON worth analyzing.
 */
export function isLikelyJson(text: string): boolean {
  // Quick heuristics before doing full parsing
  if (!text.includes('{')) return false
  if (!text.includes(':')) return false

  // Check if there's at least one valid-looking JSON object pattern
  return /\{[^{}]*"[^"]+"\s*:\s*/.test(text)
}
