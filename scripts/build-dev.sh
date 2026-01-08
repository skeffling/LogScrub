#!/bin/bash
set -e

echo "=== LogScrub Development Build ==="
echo ""

cd "$(dirname "$0")/.."

echo "[1/3] Building WASM module..."
cd packages/wasm-core
wasm-pack build --target web --out-dir pkg --dev
cd ../..

echo "[2/3] Installing dependencies..."
npm install

echo "[3/3] Starting dev server..."
npm run --workspace=web dev
