#!/usr/bin/env python3
"""
Extract perspective crops from a Mapillary panorama for AnySplat input.

Downloads an equirectangular panorama and extracts 6 perspective crops
at evenly-spaced headings, ready to feed into the splat pipeline.

Usage:
    export MAPILLARY_TOKEN="MLY|..."
    python extract_pano_crops.py                          # uses default test pano
    python extract_pano_crops.py --image-id 973603243975770
    python extract_pano_crops.py --image-id 973603243975770 --num-crops 8 --fov 80
"""

import os
import sys
import argparse
import requests
import numpy as np
from PIL import Image
from io import BytesIO
from pathlib import Path

# ---- Mapillary API ----

ACCESS_TOKEN = os.environ.get("MAPILLARY_TOKEN")
HEADERS = {"Authorization": f"OAuth {ACCESS_TOKEN}"} if ACCESS_TOKEN else {}

DEFAULT_IMAGE_ID = "973603243975770"


def fetch_pano_url(image_id: str) -> dict:
    """Get panorama metadata + download URL from Mapillary API."""
    fields = "id,thumb_original_url,height,width,computed_compass_angle,camera_type"
    url = f"https://graph.mapillary.com/{image_id}?fields={fields}"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()


def download_pano(url: str) -> Image.Image:
    """Download panorama image from URL."""
    print(f"Downloading panorama...")
    resp = requests.get(url, stream=True, timeout=60)
    resp.raise_for_status()
    data = BytesIO(resp.content)
    img = Image.open(data)
    print(f"  Downloaded: {img.size[0]}x{img.size[1]} ({img.mode})")
    return img


# ---- Equirectangular → Perspective Projection ----

def equirect_to_perspective(
    equirect: np.ndarray,
    heading_deg: float,
    pitch_deg: float = 0.0,
    fov_deg: float = 90.0,
    out_size: int = 512,
) -> np.ndarray:
    """
    Extract a perspective (rectilinear) crop from an equirectangular panorama.

    Args:
        equirect: HxWx3 uint8 array (equirectangular panorama, 2:1 aspect)
        heading_deg: Horizontal angle in degrees (0=front, 90=right, etc.)
        pitch_deg: Vertical angle in degrees (0=horizon, +up, -down)
        fov_deg: Field of view in degrees
        out_size: Output image size (square)

    Returns:
        out_size x out_size x 3 uint8 array
    """
    h_eq, w_eq = equirect.shape[:2]

    # Convert angles to radians
    heading = np.radians(heading_deg)
    pitch = np.radians(pitch_deg)
    fov = np.radians(fov_deg)

    # Focal length in pixels for the output image
    f = (out_size / 2) / np.tan(fov / 2)

    # Build pixel grid for output image, centered at (0,0)
    u = np.arange(out_size, dtype=np.float64) - out_size / 2
    v = np.arange(out_size, dtype=np.float64) - out_size / 2
    uu, vv = np.meshgrid(u, v)

    # 3D ray directions in camera space (x=right, y=down, z=forward)
    x = uu
    y = vv
    z = np.full_like(uu, f)

    # Normalize
    norm = np.sqrt(x**2 + y**2 + z**2)
    x, y, z = x / norm, y / norm, z / norm

    # Rotation: first pitch (around x-axis), then heading (around y-axis)
    # Pitch rotation (positive pitch = look up = rotate around x)
    cos_p, sin_p = np.cos(-pitch), np.sin(-pitch)
    y2 = cos_p * y - sin_p * z
    z2 = sin_p * y + cos_p * z
    y, z = y2, z2

    # Heading rotation (positive heading = look right = rotate around y)
    cos_h, sin_h = np.cos(heading), np.sin(heading)
    x2 = cos_h * x + sin_h * z
    z2 = -sin_h * x + cos_h * z
    x, z = x2, z2

    # Convert 3D ray to spherical coordinates (longitude, latitude)
    lon = np.arctan2(x, z)  # -pi to pi
    lat = np.arcsin(np.clip(y, -1, 1))  # -pi/2 to pi/2

    # Map to equirectangular pixel coordinates
    eq_x = ((lon / np.pi + 1) / 2 * w_eq).astype(np.float64)
    eq_y = ((lat / (np.pi / 2) + 1) / 2 * h_eq).astype(np.float64)

    # Clamp to valid range
    eq_x = np.clip(eq_x, 0, w_eq - 1).astype(int)
    eq_y = np.clip(eq_y, 0, h_eq - 1).astype(int)

    # Sample pixels
    return equirect[eq_y, eq_x]


# ---- Main ----

def main():
    parser = argparse.ArgumentParser(description="Extract perspective crops from a Mapillary panorama")
    parser.add_argument("--image-id", default=DEFAULT_IMAGE_ID, help="Mapillary image ID")
    parser.add_argument("--num-crops", type=int, default=6, help="Number of evenly-spaced crops (default: 6)")
    parser.add_argument("--fov", type=float, default=90.0, help="Field of view in degrees (default: 90)")
    parser.add_argument("--pitch", type=float, default=0.0, help="Pitch in degrees, 0=horizon (default: 0)")
    parser.add_argument("--out-size", type=int, default=512, help="Output crop size in pixels (default: 512)")
    parser.add_argument("--output-dir", default="./data/test-crops", help="Output directory")
    args = parser.parse_args()

    if not ACCESS_TOKEN:
        sys.exit("Set MAPILLARY_TOKEN environment variable.\n"
                 "Get one at https://www.mapillary.com/developer")

    # Fetch metadata
    print(f"Fetching metadata for image {args.image_id}...")
    meta = fetch_pano_url(args.image_id)
    print(f"  Camera type: {meta.get('camera_type', 'unknown')}")
    print(f"  Compass angle: {meta.get('computed_compass_angle', 'unknown')}°")

    pano_url = meta.get("thumb_original_url")
    if not pano_url:
        sys.exit("No image URL returned. Check your token and image ID.")

    # Download
    pano_img = download_pano(pano_url)
    equirect = np.array(pano_img)

    # Verify it looks like a panorama (roughly 2:1 aspect ratio)
    h, w = equirect.shape[:2]
    ratio = w / h
    if ratio < 1.5:
        print(f"  WARNING: Aspect ratio {ratio:.1f}:1 — expected ~2:1 for equirectangular pano.")
        print(f"  This might not be a panoramic image. Proceeding anyway.")

    # Extract perspective crops at evenly-spaced headings
    compass = meta.get("computed_compass_angle", 0) or 0
    headings = [compass + i * (360 / args.num_crops) for i in range(args.num_crops)]

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nExtracting {args.num_crops} crops (FOV={args.fov}°, size={args.out_size}px):")
    for i, heading in enumerate(headings):
        heading_norm = heading % 360
        crop = equirect_to_perspective(equirect, heading_norm, args.pitch, args.fov, args.out_size)
        crop_img = Image.fromarray(crop)

        filename = f"crop_{i:02d}_h{heading_norm:05.1f}.jpg"
        filepath = out_dir / filename
        crop_img.save(filepath, quality=95)
        print(f"  [{i+1}/{args.num_crops}] heading={heading_norm:5.1f}°  → {filename}")

    # Save metadata for reference
    import json
    meta_out = {
        "source_image_id": args.image_id,
        "source_url": f"https://www.mapillary.com/app/?pKey={args.image_id}",
        "compass_angle": compass,
        "camera_type": meta.get("camera_type"),
        "pano_size": [w, h],
        "num_crops": args.num_crops,
        "fov_deg": args.fov,
        "pitch_deg": args.pitch,
        "out_size": args.out_size,
        "crops": [
            {"index": i, "heading": h % 360, "filename": f"crop_{i:02d}_h{h % 360:05.1f}.jpg"}
            for i, h in enumerate(headings)
        ],
    }
    meta_path = out_dir / "crop_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(meta_out, f, indent=2)

    print(f"\nSaved {args.num_crops} crops + metadata to {out_dir}/")
    print(f"\nNext steps:")
    print(f"  # Upload to Modal volume")
    print(f"  modal volume put globerun-data {out_dir} images/test/")
    print(f"  # Generate splat")
    print(f"  modal run splat_generator.py --image-dir images/test --output-name first-test")


if __name__ == "__main__":
    main()
