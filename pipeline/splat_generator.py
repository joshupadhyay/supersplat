"""
Modal GPU pipeline: images → gaussian splat → .ply → .spz

This is the core reconstruction pipeline that runs on Modal's serverless GPUs.
It takes a set of street-level images and produces a gaussian splat.

Usage:
    modal run splat_generator.py --input-dir /data/mapillary/images --output-dir /data/splats
"""

import modal

# Modal app definition
app = modal.App("globerun-splat-generator")

# GPU image with CUDA + Python dependencies for gaussian splatting
gpu_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "wget", "unzip", "build-essential", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.4.0",
        "torchvision==0.19.0",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install(
        "numpy",
        "pillow",
        "tqdm",
        "plyfile",
        "opencv-python-headless",
    )
)

# Persistent volume for storing splats
volume = modal.Volume.from_name("globerun-data", create_if_missing=True)
VOLUME_PATH = "/data"


@app.function(
    image=gpu_image,
    gpu="A10G",
    timeout=600,
    volumes={VOLUME_PATH: volume},
)
def generate_splat(image_dir: str, output_name: str) -> str:
    """
    Generate a gaussian splat from a directory of images.

    Args:
        image_dir: Path to directory of input images (relative to volume)
        output_name: Name for the output splat file

    Returns:
        Path to the generated .ply file on the volume
    """
    import subprocess
    import os

    input_path = os.path.join(VOLUME_PATH, image_dir)
    output_path = os.path.join(VOLUME_PATH, "splats", output_name)
    os.makedirs(output_path, exist_ok=True)

    # Count input images
    images = [f for f in os.listdir(input_path) if f.endswith(('.jpg', '.png', '.jpeg'))]
    print(f"Found {len(images)} images in {input_path}")

    # TODO: This is where the reconstruction pipeline goes.
    # We need to decide on and install one of:
    #   1. InstantSplat (end-to-end, no COLMAP)
    #   2. VGGT + gsplat (pose estimation + training)
    #   3. AnySplat (feed-forward, fastest)
    #
    # For now, this is a skeleton that verifies:
    #   - Modal GPU access works
    #   - Volume mounting works
    #   - Image files are accessible
    #   - CUDA is available

    import torch
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB")

    # Verify images are readable
    from PIL import Image
    sample = images[0]
    img = Image.open(os.path.join(input_path, sample))
    print(f"Sample image: {sample}, size: {img.size}, mode: {img.mode}")

    return output_path


@app.function(
    image=gpu_image,
    gpu="A10G",
    timeout=300,
    volumes={VOLUME_PATH: volume},
)
def verify_gpu():
    """Quick check that Modal GPU setup is working."""
    import torch

    info = {
        "cuda_available": torch.cuda.is_available(),
        "device_count": torch.cuda.device_count(),
    }

    if torch.cuda.is_available():
        info["device_name"] = torch.cuda.get_device_name(0)
        props = torch.cuda.get_device_properties(0)
        vram = getattr(props, 'total_memory', None) or getattr(props, 'total_mem', None)
        info["vram_gb"] = round(vram / 1e9, 1) if vram else "unknown"
        info["cuda_version"] = torch.version.cuda

        # Quick tensor operation to verify GPU works
        t = torch.randn(1000, 1000, device="cuda")
        result = torch.mm(t, t)
        info["gpu_compute_works"] = True

    return info


@app.local_entrypoint()
def main():
    """Run GPU verification when called with `modal run splat_generator.py`."""
    import json

    print("Verifying Modal GPU setup...")
    info = verify_gpu.remote()
    for k, v in info.items():
        print(f"  {k}: {v}")
    print("\nModal GPU pipeline is ready!")

    with open("gpu_verify_output.json", "w") as f:
        json.dump(info, f, indent=2)
    print("Saved to gpu_verify_output.json")
