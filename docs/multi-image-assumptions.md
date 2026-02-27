# Multi-Image World Generation — Assumptions to Verify

## What we changed (vs. the failed `stmarks-multi-0-2-plus`)

### Change 1: Single pano position instead of two
- **Before**: 4 crops from pano 0 + 4 crops from pano 2 (~20m apart)
- **After**: 8 crops from pano 0 only
- **Assumption**: World Labs docs say "images captured in close proximity with different viewing angles work best." Same position, different angles should be better than different positions, same angles.

### Change 2: 45° heading intervals instead of 90°
- **Before**: 4 headings per position at 90° intervals → zero overlap with 90° FOV
- **After**: 8 headings at 45° intervals → 50% overlap between adjacent crops
- **Assumption**: Overlap provides shared visual elements for the reconstruction algorithm. Docs explicitly say "include visual elements that appear in multiple images" and "some overlap between images improves results."

### Change 3: 8 unique azimuths instead of 4 duplicated
- **Before**: Azimuths 118°, 208°, 298°, 28° — each used twice (once per pano position)
- **After**: Azimuths 118°, 163°, 208°, 253°, 298°, 343°, 28°, 73° — all unique
- **Assumption**: Duplicate azimuths in Direction Control or Auto Layout confuse the spatial model about where to place views. Unique values give unambiguous directional information.

### Change 4: `reconstruct_images: true` (Auto Layout mode)
- **Before**: Code sent `true` but API response showed `false` — unclear if it was a payload structure bug or API-side override
- **After**: Same code path (`generate_world_multi_image` at line 183 sets it). No structural change here.
- **RISK**: If the API still ignores `reconstruct_images: true`, we're in Direction Control mode with 8 images (max is 4). Need to verify this after generation.

## Unverified claims / risks

1. **[TRAINING] 90° FOV with 45° step = 50% overlap**: This is geometric math, not an API claim. FOV=90° means each crop covers 90° of horizontal space. At 45° steps, adjacent crops share 45° of content = 50% overlap. Should be correct.

2. **[INFERRED] Auto Layout handles overlapping perspective crops well**: The docs describe Auto Layout as "best for reconstructing existing spaces" and say it "automatically determines relative positioning." We're assuming it can match features across overlapping perspective crops from an equirectangular source. This is plausible but not explicitly documented.

3. **[INFERRED] Equirectangular → perspective crops preserve enough quality**: Our source pano is 16384×8192. At zoom=3 we stitch to 4096×2048. Cropping to 1024×1024 perspective views from a 4096×2048 equirect may lose resolution due to the projection math. The center of each crop is sharp, edges may stretch.

4. **[VERIFIED] `reconstruct_images` field exists in the API schema**: Confirmed via OpenAPI spec — it's a boolean under `world_prompt`, default false.

5. **[UNKNOWN] Why the previous generation stored `reconstruct_images: false`**: Could be a bug in our payload structure, or the API silently rejects it for some input types. This is the biggest remaining risk.
