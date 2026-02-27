# Marble API — Multi-Image Prompting Guide

References:
- https://docs.worldlabs.ai/marble/create/prompt-guides/multi-image-prompt
- https://docs.worldlabs.ai/api (Quickstart with code examples)
- https://docs.worldlabs.ai/api/reference/openapi (OpenAPI spec)

## Two Modes

### Direction Control (`reconstruct_images: false`, default)
- Up to **4 images**
- You manually assign azimuth (Front/Back/Left/Right)
- "Images without overlap allow the marble models to creatively fill in the spaces between views"
- Best for connecting disparate environments

### Auto Layout (`reconstruct_images: true`)
- Up to **8 images**
- System automatically determines relative positioning from image content overlap
- Best for **reconstructing existing spaces** (our use case)
- **Do NOT provide azimuth values** — see "Critical: Azimuth + reconstruct_images conflict" below

## Azimuth Semantics

Azimuth is **scene-relative**, NOT compass heading (source: [API Quickstart](https://docs.worldlabs.ai/api)):

| Value | Direction |
|-------|-----------|
| `0°`  | Front     |
| `90°` | Right     |
| `180°`| Back      |
| `270°`| Left      |

**There is no concept of geographic north.** Azimuth=0 means "front of the generated world."

### Critical: Azimuth + `reconstruct_images` conflict

Providing explicit azimuth values while setting `reconstruct_images: true` causes the API to **silently fall back to Direction Control mode** (`reconstruct_images: false` in the response). This is because:
- Auto Layout = "system determines positioning automatically"
- Explicit azimuths = "user determines positioning manually"
- These are contradictory; the API resolves by ignoring `reconstruct_images`

**Rule: For Auto Layout mode, omit azimuth fields entirely.**

Source: Observed behavior — we sent `reconstruct_images: true` + azimuths, API response stored `reconstruct_images: false`. Confirmed via [OpenAPI spec](https://docs.worldlabs.ai/api/reference/openapi) that both fields are optional. No community reports found, but the Quickstart docs never show both together.

## Best Practices

### Overlap is critical
- "Include visual elements that appear in multiple images"
- "Some overlap between images improves results"
- **Our strategy**: 8 crops at 45° heading intervals with 90° FOV = **50% overlap** between adjacent crops

### Image requirements
- All images must share the **same aspect ratio and resolution**
- Minimum 1024x1024 for good results
- Sharp, well-lit, consistent lighting across all images

### Spatial planning: parallax matters

**Single position** (8 crops at 45° intervals): Gives angular coverage and overlap, but zero depth information — functionally a panorama. Produces correct geometry but lower detail.

**Two nearby positions** (4 crops each at 90° intervals, ~10m apart): Gives real stereo parallax — the model can triangulate depth. Produces higher detail but risks hallucination if baseline is too large (~20m) or overlap is insufficient.

**Recommendation**: Use 2 adjacent positions with matching headings for best detail. Keep baseline short (5-15m) to maximize shared visual content between position pairs.

Source: Comparative testing Feb 27 2026 — single-position `multi8_p0` vs. two-position `multi8_p0_1`. Multi-view stereo literature confirms parallax provides fundamentally different geometric constraints than angular-only coverage.

### Resolution: use zoom=4 for Plus

Perspective crops from equirectangular panos lose resolution at edges/corners:

| Position | Zoom=3 (source px / output px) | Zoom=4 |
|----------|-------------------------------|--------|
| Center   | 1.27 (sharp)                  | 2.55   |
| Edge     | 0.64 (upscaled 1.6x)          | 1.27 (sharp) |
| Corner   | 0.42 (upscaled 2.4x)          | 0.85 (acceptable) |

- **Zoom=3** (4096×2048, 32 tiles): OK for Mini ($0.12 draft quality)
- **Zoom=4** (8192×4096, 128 tiles): Use for Plus ($1.20) — sharper edges carry geometric context

## API Payload (Auto Layout — recommended)

```json
{
  "display_name": "my-world",
  "model": "Marble 0.1-plus",
  "world_prompt": {
    "type": "multi-image",
    "reconstruct_images": true,
    "multi_image_prompt": [
      {
        "content": {
          "source": "media_asset",
          "media_asset_id": "uploaded-asset-id"
        }
      }
    ]
  }
}
```

Note: No `azimuth` field — Auto Layout determines positioning from image overlap.

### API Payload (Direction Control)

```json
{
  "display_name": "my-world",
  "model": "Marble 0.1-plus",
  "world_prompt": {
    "type": "multi-image",
    "multi_image_prompt": [
      {
        "azimuth": 0,
        "content": { "source": "media_asset", "media_asset_id": "front-image-id" }
      },
      {
        "azimuth": 180,
        "content": { "source": "media_asset", "media_asset_id": "back-image-id" }
      }
    ]
  }
}
```

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| `type` | Yes | `"multi-image"` |
| `multi_image_prompt` | Yes | Array of image objects with content (+ optional azimuth) |
| `reconstruct_images` | No | Default `false`. Set `true` for Auto Layout (up to 8 imgs). **Omit azimuths when true.** |
| `text_prompt` | No | Auto-generated if omitted |
| `azimuth` | No | Scene-relative degrees (0=front, 90=right). **Only for Direction Control.** |
| `content.source` | Yes | `"media_asset"`, `"uri"`, or `"data_base64"` |

### Content upload options
- **media_asset**: Pre-upload via `POST /marble/v1/media-assets:prepare_upload`, then upload to signed URL
- **uri**: Publicly accessible URL
- **data_base64**: Inline base64 (max 10MB)

## Our Crop Strategies (Street View Panos)

### Strategy A: Single position, 8 crops at 45° (`--num-positions 1`)

```
8 crops from 1 pano at 45° intervals, FOV=90°, 1024×1024:
  +0°, +45°, +90°, +135°, +180°, +225°, +270°, +315°
```

50% overlap between adjacent crops. No parallax. Correct geometry, lower detail.

### Strategy B: Two positions, 4 crops each at 90° (`--num-positions 2`)

```
4 crops from pano A + 4 crops from pano B (~10m apart), FOV=90°, 1024×1024:
  Each pano: +0°, +90°, +180°, +270°
  Same headings from both positions → stereo pairs with parallax
```

Real depth information from stereo baseline. Higher detail, but needs short baseline (5-15m) to avoid hallucination. No intra-position overlap (90° intervals = edge-to-edge), but cross-position overlap from shared visual content at similar headings.

### Common settings

- zoom=4 for Plus, zoom=3 for Mini
- No azimuths sent — Auto Layout mode
- `reconstruct_images: true` (though API still stores `false` — see lessons)

## Lessons Learned

### What went wrong (stmarks-multi-0-2-plus, Feb 26 2026)
1. **`reconstruct_images` silently overridden** — sending azimuths + `reconstruct_images: true` caused API to fall back to Direction Control mode
2. **Wrong azimuth convention** — passed compass headings (118°, 208°...) instead of scene-relative (0°=front). Marble has no concept of geographic north.
3. **Zero overlap**: 4 crops at 90° intervals with 90° FOV = edge-to-edge, no shared visual elements
4. **Duplicate azimuths**: 8 images from 2 positions, only 4 unique azimuth values
5. **Two positions ~20m apart**: Confuses the model vs. varied angles from one position
6. **Soft edges at zoom=3**: Perspective projection upscales edges 1.6x, corners 2.4x

### Fixes applied
- Omit azimuths entirely for Auto Layout mode
- zoom=4 for Plus-tier generations

### Parallax vs. angular coverage (Feb 27 2026)

| | `multi8_p0` (1 position) | `multi8_p0_1` (2 positions) |
|---|---|---|
| Crops | 8 at 45° intervals | 4+4 at 90° intervals |
| Overlap | 50% (adjacent crops) | Cross-position (same heading, ~10m apart) |
| Parallax | None | ~10m stereo baseline |
| Detail | Lower | Higher |
| Accuracy | Correct layout | TBD (evaluating) |

**Key insight**: 8 crops from one position is functionally a panorama — the model has only monocular depth cues. Two positions give triangulation data, producing fundamentally better geometric information. This aligns with multi-view stereo literature and Marble's own video docs (which highlight SLAM/SfM from parallax).

**Previous 20m baseline hallucinated an extra street** — likely too much scene difference between positions. 10m baseline should preserve more shared content.

## Other API Endpoints

```
POST /marble/v1/media-assets:prepare_upload   — Get signed upload URL
POST /marble/v1/worlds:generate               — Start world generation
GET  /marble/v1/operations/{operation_id}      — Poll generation status
POST /marble/v1/worlds:list                    — List all worlds (POST, not GET)
GET  /marble/v1/worlds/{world_id}              — Get world details
```

Auth: `WLT-Api-Key` header with API key from https://marble.worldlabs.ai/settings
