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
echo ""
echo "To deploy:"
echo "  1. Upload contents of dist/ to your web server"
echo "  2. Ensure your server sets these headers (for SharedArrayBuffer):"
echo "     Cross-Origin-Opener-Policy: same-origin"
echo "     Cross-Origin-Embedder-Policy: require-corp"
echo ""
echo "To preview locally:"
echo "  npm run preview"
