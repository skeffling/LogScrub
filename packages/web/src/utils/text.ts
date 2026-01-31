export function computeLineOffsets(lines: string[]): number[] {
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }
  return offsets
}

export interface ReplacementInfo {
  original: string
  type: string
  lines: number[]
}

export function buildReplacementTooltip(type: string, info?: ReplacementInfo): string {
  const lines = [`Type: ${type}`]
  if (info) {
    lines.unshift(`Original: ${info.original}`)
    if (info.lines.length > 0) {
      const lineStr = info.lines.length > 5
        ? `${info.lines.slice(0, 5).join(', ')}... (${info.lines.length} total)`
        : info.lines.join(', ')
      lines.push(`Lines: ${lineStr}`)
    }
  }
  return lines.join('\n')
}
