import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const version = (() => {
  try {
    return readFileSync(resolve(__dirname, '../../VERSION'), 'utf-8').trim()
  } catch {
    return 'dev'
  }
})()

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait()
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  base: './',
  server: {
    port: 3000
  },
  preview: {
    port: 3000
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()]
  },
  optimizeDeps: {
    exclude: ['wasm-core']
  },
  build: {
    target: 'esnext'
  }
})
