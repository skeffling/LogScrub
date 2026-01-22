# LogScrub

Browser-based PII redaction tool. 100% client-side - your data never leaves your browser.

**Live demo:** [skeffling.net/logscrub](https://skeffling.net/logscrub)

## Features

- **50+ detection patterns** - emails, IPs, credit cards, API keys, JWTs, SSNs, and more
- **Context-aware detection** - finds secrets in JSON by analyzing key names
- **Multiple replacement strategies** - labels (`[EMAIL-1]`), fake data, or redaction (`████`)
- **Consistency mode** - same input always produces same output
- **Time shift** - anonymize timestamps while preserving relative timing
- **Document support** - PDF, DOCX, XLSX, ODT, ODS
- **Large file support** - virtual scrolling handles multi-MB logs smoothly
- **Works offline** - no server required after initial load

## Prerequisites

- Node.js 18+
- Rust 1.70+ with wasm32-unknown-unknown target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- wasm-pack:
  ```bash
  cargo install wasm-pack
  ```

## Quick Start

### Development
```bash
npm install
npm run build:wasm
npm run dev
```

Open http://localhost:5173

### Production Build

```bash
./scripts/build-prod.sh
```

Output will be in `dist/`. Deploy to any static host (Vercel, Cloudflare Pages, Netlify, GitHub Pages, etc.)

## Project Structure

```
logscrub/
├── packages/
│   ├── web/          # React frontend (TypeScript, Tailwind, Vite)
│   └── wasm-core/    # Rust WASM detection engine
├── scripts/
│   ├── build-dev.sh  # Development build + server
│   └── build-prod.sh # Production build
└── dist/             # Production output (after build)
```

## Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite
- **Detection Engine:** Rust compiled to WebAssembly (ReDoS-safe regex)
- **Processing:** Web Worker for non-blocking UI

## Detection Patterns

| Category | Examples |
|----------|----------|
| Contact | Emails, phone numbers (US/UK/Intl) |
| Network | IPv4, IPv6, MAC addresses, hostnames, URLs |
| Identity | SSN, passport, driver's license, NHS numbers, NRIC |
| Financial | Credit cards (Luhn), IBAN (Mod-97), crypto addresses |
| Tokens | JWT, Bearer, AWS keys, Stripe, GitHub, OpenAI, Anthropic |
| Secrets | Passwords, private keys, Basic Auth, URL credentials |
| Location | GPS coordinates, postcodes, zip codes |

## License

MIT
