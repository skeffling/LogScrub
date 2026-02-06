#!/usr/bin/env python3
"""
Convert a Hugging Face model to ONNX format for use with Transformers.js

Usage:
    pip install optimum[onnxruntime] transformers torch onnx
    python convert-model-to-onnx.py <model_id> [output_dir]

Example:
    python convert-model-to-onnx.py OpenMed/OpenMed-PII-BioClinicalModern-Base-149M-v1
"""

import argparse
import sys
from pathlib import Path


def convert_model(model_id: str, output_dir: str):
    """Convert a model to ONNX format."""

    print(f"Converting model: {model_id}")
    print(f"Output directory: {output_dir}")
    print("-" * 50)

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Import here to get better error messages
    print("\n[1/4] Loading libraries...")
    try:
        from optimum.onnxruntime import ORTModelForTokenClassification
        from transformers import AutoTokenizer
        print("✓ Libraries loaded")
    except ImportError as e:
        print(f"✗ Missing dependency: {e}")
        print("\nInstall with:")
        print('  pip install "optimum[onnxruntime]" transformers torch onnx')
        sys.exit(1)

    # Load tokenizer
    print(f"\n[2/4] Loading tokenizer from {model_id}...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        tokenizer.save_pretrained(output_path)
        print("✓ Tokenizer saved")
    except Exception as e:
        print(f"✗ Failed to load tokenizer: {e}")
        sys.exit(1)

    # Export model to ONNX
    print(f"\n[3/4] Converting model to ONNX (this may take a few minutes)...")
    try:
        model = ORTModelForTokenClassification.from_pretrained(
            model_id,
            export=True  # This triggers ONNX conversion
        )
        model.save_pretrained(output_path)
        print("✓ Model converted and saved")
    except Exception as e:
        print(f"✗ Failed to convert model: {e}")
        sys.exit(1)

    # Organize for Transformers.js (move onnx files to onnx/ subdirectory)
    print("\n[4/4] Organizing files for Transformers.js...")
    onnx_dir = output_path / "onnx"
    onnx_dir.mkdir(exist_ok=True)

    for onnx_file in output_path.glob("*.onnx"):
        dest = onnx_dir / onnx_file.name
        onnx_file.rename(dest)
        print(f"  Moved {onnx_file.name} -> onnx/{onnx_file.name}")

    for data_file in output_path.glob("*.onnx_data"):
        dest = onnx_dir / data_file.name
        data_file.rename(dest)
        print(f"  Moved {data_file.name} -> onnx/{data_file.name}")

    # Summary
    print("\n" + "=" * 50)
    print("✓ Conversion complete!")
    print("=" * 50)

    print(f"\nFiles in {output_path}:")
    for f in sorted(output_path.rglob("*")):
        if f.is_file():
            size_mb = f.stat().st_size / (1024 * 1024)
            rel_path = f.relative_to(output_path)
            print(f"  {rel_path} ({size_mb:.1f} MB)")

    print("\n" + "-" * 50)
    print("Next steps:")
    print("-" * 50)
    print(f"""
Option 1: Upload to Hugging Face Hub
    huggingface-cli login
    huggingface-cli upload <your-username>/<model-name> {output_path}

Option 2: Self-host
    1. Copy {output_path} to public/models/
    2. Call setModelHost('/models') in the app
    3. Add model to AVAILABLE_MODELS in nerModels.ts
""")


def main():
    parser = argparse.ArgumentParser(
        description="Convert a Hugging Face model to ONNX for Transformers.js"
    )
    parser.add_argument(
        "model_id",
        help="Hugging Face model ID (e.g., 'OpenMed/OpenMed-PII-BioClinicalModern-Base-149M-v1')"
    )
    parser.add_argument(
        "output_dir",
        nargs="?",
        default=None,
        help="Output directory (default: ./models/<model-name>-onnx)"
    )

    args = parser.parse_args()

    if args.output_dir is None:
        model_name = args.model_id.split("/")[-1]
        args.output_dir = f"./models/{model_name}-onnx"

    convert_model(args.model_id, args.output_dir)


if __name__ == "__main__":
    main()
