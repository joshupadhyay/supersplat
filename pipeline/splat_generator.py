"""
Modal GPU pipeline: images → AnySplat → gaussian splat .ply

Runs AnySplat feed-forward inference on Modal's serverless GPUs.
Takes unposed street-level images, produces a gaussian splat .ply file.

Usage:
    # Verify AnySplat + GPU setup (first run builds image ~20min)
    modal run splat_generator.py

    # Upload test images to Modal volume
    modal volume put globerun-data ./my-photos images/test/

    # Generate splat from uploaded images
    modal run splat_generator.py --image-dir images/test --output-name my-scene

    # Download result
    modal volume get globerun-data splats/my-scene/scene.ply ./scene.ply
"""

import modal
import os

app = modal.App("globerun-splat-generator")

# ---------------------------------------------------------------------------
# Image: PyTorch 2.2.0 + CUDA 12.1 (devel) + AnySplat deps
# Using official PyTorch devel image so pytorch3d CUDA kernels can compile.
# ---------------------------------------------------------------------------
anysplat_image = (
    modal.Image.from_registry("pytorch/pytorch:2.2.0-cuda12.1-cudnn8-devel")
    .apt_install(
        "git", "build-essential", "ninja-build",
        "libgl1", "libglib2.0-0",
    )
    # Pinned deps AnySplat requires
    .pip_install(
        "numpy==1.25.0",
        "xformers==0.0.24",
        "moviepy==1.0.3",
    )
    # gsplat prebuilt wheel (PT2.2 + CU121 + CP310)
    .pip_install(
        "https://github.com/nerfstudio-project/gsplat/releases/download/v1.4.0/"
        "gsplat-1.4.0%2Bpt22cu121-cp310-cp310-linux_x86_64.whl"
    )
    # CUDA-compiled packages — need GPU at build time
    # torch_scatter from PyG wheel index (prebuilt for PT2.2+CU121)
    # pytorch3d from source (needs nvcc from devel image)
    .pip_install("fvcore", "iopath")
    .run_commands(
        "pip install torch_scatter==2.1.2 -f https://data.pyg.org/whl/torch-2.2.0+cu121.html && "
        "pip install 'git+https://github.com/facebookresearch/pytorch3d.git'",
        gpu="A10G",
    )
    # All AnySplat deps — sourced from:
    # https://github.com/InternRobotics/AnySplat/blob/main/requirements.txt
    # (minus pytorch3d, gsplat, xformers, torch_scatter, moviepy already installed above;
    #  minus gradio/black/ruff which are demo-UI/dev-only)
    .pip_install(
        "pillow", "tqdm", "plyfile", "opencv-python-headless",
        "einops", "timm", "huggingface_hub", "safetensors",
        "hydra-core", "jaxtyping", "beartype", "colorama",
        "scikit-image", "imageio", "dacite", "e3nn",
        "open3d", "pydantic", "lightning",
        "scikit-video", "wandb", "lpips", "tabulate",
        "colorspacious", "matplotlib", "svg.py",
    )
    # Re-pin numpy<2 after all deps installed (some deps upgrade it)
    .pip_install("numpy==1.25.0")
    # Clone AnySplat repo (provides src/ package used at inference)
    .run_commands(
        "git clone --depth 1 https://github.com/InternRobotics/AnySplat.git /opt/anysplat"
    )
    # Pre-download 2.94 GB model weights into HF cache (baked into image)
    .run_commands(
        "python -c \""
        "from huggingface_hub import snapshot_download; "
        "snapshot_download('lhjiang/anysplat')"
        "\""
    )
    .env({
        "OPENCV_IO_ENABLE_OPENEXR": "1",
        "PYTHONPATH": "/opt/anysplat",
    })
)

# Persistent volume for images + output splats (free, no TTL)
volume = modal.Volume.from_name("globerun-data", create_if_missing=True)
VOLUME_PATH = "/data"


# ---------------------------------------------------------------------------
# AnySplat inference class with memory snapshots for fast cold starts
# ---------------------------------------------------------------------------
@app.cls(
    image=anysplat_image,
    gpu="A10G",
    timeout=600,
    volumes={VOLUME_PATH: volume},
    enable_memory_snapshot=True,
)
class SplatGenerator:
    """AnySplat inference on Modal GPU. Model is snapshotted after first load."""

    @modal.enter(snap=True)
    def load_model_cpu(self):
        """Load AnySplat weights into CPU memory (captured by snapshot)."""
        import sys
        sys.path.insert(0, "/opt/anysplat")

        import torch
        from src.model.model.anysplat import AnySplat

        self.model = AnySplat.from_pretrained("lhjiang/anysplat")
        self.model.eval()
        print("AnySplat loaded to CPU (snapshotted)")

    @modal.enter(snap=False)
    def move_to_gpu(self):
        """Move model to GPU after snapshot restore."""
        import torch

        self.device = torch.device("cuda")
        self.model = self.model.to(self.device)
        print(f"AnySplat moved to {torch.cuda.get_device_name(0)}")

    @modal.method()
    def generate(self, image_dir: str, output_name: str) -> dict:
        """
        Generate a gaussian splat .ply from a directory of images.

        Args:
            image_dir: Image directory path relative to volume root (e.g. "images/test")
            output_name: Name for the output directory under splats/

        Returns:
            Dict with output_path, num_gaussians, file_size_mb, inference_time_s
        """
        import sys
        sys.path.insert(0, "/opt/anysplat")

        import time
        import torch
        from pathlib import Path
        from src.utils.image import process_image
        from src.model.ply_export import export_ply

        input_path = os.path.join(VOLUME_PATH, image_dir)
        output_dir = os.path.join(VOLUME_PATH, "splats", output_name)
        os.makedirs(output_dir, exist_ok=True)
        ply_path = Path(os.path.join(output_dir, "scene.ply"))

        # Discover images
        extensions = (".jpg", ".jpeg", ".png", ".webp")
        image_files = sorted(
            f for f in os.listdir(input_path) if f.lower().endswith(extensions)
        )
        n = len(image_files)
        print(f"Found {n} images in {input_path}")
        if n < 3:
            raise ValueError(f"AnySplat needs >= 3 images, found {n}")

        # Preprocess: resize + center-crop to 448x448, normalise to [-1, 1]
        image_paths = [os.path.join(input_path, f) for f in image_files]
        images = [process_image(p) for p in image_paths]
        images = torch.stack(images, dim=0).unsqueeze(0).to(self.device)
        print(f"Input tensor: {images.shape}  (batch, views, C, H, W)")

        # Inference — AnySplat expects [0, 1] range
        t0 = time.time()
        with torch.no_grad():
            gaussians, pred_poses = self.model.inference((images + 1) * 0.5)
        elapsed = time.time() - t0
        print(f"Inference: {elapsed:.1f}s")

        # Export .ply — gaussians is a dataclass, index [0] strips batch dim
        export_ply(
            means=gaussians.means[0],
            scales=gaussians.scales[0],
            rotations=gaussians.rotations[0],
            harmonics=gaussians.harmonics[0],
            opacities=gaussians.opacities[0],
            path=ply_path,
            shift_and_scale=False,
            save_sh_dc_only=True,
        )

        file_size_mb = ply_path.stat().st_size / (1024 * 1024)
        num_gaussians = int(gaussians.means[0].shape[0])
        print(f"Saved {ply_path}: {num_gaussians:,} gaussians, {file_size_mb:.1f} MB")

        volume.commit()

        return {
            "output_path": str(ply_path),
            "num_images": n,
            "num_gaussians": num_gaussians,
            "file_size_mb": round(file_size_mb, 1),
            "inference_time_s": round(elapsed, 1),
        }

    @modal.method()
    def verify(self) -> dict:
        """Verify AnySplat model + GPU are working."""
        import torch

        props = torch.cuda.get_device_properties(0)
        vram = getattr(props, "total_memory", None) or getattr(props, "total_mem", None)

        return {
            "model_loaded": self.model is not None,
            "device": str(self.device),
            "gpu_name": torch.cuda.get_device_name(0),
            "vram_gb": round(vram / 1e9, 1) if vram else "unknown",
            "cuda_version": torch.version.cuda,
            "torch_version": torch.__version__,
        }


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def main(
    image_dir: str = "",
    output_name: str = "test",
):
    """
    modal run splat_generator.py                          # verify setup
    modal run splat_generator.py --image-dir images/test  # generate splat
    """
    import json

    gen = SplatGenerator()

    if not image_dir:
        print("Verifying AnySplat + Modal GPU setup...")
        info = gen.verify.remote()
        for k, v in info.items():
            print(f"  {k}: {v}")
        print("\nAnySplat pipeline ready!")
        with open("gpu_verify_output.json", "w") as f:
            json.dump(info, f, indent=2)
        print("Saved gpu_verify_output.json")
    else:
        print(f"Generating splat from {image_dir} ...")
        result = gen.generate.remote(image_dir, output_name)
        for k, v in result.items():
            print(f"  {k}: {v}")
        print(f"\nSplat saved on volume at {result['output_path']}")
        print(f"Download: modal volume get globerun-data {result['output_path'].removeprefix('/data/')} ./scene.ply")
        with open("splat_output.json", "w") as f:
            json.dump(result, f, indent=2)
