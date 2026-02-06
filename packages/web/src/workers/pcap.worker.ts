import init, { pre_analyze_pcap, analyze_pcap, anonymize_pcap_bytes, get_packet_comparison, search_packets } from 'wasm-core'

let wasmInitialized = false

async function initWasm() {
  if (!wasmInitialized) {
    await init()
    wasmInitialized = true
  }
}

self.onmessage = async (e: MessageEvent) => {
  try {
    await initWasm()

    switch (e.data.type) {
      case 'pre_analyze': {
        const result = pre_analyze_pcap(e.data.payload.data)
        self.postMessage({ type: 'result', payload: result })
        break
      }

      case 'analyze': {
        const result = analyze_pcap(e.data.payload.data, e.data.payload.config)
        self.postMessage({ type: 'result', payload: result })
        break
      }

      case 'anonymize': {
        const result = anonymize_pcap_bytes(e.data.payload.data, e.data.payload.config)
        // Transfer the buffer to avoid copying
        self.postMessage({ type: 'result', payload: result }, { transfer: [result.buffer] })
        break
      }

      case 'compare': {
        const result = get_packet_comparison(e.data.payload.data, e.data.payload.config, e.data.payload.max_packets)
        self.postMessage({ type: 'result', payload: result })
        break
      }

      case 'search': {
        const result = search_packets(e.data.payload.data, e.data.payload.term, e.data.payload.max_results)
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
