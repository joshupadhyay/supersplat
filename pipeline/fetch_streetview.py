"""
Fetch Street View tiles from Google's Map Tiles API.

Crawls adjacent panos along a street and saves perspective crops
for feeding into DepthAnything V3.

Usage:
    # Fetch 15 panos along St Marks Place, NYC
    python pipeline/fetch_streetview.py

    # Custom location
    python pipeline/fetch_streetview.py --lat 40.7281 --lng -73.9865 --num-panos 15
"""

import argparse
import json
import os
import requests
import numpy as np
from PIL import Image
from io import BytesIO
from pathlib import Path


API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
BASE_URL = "https://tile.googleapis.com/v1"


def create_session(api_key: str) -> str:
    """Create a Street View tiles session token."""
    resp = requests.post(
        f"{BASE_URL}/createSession?key={api_key}",
        json={
            "mapType": "streetview",
            "language": "en-US",
            "region": "US",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    print(f"Session created: {data['session'][:20]}...")
    return data["session"]


def get_pano_id(api_key: str, session: str, lat: float, lng: float, radius: int = 50) -> str | None:
    """Get a pano ID from coordinates."""
    resp = requests.post(
        f"{BASE_URL}/streetview/panoIds?session={session}&key={api_key}",
        json={
            "locations": [{"lat": lat, "lng": lng}],
            "radius": radius,
        },
    )
    resp.raise_for_status()
    data = resp.json()
    pano_ids = data.get("panoIds", [])
    if pano_ids and isinstance(pano_ids[0], str):
        return pano_ids[0]
    return None


def get_metadata(api_key: str, session: str, pano_id: str) -> dict:
    """Get metadata for a pano including links to adjacent panos."""
    resp = requests.get(
        f"{BASE_URL}/streetview/metadata",
        params={
            "session": session,
            "key": api_key,
            "panoId": pano_id,
        },
    )
    resp.raise_for_status()
    return resp.json()


def fetch_tile(
    api_key: str,
    session: str,
    pano_id: str,
    zoom: int,
    x: int,
    y: int,
) -> bytes:
    """Fetch a single panorama tile at zoom/x/y."""
    resp = requests.get(
        f"{BASE_URL}/streetview/tiles/{zoom}/{x}/{y}",
        params={
            "session": session,
            "key": api_key,
            "panoId": pano_id,
        },
    )
    resp.raise_for_status()
    return resp.content


def fetch_thumbnail(
    api_key: str,
    session: str,
    pano_id: str,
    heading: float,
    pitch: float = 0.0,
    fov: int = 90,
    width: int = 512,
    height: int = 512,
) -> bytes:
    """Fetch a perspective thumbnail crop from a panorama."""
    resp = requests.get(
        f"{BASE_URL}/streetview/thumbnail",
        params={
            "session": session,
            "key": api_key,
            "panoId": pano_id,
            "heading": str(heading),
            "pitch": str(pitch),
            "width": str(width),
            "height": str(height),
            "fov": str(fov),
        },
    )
    resp.raise_for_status()
    return resp.content


def crawl_street(
    api_key: str,
    session: str,
    start_pano_id: str,
    num_panos: int = 15,
) -> list[dict]:
    """
    Crawl along a street from a starting pano, collecting adjacent panos.
    Follows the first link (main road direction) at each step.
    Returns list of {pano_id, lat, lng, heading, links} dicts.
    """
    visited = set()
    panos = []
    current_id = start_pano_id

    for i in range(num_panos):
        if current_id in visited:
            print(f"  Loop detected at pano {i}, stopping")
            break

        visited.add(current_id)
        meta = get_metadata(api_key, session, current_id)

        pano_info = {
            "pano_id": current_id,
            "lat": meta.get("lat"),
            "lng": meta.get("lng"),
            "heading": meta.get("heading", 0),
            "date": meta.get("date", ""),
            "image_width": meta.get("imageWidth"),
            "image_height": meta.get("imageHeight"),
            "links": meta.get("links", []),
        }
        panos.append(pano_info)
        print(f"  [{i+1}/{num_panos}] pano={current_id[:12]}... lat={pano_info['lat']:.6f} lng={pano_info['lng']:.6f} links={len(pano_info['links'])}")

        # Follow the first unvisited link to continue along the street
        links = meta.get("links", [])
        next_id = None
        for link in links:
            link_id = link.get("panoId")
            if link_id and link_id not in visited:
                next_id = link_id
                break

        if next_id is None:
            print(f"  No unvisited links from pano {i+1}, stopping")
            break

        current_id = next_id

    return panos


def fetch_pano_tiles(
    api_key: str,
    session: str,
    pano_id: str,
    zoom: int = 3,
    y_rows: list[int] | None = None,
    output_dir: str = ".",
    prefix: str = "",
) -> list[str]:
    """
    Fetch tiles from a pano at a given zoom level.

    At zoom 3: 8 x-tiles (each 45° FOV) × 4 y-tiles.
    y=0 is sky, y=1 is upper street, y=2 is lower street, y=3 is ground.
    For 3D reconstruction, y=1 and y=2 are most useful (street-level content).
    """
    if y_rows is None:
        y_rows = [1, 2]  # Street-level rows by default

    # Number of x tiles at each zoom: 2^zoom
    x_count = 2 ** zoom

    paths = []
    for y in y_rows:
        for x in range(x_count):
            img_bytes = fetch_tile(api_key, session, pano_id, zoom, x, y)
            filename = f"{prefix}z{zoom}_x{x}_y{y}.jpg"
            filepath = os.path.join(output_dir, filename)
            with open(filepath, "wb") as f:
                f.write(img_bytes)
            paths.append(filepath)
    return paths


def heading_to_tile_x(heading: float, zoom: int) -> int:
    """Convert a compass heading (0-360°) to the tile x-coordinate at a given zoom.

    At zoom z, there are 2^z horizontal tiles spanning 360°.
    Tile x=0 starts at heading 0° (north).
    """
    tile_count = 2 ** zoom
    degrees_per_tile = 360.0 / tile_count
    return int(heading / degrees_per_tile) % tile_count


def fetch_forward_views(
    api_key: str,
    session: str,
    panos: list[dict],
    zoom: int = 3,
    output_dir: str = ".",
) -> list[str]:
    """
    Fetch one forward-facing tile per pano — the tile looking along the road.

    Uses the heading from the pano's first link (road direction) to pick
    the correct tile. Falls back to the pano's default heading if no links.

    Returns list of saved image paths (one per pano).
    """
    y = 1  # Upper street level row

    paths = []
    for i, pano in enumerate(panos):
        # Determine forward heading: use the link heading if available
        links = pano.get("links", [])
        if links and "heading" in links[0]:
            forward_heading = links[0]["heading"]
        else:
            forward_heading = pano.get("heading", 0)

        x = heading_to_tile_x(forward_heading, zoom)

        img_bytes = fetch_tile(api_key, session, pano["pano_id"], zoom, x, y)
        filename = f"pano{i:02d}_fwd_h{int(forward_heading):03d}.jpg"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "wb") as f:
            f.write(img_bytes)
        paths.append(filepath)
        print(f"  [{i+1}/{len(panos)}] heading={forward_heading:.0f}° → tile z{zoom}/x{x}/y{y} → {filename}")

    return paths


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

    heading = np.radians(heading_deg)
    pitch = np.radians(pitch_deg)
    fov = np.radians(fov_deg)

    f = (out_size / 2) / np.tan(fov / 2)

    u = np.arange(out_size, dtype=np.float64) - out_size / 2
    v = np.arange(out_size, dtype=np.float64) - out_size / 2
    uu, vv = np.meshgrid(u, v)

    x = uu
    y = vv
    z = np.full_like(uu, f)

    norm = np.sqrt(x**2 + y**2 + z**2)
    x, y, z = x / norm, y / norm, z / norm

    cos_p, sin_p = np.cos(-pitch), np.sin(-pitch)
    y2 = cos_p * y - sin_p * z
    z2 = sin_p * y + cos_p * z
    y, z = y2, z2

    cos_h, sin_h = np.cos(heading), np.sin(heading)
    x2 = cos_h * x + sin_h * z
    z2 = -sin_h * x + cos_h * z
    x, z = x2, z2

    lon = np.arctan2(x, z)
    lat = np.arcsin(np.clip(y, -1, 1))

    eq_x = ((lon / np.pi + 1) / 2 * w_eq).astype(np.float64)
    eq_y = ((lat / (np.pi / 2) + 1) / 2 * h_eq).astype(np.float64)

    eq_x = np.clip(eq_x, 0, w_eq - 1).astype(int)
    eq_y = np.clip(eq_y, 0, h_eq - 1).astype(int)

    return equirect[eq_y, eq_x]


def stitch_pano_tiles(
    api_key: str,
    session: str,
    pano_id: str,
    zoom: int = 3,
) -> np.ndarray:
    """Fetch all tiles for a pano and stitch into a full equirectangular image."""
    x_count = 2 ** zoom
    y_count = max(1, 2 ** (zoom - 1))

    rows = []
    for y in range(y_count):
        row_tiles = []
        for x in range(x_count):
            tile_bytes = fetch_tile(api_key, session, pano_id, zoom, x, y)
            tile_img = Image.open(BytesIO(tile_bytes))
            row_tiles.append(np.array(tile_img))
        rows.append(np.concatenate(row_tiles, axis=1))

    return np.concatenate(rows, axis=0)


def fetch_overlapping_crops(
    api_key: str,
    session: str,
    panos: list[dict],
    fov: int = 90,
    heading_step: int = 45,
    pitches: list[float] | None = None,
    crop_size: int = 512,
    zoom: int = 3,
    output_dir: str = ".",
) -> list[str]:
    """
    Fetch pano tiles, stitch into equirectangular, then extract overlapping
    perspective crops locally.

    With FOV=90 and heading_step=45, adjacent crops share 50% horizontal overlap.
    Multiple pitch values provide vertical coverage (road to upper buildings).
    """
    if pitches is None:
        pitches = [-20.0, 0.0, 20.0]

    headings = list(range(0, 360, heading_step))
    overlap_pct = max(0, (fov - heading_step) / fov * 100)
    x_count = 2 ** zoom
    y_count = max(1, 2 ** (zoom - 1))
    tiles_per_pano = x_count * y_count

    print(f"  Headings: {headings} (FOV={fov}, step={heading_step} -> {overlap_pct:.0f}% overlap)")
    print(f"  Pitches: {pitches}")
    print(f"  Tiles per pano: {tiles_per_pano} (zoom {zoom}, {x_count}x{y_count})")
    print(f"  Crops per pano: {len(headings)} x {len(pitches)} = {len(headings) * len(pitches)}")
    print(f"  Total crops: {len(panos)} panos x {len(headings) * len(pitches)} = {len(panos) * len(headings) * len(pitches)}")

    paths = []
    for i, pano in enumerate(panos):
        print(f"  [{i+1}/{len(panos)}] Fetching {tiles_per_pano} tiles for pano {pano['pano_id'][:12]}...")
        equirect = stitch_pano_tiles(api_key, session, pano["pano_id"], zoom)
        print(f"    Stitched: {equirect.shape[1]}x{equirect.shape[0]}")

        for pitch in pitches:
            for heading in headings:
                crop = equirect_to_perspective(equirect, float(heading), pitch, float(fov), crop_size)
                crop_img = Image.fromarray(crop)
                if pitch < 0:
                    pitch_str = f"dn{abs(int(pitch)):02d}"
                elif pitch > 0:
                    pitch_str = f"up{abs(int(pitch)):02d}"
                else:
                    pitch_str = "p00"
                filename = f"pano{i:02d}_h{int(heading):03d}_{pitch_str}.jpg"
                filepath = os.path.join(output_dir, filename)
                crop_img.save(filepath, quality=95)
                paths.append(filepath)

        n_per_pano = len(headings) * len(pitches)
        print(f"    Extracted {n_per_pano} perspective crops ({crop_size}x{crop_size})")

    return paths


def main():
    parser = argparse.ArgumentParser(description="Fetch Street View tiles for DA3")
    parser.add_argument("--lat", type=float, default=40.7281176, help="Latitude")
    parser.add_argument("--lng", type=float, default=-73.9865227, help="Longitude")
    parser.add_argument("--num-panos", type=int, default=15, help="Number of panos to crawl")
    parser.add_argument("--zoom", type=int, default=3, help="Tile zoom level (0-5)")
    parser.add_argument(
        "--mode", type=str, default="forward",
        choices=["forward", "tiles", "overlap"],
        help="'forward': one per pano. 'tiles': tile grid. 'overlap': overlapping thumbnails for COLMAP"
    )
    parser.add_argument("--y-rows", type=str, default="1,2", help="Y tile rows (tiles mode only)")
    parser.add_argument("--output-dir", type=str, default="data/streetview", help="Output directory")
    parser.add_argument("--api-key", type=str, default="", help="Google Maps API key (or set GOOGLE_MAPS_API_KEY)")
    args = parser.parse_args()

    api_key = args.api_key or API_KEY
    if not api_key:
        print("Error: Set GOOGLE_MAPS_API_KEY env var or pass --api-key")
        return

    print(f"Starting at ({args.lat}, {args.lng})")
    print(f"Mode: {args.mode}, Crawling {args.num_panos} panos, zoom {args.zoom}")
    print(f"Output: {args.output_dir}")

    # Create session
    session = create_session(api_key)

    # Find starting pano
    print(f"\nFinding pano near ({args.lat}, {args.lng})...")
    start_pano = get_pano_id(api_key, session, args.lat, args.lng)
    if not start_pano:
        print("Error: No Street View pano found near those coordinates")
        return
    print(f"Found starting pano: {start_pano}")

    # Crawl along street
    print(f"\nCrawling {args.num_panos} panos along street...")
    panos = crawl_street(api_key, session, start_pano, args.num_panos)
    print(f"Collected {len(panos)} panos")

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.mode == "forward":
        # One forward-facing image per pano — ideal for DA3 multi-view
        print(f"\nFetching forward-facing view per pano (zoom {args.zoom}, 512x512 each)...")
        all_images = fetch_forward_views(
            api_key, session, panos,
            zoom=args.zoom,
            output_dir=str(output_dir),
        )
    elif args.mode == "overlap":
        # Fetch tiles, stitch panos, extract overlapping perspective crops
        pitches = [-20.0, 0.0, 20.0]
        heading_step = 45
        fov = 90
        total_per_pano = (360 // heading_step) * len(pitches)
        print(f"\nFetching overlapping crops ({total_per_pano} per pano, {fov} FOV, {heading_step} step)...")
        all_images = fetch_overlapping_crops(
            api_key, session, panos,
            fov=fov,
            heading_step=heading_step,
            pitches=pitches,
            zoom=args.zoom,
            output_dir=str(output_dir),
        )
    else:
        # Full tile grid per pano (old behavior)
        y_rows = [int(y) for y in args.y_rows.split(",")]
        x_count = 2 ** args.zoom
        tiles_per_pano = x_count * len(y_rows)
        print(f"\nFetching {tiles_per_pano} tiles per pano (512x512 each)...")
        all_images = []
        for i, pano in enumerate(panos):
            prefix = f"pano{i:02d}_"
            paths = fetch_pano_tiles(
                api_key, session, pano["pano_id"],
                zoom=args.zoom,
                y_rows=y_rows,
                output_dir=str(output_dir),
                prefix=prefix,
            )
            all_images.extend(paths)
            print(f"  [{i+1}/{len(panos)}] Fetched {len(paths)} tiles from {pano['pano_id'][:12]}...")

    # Save metadata
    meta_path = output_dir / "metadata.json"
    with open(meta_path, "w") as f:
        json.dump({
            "start_lat": args.lat,
            "start_lng": args.lng,
            "num_panos": len(panos),
            "zoom": args.zoom,
            "mode": args.mode,
            "total_images": len(all_images),
            "panos": panos,
        }, f, indent=2)

    print(f"\nDone!")
    print(f"  Panos: {len(panos)}")
    print(f"  Images: {len(all_images)}")
    print(f"  Output: {output_dir}")
    print(f"  Metadata: {meta_path}")
    print(f"\nAPI requests used: ~{1 + len(panos) + len(all_images)} "
          f"(1 panoId + {len(panos)} metadata + {len(all_images)} tiles)")


if __name__ == "__main__":
    main()
