/**
 * Context-aware detection for JSON-structured logs.
 * Parses JSON and flags values associated with suspicious keys.
 */

export interface ContextMatch {
  type: 'json_key' | 'csv_name'
  key: string           // The suspicious key name or column header
  value: string         // The value to potentially redact
  path: string          // JSON path or column name
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

// ============================================================================
// CSV/Spreadsheet Name Column Detection
// ============================================================================

// Column headers that indicate name fields (case-insensitive)
const NAME_COLUMN_HEADERS = new Set([
  // First name variations
  'fname', 'firstname', 'first_name', 'first', 'givenname', 'given_name',
  'forename', 'prenom',
  // Last name variations
  'lname', 'lastname', 'last_name', 'last', 'surname', 'familyname', 'family_name',
  // Full name
  'name', 'fullname', 'full_name', 'displayname', 'display_name',
  // Other name fields
  'maiden_name', 'maidenname', 'maiden', 'middlename', 'middle_name', 'middle',
  'nickname', 'alias', 'username', 'user_name', 'user',
  // Contact names
  'contact_name', 'contactname', 'customer_name', 'customername',
  'employee_name', 'employeename', 'client_name', 'clientname',
  'sender_name', 'sendername', 'recipient_name', 'recipientname',
  'author', 'owner', 'creator', 'manager', 'supervisor',
  // Address-related (can contain names)
  'addressee', 'attention', 'attn', 'care_of', 'careof'
])

/**
 * Check if a column header indicates a name field
 */
function isNameColumnHeader(header: string): boolean {
  const normalized = header.toLowerCase().trim().replace(/["\s]/g, '')
  return NAME_COLUMN_HEADERS.has(normalized)
}

/**
 * Check if a value looks like a plausible name (not a placeholder or garbage)
 */
function isPlausibleName(value: string): boolean {
  if (!value || value.length < 2) return false
  if (value.length > 100) return false

  // Skip obvious non-names
  const lower = value.toLowerCase()
  const skipPatterns = [
    'null', 'none', 'n/a', 'na', 'undefined', 'unknown', 'test', 'example',
    'xxx', '---', '...', 'tbd', 'pending'
  ]
  if (skipPatterns.includes(lower)) return false

  // Skip values that are just numbers
  if (/^\d+$/.test(value)) return false

  // Skip values that look like emails, URLs, or IDs
  if (/@/.test(value)) return false
  if (/^https?:\/\//.test(value)) return false
  if (/^[a-f0-9-]{32,}$/i.test(value)) return false  // UUIDs, hashes

  // Skip values that are just repeated characters
  if (/^(.)\1+$/.test(value)) return false

  // Names typically have letters
  if (!/[a-zA-Z]/.test(value)) return false

  return true
}

/**
 * Detect delimiter used in CSV-like text
 */
function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] || ''

  // Check for XLSX sheet header format (=== SheetName ===)
  if (/^===\s+.+\s+===$/.test(firstLine.trim())) {
    // This is XLSX format, use tab delimiter
    return '\t'
  }

  // Count occurrences of common delimiters in first line
  const delimiters = [',', '\t', ';', '|']
  let maxCount = 0
  let bestDelimiter = ','

  for (const delim of delimiters) {
    const count = (firstLine.match(new RegExp(delim === '|' ? '\\|' : delim, 'g')) || []).length
    if (count > maxCount) {
      maxCount = count
      bestDelimiter = delim
    }
  }

  return bestDelimiter
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true
      } else if (char === delimiter) {
        // Field separator
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }

  // Don't forget the last field
  result.push(current.trim())

  return result
}

/**
 * Detect names in CSV/spreadsheet column data
 */
export function detectCsvNameColumns(text: string): ContextMatch[] {
  const matches: ContextMatch[] = []
  const lines = text.split('\n')

  // Handle XLSX format with sheet headers
  let startLineIndex = 0
  if (lines[0] && /^===\s+.+\s+===$/.test(lines[0].trim())) {
    startLineIndex = 1  // Skip sheet header line
  }

  if (lines.length < 2) return matches  // Need at least header + 1 data row

  const delimiter = detectDelimiter(text)
  const headerLine = lines[startLineIndex]
  if (!headerLine) return matches

  const headers = parseCsvLine(headerLine, delimiter)

  // Find which column indices contain name fields
  const nameColumnIndices: Map<number, string> = new Map()
  headers.forEach((header, index) => {
    if (isNameColumnHeader(header)) {
      nameColumnIndices.set(index, header)
    }
  })

  if (nameColumnIndices.size === 0) return matches

  // Track positions as we scan through the text
  let currentPosition = 0
  for (let i = 0; i < startLineIndex; i++) {
    currentPosition += lines[i].length + 1  // +1 for newline
  }
  currentPosition += headerLine.length + 1  // Skip header line

  // Process data rows
  const seenValues = new Set<string>()

  for (let lineIndex = startLineIndex + 1; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    if (!line.trim()) {
      currentPosition += line.length + 1
      continue
    }

    // Skip additional sheet headers in XLSX
    if (/^===\s+.+\s+===$/.test(line.trim())) {
      // New sheet - re-parse headers
      currentPosition += line.length + 1
      const nextLine = lines[lineIndex + 1]
      if (nextLine) {
        const newHeaders = parseCsvLine(nextLine, delimiter)
        nameColumnIndices.clear()
        newHeaders.forEach((header, index) => {
          if (isNameColumnHeader(header)) {
            nameColumnIndices.set(index, header)
          }
        })
        lineIndex++  // Skip the header line
        currentPosition += nextLine.length + 1
      }
      continue
    }

    const fields = parseCsvLine(line, delimiter)

    // Find positions of each field in the line
    let fieldStart = 0
    for (let colIndex = 0; colIndex < fields.length; colIndex++) {
      const field = fields[colIndex]

      if (nameColumnIndices.has(colIndex) && isPlausibleName(field)) {
        // Find the actual position of this field in the line
        const columnHeader = nameColumnIndices.get(colIndex)!

        // Search for the field value in the line starting from fieldStart
        let valueStart = line.indexOf(field, fieldStart)
        if (valueStart === -1) {
          // Try with quotes
          valueStart = line.indexOf(`"${field}"`, fieldStart)
          if (valueStart !== -1) valueStart += 1  // Skip opening quote
        }

        if (valueStart !== -1) {
          const absoluteStart = currentPosition + valueStart
          const absoluteEnd = absoluteStart + field.length

          // Avoid duplicates
          const key = `${field.toLowerCase()}-${absoluteStart}`
          if (!seenValues.has(key)) {
            seenValues.add(key)
            matches.push({
              type: 'csv_name',
              key: columnHeader,
              value: field,
              path: columnHeader,
              start: absoluteStart,
              end: absoluteEnd,
              confidence: 'high'
            })
          }
        }
      }

      // Move fieldStart past this field
      const fieldInLine = line.indexOf(field, fieldStart)
      if (fieldInLine !== -1) {
        fieldStart = fieldInLine + field.length + 1
      }
    }

    currentPosition += line.length + 1
  }

  return matches
}

/**
 * Quick check if text looks like CSV/tabular data
 */
export function isLikelyCsv(text: string): boolean {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return false

  // Check for XLSX sheet header
  let headerLineIndex = 0
  if (/^===\s+.+\s+===$/.test(lines[0].trim())) {
    headerLineIndex = 1
  }

  const headerLine = lines[headerLineIndex]
  if (!headerLine) return false

  const delimiter = detectDelimiter(text)
  const headerFields = parseCsvLine(headerLine, delimiter)

  // Must have multiple columns
  if (headerFields.length < 2) return false

  // Check if any header looks like a name column
  const hasNameColumn = headerFields.some(h => isNameColumnHeader(h))
  if (!hasNameColumn) return false

  // Check if at least one data row has similar structure
  const dataLine = lines[headerLineIndex + 1]
  if (!dataLine) return false
  const dataFields = parseCsvLine(dataLine, delimiter)

  // Data row should have similar number of fields (within 2)
  return Math.abs(dataFields.length - headerFields.length) <= 2
}
