export function loadPreference<T>(prefix: string, key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(`${prefix}${key}`)
    if (stored !== null) return JSON.parse(stored) as T
  } catch {}
  return defaultValue
}

export function savePreference<T>(prefix: string, key: string, value: T): void {
  try {
    localStorage.setItem(`${prefix}${key}`, JSON.stringify(value))
  } catch {}
}

// Convenience functions with default prefixes
export function loadUiPreference<T>(key: string, defaultValue: T): T {
  return loadPreference('logscrub_', key, defaultValue)
}

export function saveUiPreference<T>(key: string, value: T): void {
  savePreference('logscrub_', key, value)
}

export function loadEditorPreference<T>(key: string, defaultValue: T): T {
  return loadPreference('logscrub_editor_', key, defaultValue)
}

export function saveEditorPreference<T>(key: string, value: T): void {
  savePreference('logscrub_editor_', key, value)
}
