#!/bin/bash
#
# Download NER model files for self-hosting
# Usage: ./download-ner-model.sh [model-name]
#
# Example:
#   ./download-ner-model.sh Xenova/bert-base-NER
#   ./download-ner-model.sh Xenova/distilbert-base-NER
#

MODEL=${1:-"Xenova/distilbert-base-NER"}
OUTPUT_DIR="packages/web/public/models/$MODEL"

echo "Downloading $MODEL to $OUTPUT_DIR..."

mkdir -p "$OUTPUT_DIR/onnx"

# Base URL for Hugging Face
HF_URL="https://huggingface.co/$MODEL/resolve/main"

# Download required files
echo "Downloading config.json..."
curl -L "$HF_URL/config.json" -o "$OUTPUT_DIR/config.json"

echo "Downloading tokenizer.json..."
curl -L "$HF_URL/tokenizer.json" -o "$OUTPUT_DIR/tokenizer.json"

echo "Downloading tokenizer_config.json..."
curl -L "$HF_URL/tokenizer_config.json" -o "$OUTPUT_DIR/tokenizer_config.json"

# Try quantized model first (smaller), fall back to full model
echo "Downloading ONNX model (trying quantized first)..."
if curl -fL "$HF_URL/onnx/model_quantized.onnx" -o "$OUTPUT_DIR/onnx/model_quantized.onnx" 2>/dev/null; then
    echo "Downloaded quantized model (~100MB)"
else
    echo "Quantized model not found, downloading full model..."
    curl -L "$HF_URL/onnx/model.onnx" -o "$OUTPUT_DIR/onnx/model.onnx"
    echo "Downloaded full model (~400MB)"
fi

echo ""
echo "Done! Model downloaded to: $OUTPUT_DIR"
echo ""
echo "To use self-hosted model, add to your code:"
echo "  import { setModelHost } from './utils/nerDetection'"
echo "  setModelHost('/models')"
echo ""
echo "Files downloaded:"
ls -lh "$OUTPUT_DIR"
ls -lh "$OUTPUT_DIR/onnx"
