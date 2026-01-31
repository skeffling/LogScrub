import init from '../wasm-core/wasm_core'

let wasmReady: Promise<unknown> | null = null

export async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = init()
  }
  await wasmReady
}
