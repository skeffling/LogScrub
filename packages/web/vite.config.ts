import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const version = (() => {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))
    return pkg.version || 'dev'
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
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html')
      },
      onwarn(warning, defaultHandler) {
        // Suppress Node module externalization warnings from dual-environment libs (scribe.js, mupdf)
        if (warning.message?.includes('has been externalized for browser compatibility')) return
        defaultHandler(warning)
      }
    }
  }
})
