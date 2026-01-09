import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { useAppStore, type ThemeMode } from './stores/useAppStore'

// Apply theme on initial load
function applyTheme(mode: ThemeMode) {
  const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

// Get initial theme and apply it
const initialTheme = useAppStore.getState().themeMode
applyTheme(initialTheme)

// Listen for system theme changes when in auto mode
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const currentMode = useAppStore.getState().themeMode
  if (currentMode === 'auto') {
    applyTheme('auto')
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
