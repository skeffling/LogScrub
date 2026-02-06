import init, { pre_analyze_pcap, analyze_pcap, anonymize_pcap_bytes, get_packet_comparison, search_packets } from 'wasm-core'

let wasmInitialized = false

async function initWasm() {
  if (!wasmInitialized) {
    await init()
    wasmInitialized = true
  }
}

// Keep file data in worker memory so it doesn't need to be re-sent each time
let storedData: Uint8Array | null = null

self.onmessage = async (e: MessageEvent) => {
  try {
    await initWasm()

    switch (e.data.type) {
      case 'load': {
        // Store file data in worker - only sent once from main thread
        storedData = e.data.payload.data
        self.postMessage({ type: 'result', payload: true })
        break
      }

      case 'pre_analyze': {
        if (!storedData) throw new Error('No file loaded')
        const result = JSON.parse(pre_analyze_pcap(storedData))
        self.postMessage({ type: 'result', payload: result })
        break
      }

      case 'analyze': {
        if (!storedData) throw new Error('No file loaded')
        const result = JSON.parse(analyze_pcap(storedData, e.data.payload.config))
        self.postMessage({ type: 'result', payload: result })
        break
      }

      case 'anonymize': {
        if (!storedData) throw new Error('No file loaded')
        const result = anonymize_pcap_bytes(storedData, e.data.payload.config)
        self.postMessage({ type: 'result', payload: result }, { transfer: [result.buffer] })
        break
      }

      case 'compare': {
        if (!storedData) throw new Error('No file loaded')
        const result = JSON.parse(get_packet_comparison(storedData, e.data.payload.config, e.data.payload.max_packets))
        self.postMessage({ type: 'result', payload: result })
        break
      }

      case 'search': {
        if (!storedData) throw new Error('No file loaded')
        const result = JSON.parse(search_packets(storedData, e.data.payload.term, e.data.payload.max_results))
        self.postMessage({ type: 'result', payload: result })
        break
      }

      default:
        self.postMessage({ type: 'error', payload: `Unknown message type: ${e.data.type}` })
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      payload: error instanceof Error ? error.message : String(error)
    })
  }
}
