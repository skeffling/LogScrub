#!/usr/bin/env python3
"""
Convert a Hugging Face model to ONNX format for use with Transformers.js

This script converts PyTorch models to ONNX format, which is required for
running models in the browser with Transformers.js.

Usage:
    python convert-model-to-onnx.py <model_id> [output_dir]

Example:
    python convert-model-to-onnx.py OpenMed/OpenMed-PII-BioClinicalModern-Base-149M-v1 ./models/openmed-pii

Requirements:
    pip install optimum[exporters] transformers torch

After conversion, you can:
1. Upload to Hugging Face Hub
2. Self-host the files and use setModelHost() in the app
"""

import argparse
import subprocess
import sys
from pathlib import Path


def check_dependencies():
    """Check if required packages are installed."""
    required = ['optimum', 'transformers', 'torch']
    missing = []

    for package in required:
        try:
            __import__(package)
        except ImportError:
            missing.append(package)

    if missing:
        print(f"Missing required packages: {', '.join(missing)}")
        print("\nInstall them with:")
        print(f"  pip install optimum[exporters] transformers torch")
        sys.exit(1)


def convert_model(model_id: str, output_dir: str, quantize: bool = True):
    """
    Convert a model to ONNX format using optimum-cli.

    Args:
        model_id: Hugging Face model ID (e.g., 'OpenMed/OpenMed-PII-BioClinicalModern-Base-149M-v1')
        output_dir: Directory to save the converted model
        quantize: Whether to also create a quantized version (smaller, slightly less accurate)
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"Converting model: {model_id}")
    print(f"Output directory: {output_path.absolute()}")
    print("-" * 50)

    # Export to ONNX
    print("\n[1/3] Exporting model to ONNX format...")
    cmd = [
        sys.executable, "-m", "optimum.exporters.onnx",
        "--model", model_id,
        "--task", "token-classification",
        str(output_path)
    ]

    try:
        subprocess.run(cmd, check=True)
        print("✓ ONNX export complete")
    except subprocess.CalledProcessError as e:
        print(f"✗ ONNX export failed: {e}")
        sys.exit(1)

    if quantize:
        print("\n[2/3] Creating quantized version (smaller file size)...")
        try:
            from optimum.onnxruntime import ORTQuantizer
            from optimum.onnxruntime.configuration import AutoQuantizationConfig

            # Find the model file
            model_file = output_path / "model.onnx"
            if not model_file.exists():
                print(f"  Skipping quantization - model.onnx not found")
            else:
                quantizer = ORTQuantizer.from_pretrained(output_path)
                qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)

                quantizer.quantize(
                    save_dir=output_path,
                    quantization_config=qconfig,
                )
                print("✓ Quantization complete")
        except Exception as e:
            print(f"  Skipping quantization: {e}")

    # Organize files for Transformers.js
    print("\n[3/3] Organizing files for Transformers.js...")
    onnx_dir = output_path / "onnx"
    onnx_dir.mkdir(exist_ok=True)

    # Move ONNX files to onnx/ subdirectory (Transformers.js convention)
    for onnx_file in output_path.glob("*.onnx"):
        dest = onnx_dir / onnx_file.name
        onnx_file.rename(dest)
        print(f"  Moved {onnx_file.name} -> onnx/{onnx_file.name}")

    # Also move any .onnx_data files
    for data_file in output_path.glob("*.onnx_data"):
        dest = onnx_dir / data_file.name
        data_file.rename(dest)
        print(f"  Moved {data_file.name} -> onnx/{data_file.name}")

    print("\n" + "=" * 50)
    print("✓ Conversion complete!")
    print("=" * 50)

    # List output files
    print(f"\nOutput files in {output_path}:")
    for f in sorted(output_path.rglob("*")):
        if f.is_file():
            size_mb = f.stat().st_size / (1024 * 1024)
            rel_path = f.relative_to(output_path)
            print(f"  {rel_path} ({size_mb:.1f} MB)")

    print("\n" + "-" * 50)
    print("Next steps:")
    print("-" * 50)
    print("""
Option 1: Upload to Hugging Face Hub
    huggingface-cli login
    huggingface-cli upload <your-username>/<model-name> {output_dir}

Option 2: Self-host the files
    1. Copy the output directory to your web server's public folder
    2. In the app, call: setModelHost('/path/to/models')
    3. Add the model to AVAILABLE_MODELS in nerModels.ts

Required files for Transformers.js:
    - onnx/model.onnx (or model_quantized.onnx)
    - config.json
    - tokenizer.json
    - tokenizer_config.json
    - (optional) special_tokens_map.json, vocab.txt
""".format(output_dir=output_path))


def main():
    parser = argparse.ArgumentParser(
        description="Convert a Hugging Face model to ONNX for Transformers.js",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s OpenMed/OpenMed-PII-BioClinicalModern-Base-149M-v1
  %(prog)s OpenMed/OpenMed-PII-BioClinicalModern-Base-149M-v1 ./my-output-dir
  %(prog)s dslim/bert-base-NER --no-quantize
        """
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
    parser.add_argument(
        "--no-quantize",
        action="store_true",
        help="Skip quantization step"
    )

    args = parser.parse_args()

    # Default output directory based on model name
    if args.output_dir is None:
        model_name = args.model_id.split("/")[-1]
        args.output_dir = f"./models/{model_name}-onnx"

    check_dependencies()
    convert_model(args.model_id, args.output_dir, quantize=not args.no_quantize)


if __name__ == "__main__":
    main()
