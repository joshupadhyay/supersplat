# Plan: Generate 3 New Splats from Intersection → Existing Pano

## Context

We have one good splat (`multi8_p0`) at pano 0 (40.7281, -73.9865). The user wants to extend coverage westward from the intersection of St Marks Place & 2nd Ave (~40.7286, -73.9876, pano ID `L7yR6fnySMR6vp1JQw2Fnw`) toward the existing splat. That's ~90m of street.

Each splat is usable within ~8m radius. Street View panos are ~10m apart, giving ~6m overlap between adjacent splats — enough for seamless stitching.

**Goal:** Generate 3 new plus-tier splats starting from the intersection, working east toward pano 0.

## Pipeline (existing tools, no new code needed)

### Step 1: Fetch pano chain from intersection

```bash
cd pipeline && python fetch_streetview.py \
  --lat 40.7286 --lng -73.9876 \
  --num-panos 10 --mode overlap \
  --output-dir ../data/streetview-intersection
```

This crawls from the intersection eastward, collecting ~10 pano positions. We verify the chain heads toward our existing pano 0 (i.e., longitude increases toward -73.9865).

**Risk:** `crawl_street()` follows links without a direction preference. At the intersection, there could be links to 2nd Ave (north/south) instead of St Marks (east). If so, we'll need to specify the first link pano ID manually or adjust the crawl logic.

### Step 2: Select 3 panos

Pick the first 3 panos heading east from the intersection (consecutive, ~10m apart). This gives ~30m of coverage from the intersection with ~6m overlaps between adjacent splats.

### Step 3: Generate 3 splats

For each of the 3 panos, run:

```bash
cd pipeline && python marble_generator.py \
  --input-dir ../data/streetview-intersection \
  --mode multi-image \
  --pano-index N \
  --model plus \
  --num-positions 1 \
  --text-prompt "A bustling street scene on St. Marks Place in the East Village, Manhattan, NYC. Brick buildings with fire escapes, colorful storefronts, restaurants, and shops line both sides of the narrow street."
```

Same technique as `multi8_p0`: 8 crops at 45° intervals, zoom=4, Auto Layout (no azimuths), `reconstruct_images: true`.

**Cost:** 3 x ~$1.20 = ~$3.60 total, ~5 min per generation.

### Step 4: Register in registry.json

Each generation auto-appends to `data/splats/marble/registry.json`. The new entries will have unique IDs, GPS centers, and headings.

## Files involved

- `pipeline/fetch_streetview.py` — crawl panos from intersection (read-only, just run it)
- `pipeline/marble_generator.py` — generate splats (read-only, just run it 3 times)
- `data/streetview-intersection/metadata.json` — NEW output from step 1
- `data/splats/marble/registry.json` — auto-updated with 3 new entries
- `data/splats/marble/*.spz` — 3 new ~30MB splat files

## Verification

1. After step 1: check metadata.json — confirm panos go eastward (lng increasing toward -73.9865)
2. After each generation: verify on Marble web viewer (URL in output)
3. Load each .spz locally to assess quality
4. Confirm ~6m overlap between adjacent splats at 8m clip radius
