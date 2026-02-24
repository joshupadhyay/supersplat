#!/usr/bin/env python3
"""
Download panoramic images from Williamsburg, Brooklyn via Mapillary API v4.

Usage:
    export MAPILLARY_TOKEN="MLY|..."
    python fetch_mapillary.py
"""

import os
import sys
import json
import time
import requests
import mercantile

# ---- Config ----
ACCESS_TOKEN = os.environ.get("MAPILLARY_TOKEN")
if not ACCESS_TOKEN:
    sys.exit("Set MAPILLARY_TOKEN environment variable")

HEADERS = {"Authorization": f"OAuth {ACCESS_TOKEN}"}
OUTPUT_DIR = "./data/mapillary"
FIELDS = ",".join([
    "id", "computed_geometry", "computed_compass_angle", "captured_at",
    "camera_type", "camera_parameters", "make", "model",
    "height", "width", "sequence", "thumb_original_url"
])

# Williamsburg, Brooklyn bounding box
WEST, SOUTH, EAST, NORTH = -73.970, 40.700, -73.935, 40.725


def query_bbox(bbox_str, is_pano=True):
    """Query images in a single small bbox, handling pagination."""
    params = {
        "bbox": bbox_str,
        "limit": 2000,
        "fields": FIELDS,
        "is_pano": str(is_pano).lower(),
    }
    images = []
    url = "https://graph.mapillary.com/images"

    while url:
        resp = requests.get(url, headers=HEADERS, params=params)
        resp.raise_for_status()
        data = resp.json()
        images.extend(data.get("data", []))
        url = data.get("paging", {}).get("next")
        params = {}  # params are embedded in the next URL
    return images


def query_all_tiles(is_pano=True):
    """Tile the Williamsburg bbox and query all tiles."""
    tiles = list(mercantile.tiles(WEST, SOUTH, EAST, NORTH, zooms=16))
    print(f"Querying {len(tiles)} tiles...")

    all_images = []
    seen = set()

    for i, tile in enumerate(tiles):
        bounds = mercantile.bounds(tile)
        bbox_str = f"{bounds.west},{bounds.south},{bounds.east},{bounds.north}"

        images = query_bbox(bbox_str, is_pano=is_pano)
        new = 0
        for img in images:
            if img["id"] not in seen:
                seen.add(img["id"])
                all_images.append(img)
                new += 1

        print(f"  Tile {i+1}/{len(tiles)}: {new} new images")
        time.sleep(0.1)

    print(f"Total: {len(all_images)} unique images")
    return all_images


def save_metadata(images):
    """Save image metadata as JSON and GeoJSON."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Raw metadata
    meta_path = os.path.join(OUTPUT_DIR, "metadata.json")
    with open(meta_path, "w") as f:
        json.dump(images, f, indent=2)

    # GeoJSON for visualization
    features = []
    for img in images:
        geom = img.get("computed_geometry")
        if not geom:
            continue
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "id": img["id"],
                "captured_at": img.get("captured_at"),
                "compass_angle": img.get("computed_compass_angle"),
                "camera_type": img.get("camera_type"),
                "make": img.get("make"),
                "model": img.get("model"),
                "height": img.get("height"),
                "width": img.get("width"),
                "sequence": img.get("sequence"),
            }
        })

    geojson = {"type": "FeatureCollection", "features": features}
    geo_path = os.path.join(OUTPUT_DIR, "images.geojson")
    with open(geo_path, "w") as f:
        json.dump(geojson, f)

    print(f"Saved {meta_path} and {geo_path}")


def download_images(images, resolution="thumb_original_url"):
    """Download images to disk."""
    img_dir = os.path.join(OUTPUT_DIR, "images")
    os.makedirs(img_dir, exist_ok=True)

    total = len(images)
    done = 0
    skipped = 0

    for img in images:
        image_id = img["id"]
        url = img.get(resolution)
        if not url:
            skipped += 1
            continue

        filepath = os.path.join(img_dir, f"{image_id}.jpg")
        if os.path.exists(filepath):
            done += 1
            continue

        try:
            r = requests.get(url, stream=True, timeout=30)
            r.raise_for_status()
            with open(filepath, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
            done += 1
            if done % 25 == 0:
                print(f"  Downloaded {done}/{total}")
        except Exception as e:
            print(f"  Error {image_id}: {e}")

        time.sleep(0.05)

    print(f"Downloaded {done}, skipped {skipped} (no URL)")


if __name__ == "__main__":
    print("=== Mapillary Williamsburg Pano Fetcher ===\n")

    # Step 1: Query
    images = query_all_tiles(is_pano=True)

    if not images:
        print("No panoramic images found. Trying all image types...")
        images = query_all_tiles(is_pano=False)

    if not images:
        sys.exit("No images found in the bounding box.")

    # Step 2: Save metadata
    save_metadata(images)

    # Step 3: Download
    print(f"\nDownloading {len(images)} images...")
    download_images(images)

    print("\nDone!")
