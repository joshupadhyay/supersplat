"""
Generate 3D worlds via World Labs Marble API from Street View panoramas.

Stitches SV tiles into equirectangular panos, uploads to Marble,
generates worlds, and downloads .spz files.

Usage:
    # Test with one pano, draft quality (~$0.12)
    python pipeline/marble_generator.py --input-dir data/streetview-overlap --pano-index 0

    # Use plus model (~$1.20)
    python pipeline/marble_generator.py --input-dir data/streetview-overlap --pano-index 0 --model plus
"""

import argparse
import base64
import json
import os
import sys
import time
from io import BytesIO
from pathlib import Path

import requests

# Import pano stitching from existing fetch script
sys.path.insert(0, str(Path(__file__).parent))
from fetch_streetview import create_session, stitch_pano_tiles, equirect_to_perspective

MARBLE_BASE = "https://api.worldlabs.ai"
GOOGLE_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
MARBLE_API_KEY = os.environ.get("WORLD_LABS_API_KEY", "")

MODEL_MAP = {
    "mini": "Marble 0.1-mini",
    "plus": "Marble 0.1-plus",
}


def stitch_and_save_pano(
    pano_id: str,
    output_path: str,
    zoom: int = 3,
) -> str:
    """Fetch SV tiles, stitch into equirectangular, save as PNG."""
    from PIL import Image
    import numpy as np

    google_key = GOOGLE_API_KEY
    if not google_key:
        raise ValueError("Set GOOGLE_MAPS_API_KEY env var")

    session = create_session(google_key)
    print(f"  Fetching tiles for pano {pano_id[:12]}... (zoom {zoom})")
    equirect = stitch_pano_tiles(google_key, session, pano_id, zoom)
    print(f"  Stitched: {equirect.shape[1]}x{equirect.shape[0]}")

    img = Image.fromarray(equirect)
    img.save(output_path, format="PNG")
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  Saved: {output_path} ({size_mb:.1f} MB)")
    return output_path


def marble_headers() -> dict:
    """Auth headers for Marble API."""
    if not MARBLE_API_KEY:
        raise ValueError("Set WORLD_LABS_API_KEY env var")
    return {"WLT-Api-Key": MARBLE_API_KEY}


def upload_image(image_path: str) -> str:
    """Upload image to Marble via media asset flow. Returns media_asset_id."""
    headers = marble_headers()
    filename = os.path.basename(image_path)
    ext = filename.rsplit(".", 1)[-1].lower()

    # Step 1: Prepare upload
    print(f"  Preparing upload for {filename}...")
    resp = requests.post(
        f"{MARBLE_BASE}/marble/v1/media-assets:prepare_upload",
        headers=headers,
        json={"file_name": filename, "kind": "image", "extension": ext},
    )
    resp.raise_for_status()
    data = resp.json()

    media_asset_id = data["media_asset"]["media_asset_id"]
    upload_url = data["upload_info"]["upload_url"]
    upload_method = data["upload_info"]["upload_method"]
    required_headers = data["upload_info"].get("required_headers") or {}

    # Step 2: Upload file
    print(f"  Uploading to signed URL ({upload_method})...")
    with open(image_path, "rb") as f:
        file_bytes = f.read()

    upload_resp = requests.request(
        upload_method,
        upload_url,
        headers=required_headers,
        data=file_bytes,
    )
    upload_resp.raise_for_status()
    print(f"  Upload complete. media_asset_id: {media_asset_id}")
    return media_asset_id


def generate_world(
    media_asset_id: str,
    display_name: str,
    model: str = "mini",
) -> str:
    """Start pano world generation. Returns operation_id."""
    headers = marble_headers()
    model_name = MODEL_MAP[model]

    payload = {
        "display_name": display_name,
        "model": model_name,
        "world_prompt": {
            "type": "image",
            "image_prompt": {
                "source": "media_asset",
                "media_asset_id": media_asset_id,
            },
            "is_pano": True,
        },
    }

    print(f"  Generating world with {model_name}...")
    resp = requests.post(
        f"{MARBLE_BASE}/marble/v1/worlds:generate",
        headers=headers,
        json=payload,
    )
    resp.raise_for_status()
    data = resp.json()
    op_id = data["operation_id"]
    print(f"  Operation started: {op_id}")
    return op_id


def generate_world_multi_image(
    media_asset_ids: list[tuple[str, float]],
    display_name: str,
    model: str = "mini",
    text_prompt: str | None = None,
) -> str:
    """Start multi-image world generation. Returns operation_id.

    Args:
        media_asset_ids: list of (media_asset_id, azimuth_degrees) tuples
        display_name: name for the world
        model: "mini" or "plus"
        text_prompt: optional text guidance
    """
    headers = marble_headers()
    model_name = MODEL_MAP[model]

    multi_image_prompt = [
        {
            "azimuth": azimuth,
            "content": {
                "source": "media_asset",
                "media_asset_id": mid,
            },
        }
        for mid, azimuth in media_asset_ids
    ]

    payload = {
        "display_name": display_name,
        "model": model_name,
        "world_prompt": {
            "type": "multi-image",
            "multi_image_prompt": multi_image_prompt,
            "reconstruct_images": True,
        },
    }
    if text_prompt:
        payload["world_prompt"]["text_prompt"] = text_prompt

    print(f"  Generating multi-image world with {model_name} ({len(media_asset_ids)} images)...")
    resp = requests.post(
        f"{MARBLE_BASE}/marble/v1/worlds:generate",
        headers=headers,
        json=payload,
    )
    resp.raise_for_status()
    data = resp.json()
    op_id = data["operation_id"]
    print(f"  Operation started: {op_id}")
    return op_id


def poll_operation(operation_id: str, timeout: int = 600, interval: int = 5) -> dict:
    """Poll operation until done. Returns completed operation data."""
    headers = marble_headers()
    start = time.time()

    while time.time() - start < timeout:
        resp = requests.get(
            f"{MARBLE_BASE}/marble/v1/operations/{operation_id}",
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()

        status = data.get("metadata", {}).get("progress", {}).get("status", "UNKNOWN")
        desc = data.get("metadata", {}).get("progress", {}).get("description", "")
        elapsed = int(time.time() - start)
        print(f"  [{elapsed}s] Status: {status} - {desc}", end="\r")

        if data.get("done"):
            print(f"\n  Completed in {elapsed}s")
            if data.get("error"):
                raise RuntimeError(f"Generation failed: {data['error']}")
            return data

        time.sleep(interval)

    raise TimeoutError(f"Operation {operation_id} timed out after {timeout}s")


def download_file(url: str, output_path: str, label: str = "file") -> str:
    """Download a file from URL to output_path."""
    print(f"  Downloading {label} from {url[:60]}...")
    resp = requests.get(url, stream=True)
    resp.raise_for_status()

    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  Saved: {output_path} ({size_mb:.1f} MB)")
    return output_path


def download_spz(world_data: dict, output_path: str) -> str:
    """Download full-res .spz from completed world."""
    assets = world_data.get("assets", {})
    splats = assets.get("splats", {})
    spz_urls = splats.get("spz_urls", {})

    url = spz_urls.get("full_res")
    if not url:
        url = spz_urls.get("500k") or spz_urls.get("100k")
    if not url:
        raise ValueError(f"No .spz URL found in world assets: {json.dumps(assets, indent=2)}")

    return download_file(url, output_path, ".spz")


def download_mesh(world_data: dict, output_path: str) -> str | None:
    """Download collider mesh (.glb) from completed world. Returns None if unavailable."""
    assets = world_data.get("assets", {})
    mesh = assets.get("mesh", {})
    url = mesh.get("collider_mesh_url")

    if not url:
        print("  No collider mesh available for this world")
        return None

    return download_file(url, output_path, ".glb mesh")


def extract_and_save_crops(
    pano_ids: list[str],
    headings_per_pano: list[list[float]],
    output_dir: str,
    zoom: int = 3,
    crop_size: int = 1024,
    fov: float = 90.0,
) -> list[tuple[str, float]]:
    """Stitch panos and extract perspective crops. Returns list of (filepath, azimuth)."""
    from PIL import Image
    import numpy as np

    google_key = GOOGLE_API_KEY
    if not google_key:
        raise ValueError("Set GOOGLE_MAPS_API_KEY env var")

    session = create_session(google_key)
    crops = []

    for i, (pano_id, headings) in enumerate(zip(pano_ids, headings_per_pano)):
        print(f"  Stitching pano {pano_id[:12]}...")
        equirect = stitch_pano_tiles(google_key, session, pano_id, zoom)
        print(f"    Equirect: {equirect.shape[1]}x{equirect.shape[0]}")

        for heading in headings:
            crop = equirect_to_perspective(equirect, heading, pitch_deg=0.0, fov_deg=fov, out_size=crop_size)
            filename = f"crop_p{i}_h{int(heading):03d}.png"
            filepath = os.path.join(output_dir, filename)
            Image.fromarray(crop).save(filepath, format="PNG")
            # Azimuth: use heading directly (Marble only cares about relative angles)
            crops.append((filepath, heading))
            print(f"    Saved {filename} (heading={heading}°)")

    return crops


def run_pano_mode(args, panos, out_dir):
    """Generate a world from a single equirectangular panorama."""
    pano = panos[args.pano_index]
    pano_id = pano["pano_id"]
    idx = args.pano_index

    print(f"=== Pano Mode: Single Equirectangular ===")
    print(f"Pano {idx}: {pano_id[:12]}... ({pano['lat']:.6f}, {pano['lng']:.6f})")
    print(f"Model: {MODEL_MAP[args.model]}")
    print()

    # Step 1: Stitch
    pano_png = out_dir / f"pano{idx:02d}_equirect.png"
    if args.skip_stitch and pano_png.exists():
        print(f"[1/5] Skipping stitch (exists: {pano_png})")
    else:
        print(f"[1/5] Stitching equirectangular pano...")
        stitch_and_save_pano(pano_id, str(pano_png), zoom=args.zoom)
    print()

    # Step 2: Upload
    print(f"[2/5] Uploading to Marble API...")
    media_asset_id = upload_image(str(pano_png))
    print()

    # Step 3: Generate
    display_name = f"stmarks-pano{idx:02d}-{args.model}"
    print(f"[3/5] Generating world '{display_name}'...")
    op_id = generate_world(media_asset_id, display_name, model=args.model)
    result = poll_operation(op_id)
    print()

    # Step 4-5: Download
    world_data = result.get("response", {})
    world_id = world_data.get("id", "unknown")
    marble_url = world_data.get("world_marble_url", "")

    print(f"[4/5] Downloading .spz...")
    spz_path = out_dir / f"pano{idx:02d}.spz"
    download_spz(world_data, str(spz_path))
    print()

    print(f"[5/5] Downloading collider mesh...")
    mesh_path = out_dir / f"pano{idx:02d}_collider.glb"
    mesh_result = download_mesh(world_data, str(mesh_path))
    print()

    return {
        "id": f"pano{idx:02d}",
        "file": f"pano{idx:02d}.spz",
        "mesh_file": f"pano{idx:02d}_collider.glb" if mesh_result else None,
        "file_size_mb": round(os.path.getsize(str(spz_path)) / (1024 * 1024), 1),
        "source_pano_id": pano_id,
        "center": {"lat": pano["lat"], "lng": pano["lng"]},
        "heading": pano["heading"],
        "model": MODEL_MAP[args.model],
        "world_id": world_id,
        "marble_url": marble_url,
        "estimated_radius_m": None,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "completed",
    }


def run_multi_image_mode(args, panos, out_dir):
    """Generate a world from perspective crops spanning multiple pano positions."""
    # Use pano at pano_index and pano at pano_index+2 (or last available)
    idx_a = args.pano_index
    idx_b = min(args.pano_index + 2, len(panos) - 1)
    if idx_a == idx_b:
        idx_b = min(idx_a + 1, len(panos) - 1)

    pano_a = panos[idx_a]
    pano_b = panos[idx_b]

    print(f"=== Multi-Image Mode: Spanning Two Positions ===")
    print(f"Pano A ({idx_a}): {pano_a['pano_id'][:12]}... ({pano_a['lat']:.6f}, {pano_a['lng']:.6f})")
    print(f"Pano B ({idx_b}): {pano_b['pano_id'][:12]}... ({pano_b['lat']:.6f}, {pano_b['lng']:.6f})")
    print(f"Model: {MODEL_MAP[args.model]}")
    print()

    # Street heading (direction from A to B)
    street_heading = pano_a.get("heading", 119)

    # 4 crops from each pano (8 total, max for reconstruct mode)
    # From A: forward along street, left, right, backward
    # From B: backward toward A, left, right, forward
    headings_a = [
        street_heading % 360,                # forward (along street)
        (street_heading + 90) % 360,         # right
        (street_heading + 180) % 360,        # backward
        (street_heading + 270) % 360,        # left
    ]
    headings_b = [
        (street_heading + 180) % 360,        # backward (toward A)
        (street_heading + 270) % 360,        # left (from B's perspective)
        street_heading % 360,                # forward (beyond B)
        (street_heading + 90) % 360,         # right (from B's perspective)
    ]

    # Step 1: Extract crops
    crop_dir = out_dir / f"multi_{idx_a}_{idx_b}_crops"
    crop_dir.mkdir(parents=True, exist_ok=True)

    print(f"[1/5] Extracting 1024x1024 crops from both panos...")
    crops = extract_and_save_crops(
        pano_ids=[pano_a["pano_id"], pano_b["pano_id"]],
        headings_per_pano=[headings_a, headings_b],
        output_dir=str(crop_dir),
        zoom=args.zoom,
        crop_size=1024,
    )
    print(f"  Total crops: {len(crops)}")
    print()

    # Step 2: Upload all crops
    print(f"[2/5] Uploading {len(crops)} images to Marble API...")
    uploaded = []
    for filepath, azimuth in crops:
        mid = upload_image(filepath)
        uploaded.append((mid, azimuth))
    print()

    # Step 3: Generate multi-image world
    display_name = f"stmarks-multi-{idx_a}-{idx_b}-{args.model}"
    print(f"[3/5] Generating multi-image world '{display_name}'...")
    op_id = generate_world_multi_image(
        uploaded, display_name, model=args.model,
        text_prompt="A continuous street scene on St Marks Place in the East Village, NYC. Brownstone buildings line both sides of the tree-lined street."
    )
    result = poll_operation(op_id)
    print()

    # Step 4-5: Download
    world_data = result.get("response", {})
    world_id = world_data.get("id", "unknown")
    marble_url = world_data.get("world_marble_url", "")

    spz_name = f"multi_{idx_a}_{idx_b}.spz"
    print(f"[4/5] Downloading .spz...")
    spz_path = out_dir / spz_name
    download_spz(world_data, str(spz_path))
    print()

    print(f"[5/5] Downloading collider mesh...")
    mesh_name = f"multi_{idx_a}_{idx_b}_collider.glb"
    mesh_path = out_dir / mesh_name
    mesh_result = download_mesh(world_data, str(mesh_path))
    print()

    # Compute midpoint between the two panos
    mid_lat = (pano_a["lat"] + pano_b["lat"]) / 2
    mid_lng = (pano_a["lng"] + pano_b["lng"]) / 2

    return {
        "id": f"multi_{idx_a}_{idx_b}",
        "file": spz_name,
        "mesh_file": mesh_name if mesh_result else None,
        "file_size_mb": round(os.path.getsize(str(spz_path)) / (1024 * 1024), 1),
        "source_pano_id": f"{pano_a['pano_id']}+{pano_b['pano_id']}",
        "center": {"lat": mid_lat, "lng": mid_lng},
        "heading": street_heading,
        "model": MODEL_MAP[args.model],
        "world_id": world_id,
        "marble_url": marble_url,
        "estimated_radius_m": None,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "completed",
        "mode": "multi-image",
        "source_panos": [idx_a, idx_b],
    }


def main():
    parser = argparse.ArgumentParser(description="Generate Marble worlds from Street View panos")
    parser.add_argument("--input-dir", type=str, default="data/streetview-overlap", help="Dir with metadata.json")
    parser.add_argument("--output-dir", type=str, default="data/splats/marble", help="Output dir for .spz files")
    parser.add_argument("--pano-index", type=int, default=0, help="Which pano to process (0-indexed)")
    parser.add_argument("--model", type=str, default="mini", choices=["mini", "plus"], help="Marble model")
    parser.add_argument("--mode", type=str, default="pano", choices=["pano", "multi-image"],
                        help="'pano': single equirectangular. 'multi-image': crops from 2 positions")
    parser.add_argument("--zoom", type=int, default=3, help="SV tile zoom for stitching")
    parser.add_argument("--skip-stitch", action="store_true", help="Skip stitching if pano PNG already exists")
    args = parser.parse_args()

    # Load metadata
    meta_path = Path(args.input_dir) / "metadata.json"
    with open(meta_path) as f:
        meta = json.load(f)

    panos = meta["panos"]
    if args.pano_index >= len(panos):
        print(f"Error: pano_index {args.pano_index} out of range (have {len(panos)} panos)")
        return

    # Setup output dir
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Run selected mode
    if args.mode == "multi-image":
        entry = run_multi_image_mode(args, panos, out_dir)
    else:
        entry = run_pano_mode(args, panos, out_dir)

    # Save registry entry
    registry_path = out_dir / "registry.json"
    if registry_path.exists():
        with open(registry_path) as f:
            registry = json.load(f)
    else:
        registry = {
            "origin": {"lat": panos[0]["lat"], "lng": panos[0]["lng"]},
            "worlds": [],
        }

    existing_idx = next((i for i, w in enumerate(registry["worlds"]) if w["id"] == entry["id"]), None)
    if existing_idx is not None:
        registry["worlds"][existing_idx] = entry
    else:
        registry["worlds"].append(entry)

    with open(registry_path, "w") as f:
        json.dump(registry, f, indent=2)

    print(f"=== Done ===")
    print(f"  .spz: {out_dir / entry['file']}")
    print(f"  Marble URL: {entry.get('marble_url', 'N/A')}")
    print(f"  Registry: {registry_path}")


if __name__ == "__main__":
    main()
