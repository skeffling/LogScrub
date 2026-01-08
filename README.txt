LogScrub - Browser-Based PII Redaction Tool
===========================================

100% client-side log sanitizer. Your data never leaves your browser.


PREREQUISITES
-------------
- Node.js 18+
- Rust 1.70+ (with wasm32-unknown-unknown target)
- wasm-pack: cargo install wasm-pack
- pnpm: npm install -g pnpm


QUICK START (Development)
-------------------------
./scripts/build-dev.sh

Or manually:
  1. pnpm install
  2. cd packages/wasm-core && wasm-pack build --target web --out-dir pkg
  3. cd packages/web && pnpm dev
  4. Open http://localhost:3000


BUILD FOR PRODUCTION
--------------------
./scripts/build-prod.sh

Output will be in dist/


DEPLOY
------
Upload contents of dist/ to any static hosting:
- Vercel
- Cloudflare Pages
- GitHub Pages
- Netlify
- Any web server (nginx, Apache, etc.)

Optional headers for SharedArrayBuffer (multi-threaded WASM):
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp


PROJECT STRUCTURE
-----------------
cleaner/
├── scripts/
│   ├── build-dev.sh      # Development build + server
│   └── build-prod.sh     # Production build
├── packages/
│   ├── web/              # React frontend
│   └── wasm-core/        # Rust WASM detection engine
├── dist/                 # Production output (after build)
└── project.md            # Full project documentation


SUPPORTED PII TYPES (32 patterns)
---------------------------------

Contact:
  - Email addresses
  - Phone numbers (US + International)

Network:
  - IPv4 addresses
  - IPv6 addresses
  - MAC addresses

Identity:
  - Social Security Numbers (SSN)
  - Passport numbers
  - Driver's license numbers

Financial:
  - Credit cards (with Luhn validation)
  - IBANs (with Mod-97 validation)
  - Bitcoin addresses
  - Ethereum addresses

Tokens & API Keys:
  - JWT tokens
  - Bearer tokens
  - AWS access keys & secret keys
  - Stripe API keys
  - GCP API keys
  - GitHub tokens
  - Slack tokens

Secrets:
  - Generic secrets (password=, api_key=, etc.)
  - Private keys (PEM format)
  - Basic auth headers
  - URL credentials (user:pass@host)
  - Session IDs

Location:
  - GPS coordinates
  - UK postcodes
  - US zip codes

Other:
  - UUIDs
  - Unix file paths (/home/user/...)
  - Windows file paths (C:\Users\...)


REPLACEMENT STRATEGIES
----------------------
Per PII type, choose:
  - Label:  [EMAIL-1], [IPv4-2], etc.
  - Fake:   user@example.com, 192.0.2.1, etc.
  - Redact: ████████████████

Consistency Mode: Same input value always gets same replacement.


TECH STACK
----------
- Frontend: React 18, TypeScript, Tailwind CSS, Vite
- WASM Core: Rust with regex crate (ReDoS-safe)
- Processing: Web Worker (non-blocking UI)
