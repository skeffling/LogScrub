#!/bin/bash
set -e

echo "=== LogScrub Production Build ==="
echo ""

cd "$(dirname "$0")/.."
ROOT_DIR=$(pwd)

echo "[1/4] Building WASM module (optimized)..."
cd packages/wasm-core
wasm-pack build --target web --out-dir pkg --release
cd ../..

echo "[2/4] Installing dependencies..."
npm install

echo "[3/4] Building web app..."
npm run --workspace=web build

echo "[4/4] Preparing dist folder..."
rm -rf dist
cp -r packages/web/dist ./dist

echo ""
echo "=== Build Complete ==="
echo ""
echo "Production files are in: $ROOT_DIR/dist/"

if [ -f ".env" ] && grep -q "FTP_HOST" .env; then
  echo ""
  read -p "Upload to FTP? [y/N] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "[5/5] Uploading to FTP..."
    node scripts/deploy.mjs
    echo ""
    echo "=== Deployment Complete ==="
  fi
else
  echo ""
  echo "To deploy via FTP:"
  echo "  1. Create .env with FTP_HOST, FTP_USER, FTP_PASSWORD"
  echo "  2. Run: npm run deploy"
fi

echo ""
echo "Note: Ensure your server sets these headers (for SharedArrayBuffer):"
echo "  Cross-Origin-Opener-Policy: same-origin"
echo "  Cross-Origin-Embedder-Policy: require-corp"
echo ""
echo "To preview locally:"
echo "  npm run preview"
