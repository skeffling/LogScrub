# LogScrub - Browser-Based PII Redaction Tool

> 100% client-side log sanitizer. Your data never leaves your browser.

## Overview

A browser-based tool for detecting and redacting Personally Identifiable Information (PII) from logs, text files, and other documents. Built with a TypeScript frontend and Rust WASM core for maximum performance.

**Key Differentiators:**
- 100% client-side processing (privacy-first)
- Hybrid detection: regex + in-browser ML for names
- User-configurable replacement strategies per PII type
- Optional consistency mode (same input → same output)
- Handles files up to 100MB with chunked processing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Main Thread)                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   UI Layer  │  │ File Reader │  │   Results Renderer      │  │
│  │  (React/TS) │  │  (Streams)  │  │   (Diff View)           │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────▲─────────────┘  │
│         │                │                     │                 │
│         ▼                ▼                     │                 │
│  ┌─────────────────────────────────────────────┴─────────────┐  │
│  │                    Orchestrator (TS)                       │  │
│  │  - Chunk management                                        │  │
│  │  - Consistency map                                         │  │
│  │  - Stats aggregation                                       │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │                                    │
└─────────────────────────────┼────────────────────────────────────┘
                              │ postMessage
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Web Worker                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   WASM Core (Rust)                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │ Regex Engine│  │  Checksums  │  │  Replacer       │  │    │
│  │  │ (RE2-safe)  │  │  (Luhn,etc) │  │  (fake/label)   │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              NER Model (Transformers.js)                 │    │
│  │              - Name detection                            │    │
│  │              - Organization detection                    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Web Worker Isolation**: All processing happens off main thread
2. **Chunked Processing**: Files split into ~1MB chunks for memory efficiency
3. **Rust WASM for Regex**: ReDoS-safe, 10-100x faster than JS regex
4. **Transformers.js for NER**: Lightweight ONNX models for name detection
5. **Streaming Architecture**: Never load entire file into memory

---

## Tech Stack

### Frontend
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | **React 18** + TypeScript | Component model, ecosystem |
| Styling | **Tailwind CSS** | Rapid UI development |
| Build | **Vite** | Fast dev, native WASM support |
| State | **Zustand** | Simple, no boilerplate |

### WASM Core (Rust)
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Regex | **regex** crate | Linear time, ReDoS-safe |
| Bindings | **wasm-bindgen** | High-level JS interop |
| Serialization | **serde-wasm-bindgen** | Zero-copy where possible |
| Build | **wasm-pack** | Standard toolchain |

### ML (Names/NER)
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | **Transformers.js** | ONNX in browser |
| Model | **Xenova/bert-base-NER** or similar | Small, fast, accurate |

---

## Features

### MVP (v1.0)

#### Input Methods
- [ ] Paste text directly
- [ ] File upload (drag & drop)
- [ ] Multiple file batch processing

#### PII Detection (Regex-based)
| Category | Types |
|----------|-------|
| **Network** | IPv4, IPv6, MAC addresses |
| **Contact** | Email, phone numbers (international) |
| **Identity** | SSN, passport patterns, driver license patterns |
| **Financial** | Credit cards (with Luhn), IBANs (with Mod-97), bank accounts |
| **Technical** | UUIDs, JWTs, Bearer tokens, API keys (AWS, Stripe, etc.) |
| **Secrets** | Passwords (key-value), generic secrets, OAuth tokens |
| **Location** | GPS coordinates, postcodes |
| **Digital** | Crypto wallets (BTC, ETH), file paths, usernames |

#### PII Detection (ML-based)
| Category | Types |
|----------|-------|
| **Names** | Full names, initials + surname |
| **Organizations** | Company names (optional) |

#### Replacement Strategies (User-configurable per type)
| Strategy | Example |
|----------|---------|
| **Label** | `[EMAIL]`, `[IPv4]`, `[PERSON]` |
| **Realistic Fake** | `jane.doe@example.com`, `192.0.2.1` |
| **Redacted** | `████████` |
| **Hash (truncated)** | `a]` |

#### Consistency Mode
- Toggle: "Same value → same replacement"
- When enabled: `john@acme.com` appearing 50x → always same fake

#### UI Features
- [ ] Side-by-side view (original vs sanitized)
- [ ] Per-type toggle (enable/disable each PII type)
- [ ] Live detection stats ("Found: 12 emails, 5 IPs, 2 names")
- [ ] Syntax highlighting for detected PII
- [ ] Download sanitized output
- [ ] Copy to clipboard

### Future (v2.0+)
- [ ] Log format awareness (JSON, Apache, syslog)
- [ ] Custom regex rules
- [ ] Preset profiles (GDPR, HIPAA, PCI-DSS)
- [ ] CLI version (Node.js)
- [ ] NPM package for embedding
- [ ] Browser extension

---

## PII Detection Details

### Regex Patterns (Rust WASM)

Based on [Microsoft Presidio](https://github.com/microsoft/presidio) and [gitleaks](https://github.com/gitleaks/gitleaks):

```rust
// Example pattern structure (not exhaustive)
pub struct PiiPattern {
    pub id: &'static str,
    pub category: &'static str,
    pub pattern: &'static str,
    pub validator: Option<fn(&str) -> bool>,  // Checksum validation
    pub context_keywords: &'static [&'static str],  // False positive reduction
}

// Examples:
PiiPattern {
    id: "credit_card",
    category: "financial",
    pattern: r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|...)\b",
    validator: Some(luhn_check),
    context_keywords: &["card", "credit", "payment", "visa", "mastercard"],
}

PiiPattern {
    id: "jwt",
    category: "secrets",
    pattern: r"eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*",
    validator: None,
    context_keywords: &[],  // JWT format is unique enough
}
```

### Checksum Validators

| Type | Algorithm |
|------|-----------|
| Credit Cards | Luhn algorithm |
| IBANs | Mod-97 |
| Bitcoin addresses | Base58Check / Bech32 |
| Ethereum addresses | EIP-55 checksum (optional) |

### Context-Aware Scoring

Reduce false positives by checking for keywords within N characters:

```
Input: "Card number: 4532015112830366"
        ^^^^         ^^^^^^^^^^^^^^^^
        Context      Match
        
→ High confidence (keyword "Card" nearby)

Input: "Order ID: 4532015112830366"  
→ Lower confidence (no financial context)
→ Still flag but with warning
```

### Name Detection (Transformers.js)

```typescript
// Pseudo-code for NER integration
import { pipeline } from '@xenova/transformers';

const ner = await pipeline('token-classification', 'Xenova/bert-base-NER');
const results = await ner(text);

// Filter for PERSON entities
const names = results
  .filter(r => r.entity.includes('PER'))
  .map(r => ({ text: r.word, start: r.start, end: r.end }));
```

Model options (size vs accuracy tradeoff):
| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| `Xenova/bert-base-NER` | ~400MB | Medium | High |
| `Xenova/distilbert-NER` | ~250MB | Fast | Good |
| Custom fine-tuned | ~50MB | Very Fast | Targeted |

---

## UI/UX Design

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  🛡️ LogScrub          [Settings] [About]                          │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  📁 Drop files here or click to upload                      │  │
│  │     Supports .log, .txt, .json (max 100MB)                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│  Detection Rules                    │ Stats                        │
│  ─────────────────                  │ ─────                        │
│  ☑️ Emails           [Label ▼]      │ 📧 Emails: 47                │
│  ☑️ IP Addresses     [Fake ▼]       │ 🌐 IPs: 23                   │
│  ☑️ Credit Cards     [Redact ▼]     │ 💳 Cards: 2                  │
│  ☑️ Names (ML)       [Label ▼]      │ 👤 Names: 15                 │
│  ☑️ API Keys         [Label ▼]      │ 🔑 Secrets: 8                │
│  ☐ File Paths        [Label ▼]      │                              │
│  ...                                │ Total: 95 items              │
│                                     │                              │
│  ☑️ Consistency Mode                │                              │
├────────────────────────────────────────────────────────────────────┤
│         Original                    │         Sanitized            │
│  ┌────────────────────────────────┐ │ ┌────────────────────────────│
│  │ 2024-01-15 Error: User         │ │ │ 2024-01-15 Error: User     │
│  │ john.doe@acme.com failed       │ │ │ [EMAIL] failed             │
│  │ login from 192.168.1.105       │ │ │ login from [IPv4]          │
│  │ Card: 4532015112830366         │ │ │ Card: ████████████████     │
│  │ ...                            │ │ │ ...                        │
│  └────────────────────────────────┘ │ └────────────────────────────│
├────────────────────────────────────────────────────────────────────┤
│  [📋 Copy to Clipboard]  [💾 Download]  [🔄 Reset]                 │
└────────────────────────────────────────────────────────────────────┘
```

### Color Coding (in original pane)
| PII Type | Highlight Color |
|----------|-----------------|
| Emails | Blue |
| IPs | Green |
| Financial | Red |
| Names | Purple |
| Secrets | Orange |

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Project setup (Vite + React + TypeScript)
- [ ] Rust WASM scaffold with wasm-pack
- [ ] Basic regex engine with 5 core patterns (email, IPv4, SSN, credit card, JWT)
- [ ] Web Worker communication layer
- [ ] Simple paste-to-sanitize UI

### Phase 2: Core Detection (Week 3-4)
- [ ] Full regex pattern library (all types listed above)
- [ ] Checksum validators (Luhn, Mod-97)
- [ ] Context-aware scoring
- [ ] Per-type replacement strategies
- [ ] Consistency mode implementation

### Phase 3: ML Integration (Week 5-6)
- [ ] Transformers.js setup in Worker
- [ ] NER model loading (with progress indicator)
- [ ] Name detection pipeline
- [ ] Merge regex + NER results

### Phase 4: File Handling (Week 7)
- [ ] File upload with drag & drop
- [ ] Chunked processing for large files
- [ ] Progress indicator
- [ ] Batch file support

### Phase 5: UI Polish (Week 8)
- [ ] Side-by-side diff view
- [ ] Syntax highlighting
- [ ] Per-type toggles
- [ ] Live stats
- [ ] Settings panel
- [ ] Download/copy functionality

### Phase 6: Testing & Launch (Week 9-10)
- [ ] Unit tests (Rust + TS)
- [ ] Integration tests
- [ ] Performance benchmarks
- [ ] Documentation
- [ ] Deploy to static hosting

---

## Project Structure

```
logscrub/
├── packages/
│   ├── web/                    # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── FileUpload.tsx
│   │   │   │   ├── Editor.tsx
│   │   │   │   ├── DiffView.tsx
│   │   │   │   ├── RuleToggle.tsx
│   │   │   │   └── Stats.tsx
│   │   │   ├── workers/
│   │   │   │   └── sanitizer.worker.ts
│   │   │   ├── stores/
│   │   │   │   └── useAppStore.ts
│   │   │   ├── lib/
│   │   │   │   ├── orchestrator.ts
│   │   │   │   └── consistency.ts
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   └── package.json
│   │
│   └── wasm-core/              # Rust WASM module
│       ├── src/
│       │   ├── lib.rs
│       │   ├── patterns/
│       │   │   ├── mod.rs
│       │   │   ├── network.rs      # IPv4, IPv6, MAC
│       │   │   ├── contact.rs      # Email, phone
│       │   │   ├── identity.rs     # SSN, passport
│       │   │   ├── financial.rs    # Credit card, IBAN
│       │   │   ├── secrets.rs      # JWT, API keys
│       │   │   └── location.rs     # GPS, postcode
│       │   ├── validators/
│       │   │   ├── mod.rs
│       │   │   ├── luhn.rs
│       │   │   └── mod97.rs
│       │   ├── replacer.rs
│       │   └── types.rs
│       ├── Cargo.toml
│       └── README.md
│
├── docs/
│   └── patterns.md             # Pattern documentation
├── .github/
│   └── workflows/
│       └── deploy.yml
├── package.json                # Workspace root
├── pnpm-workspace.yaml
└── README.md
```

---

## Development Setup

### Prerequisites
- Node.js 18+
- Rust 1.70+
- wasm-pack (`cargo install wasm-pack`)
- pnpm (`npm install -g pnpm`)

### Commands

```bash
# Install dependencies
pnpm install

# Build WASM module
cd packages/wasm-core && wasm-pack build --target web

# Start dev server
cd packages/web && pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

---

## Testing Strategy

### Unit Tests

**Rust (WASM Core)**
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_email_detection() {
        let result = detect_pii("Contact: john@example.com");
        assert_eq!(result[0].pii_type, "email");
        assert_eq!(result[0].value, "john@example.com");
    }
    
    #[test]
    fn test_credit_card_luhn() {
        assert!(luhn_check("4532015112830366"));  // Valid
        assert!(!luhn_check("4532015112830367")); // Invalid
    }
}
```

**TypeScript**
```typescript
describe('Orchestrator', () => {
  it('maintains consistency across chunks', () => {
    const orchestrator = new Orchestrator({ consistency: true });
    const result1 = orchestrator.process('john@acme.com');
    const result2 = orchestrator.process('Contact john@acme.com again');
    expect(result1.replacements['john@acme.com'])
      .toBe(result2.replacements['john@acme.com']);
  });
});
```

### Integration Tests
- Full pipeline: file → chunks → worker → WASM → results
- NER model loading and inference
- Large file handling (50MB+)

### Performance Benchmarks
| Scenario | Target |
|----------|--------|
| 1KB text | < 10ms |
| 1MB file | < 500ms |
| 100MB file | < 30s |
| NER model load | < 5s (first time) |

---

## Deployment

### Static Hosting Options
- **Vercel** (recommended) - free, automatic deploys
- **Cloudflare Pages** - edge caching for WASM
- **GitHub Pages** - simple, free

### Build Output
```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── wasm-core-[hash].wasm
└── models/           # NER model files (lazy loaded)
    └── onnx/
```

### Headers Required
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
(Required for SharedArrayBuffer if using multi-threaded WASM)

---

## Security Considerations

1. **No server communication**: All processing in browser
2. **No analytics on content**: Only aggregate stats (file size, PII counts)
3. **No persistence**: Nothing saved to localStorage/IndexedDB by default
4. **CSP headers**: Strict Content Security Policy
5. **Subresource Integrity**: Hash verification for all scripts

---

## Open Questions

1. **Model hosting**: Bundle NER model in app vs CDN fetch?
   - Bundled: Larger initial download (~50-400MB)
   - CDN: Faster initial load, requires fetch

2. **Phone number handling**: Use libphonenumber-js or simplified regex?
   - Full library: Accurate, ~200KB
   - Regex: Faster, less accurate for international

3. **Custom patterns UI**: Allow users to add custom regex in v1 or defer?

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to first sanitization | < 3s |
| Processing speed | > 2MB/s |
| False positive rate | < 5% |
| False negative rate | < 2% (for regex types) |
| Lighthouse score | > 90 |

---

## References

- [Microsoft Presidio](https://github.com/microsoft/presidio) - Pattern reference
- [gitleaks](https://github.com/gitleaks/gitleaks) - Secret patterns
- [Transformers.js](https://huggingface.co/docs/transformers.js) - NER in browser
- [wasm-bindgen](https://rustwasm.github.io/docs/wasm-bindgen/) - Rust/JS interop
- [@arcjet/redact-wasm](https://www.npmjs.com/package/@arcjet/redact-wasm) - Existing WASM redaction
