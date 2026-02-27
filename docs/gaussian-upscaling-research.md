# Gaussian Splat Upscaling & Quality Improvement Research

*Researched 2026-02-27*

## Context

We generate `.spz` gaussian splats via the Marble API (World Labs) from Street View panorama crops (1024x1024). Goal: improve splat visual quality, ideally using reference images.

---

## Approach 1: Direct Splat Super-Resolution

### SuperGaussian (Adobe Research, ECCV 2024) — Best Candidate

**What it does**: Takes an existing low-res 3D model (Gaussian Splat, NeRF, mesh), renders a video around it, upsamples the video with VideoGigaGAN, then re-optimizes a new high-res Gaussian Splat from the upsampled frames.

| Aspect | Detail |
|---|---|
| Needs reference images? | **No** — only the existing 3D model |
| Input/Output | `.pkl` format (xyz+rgb). Needs SPZ→PLY→pkl conversion |
| Quality | Blender synthetic x4: PSNR 28.44, SSIM 0.923, LPIPS 0.067 |
| Compute | ~141 seconds per scene on A6000 |
| Code | [github.com/adobe-research/SuperGaussian](https://github.com/adobe-research/SuperGaussian) |
| Docker | `yshen47/adobe_supergaussian:latest` |

**Caveats**:
- Designed for low-poly/low-res inputs (64x64 renders from text-to-3D). Marble outputs are already ~30MB with reasonable quality — upscaling may add hallucinated detail rather than recovering real scene info.
- Format friction: SPZ → PLY → pkl conversion needed. [3dgsconverter](https://github.com/francescofugazzi/3dgsconverter) handles SPZ→PLY.

### Other Methods (All Require Training Images — Not Applicable to Post-Marble Refinement)

| Method | Venue | What It Does | Code? | Needs Poses? |
|---|---|---|---|---|
| **SRGS** | arXiv 2024 | Trains from scratch using LR images + SwinIR SR guidance | [Yes](https://github.com/XiangFeng66/SRGS) | Yes |
| **SplatSuRe** | arXiv 2025 | Selective SR on undersampled regions during training | [Yes](https://github.com/pranav-asthana/SplatSuRe) | Yes |
| **S2Gaussian** | CVPR 2025 | Sparse low-res → high-res via densification + pseudo views | No (coming soon) | Yes |
| **SuperGS** | arXiv 2024 | Coarse-to-fine latent feature field upsampling | No (empty repo) | Yes |
| **Upscale3DGS** | ICCV 2025 | 2D render upscaling only (speed optimization, not quality) | Partial (viewer only) | N/A |

---

## Approach 2: Upscaling Input Images Before Marble

### Best Available Models

| Model | Type | Cost | Speed | Quality | Best For |
|---|---|---|---|---|---|
| **Real-ESRGAN** | GAN | $0.0025/img (Replicate) or free locally | ~6s/img | Good | General real-world, outdoor |
| **SUPIR** | Diffusion | Free locally (12GB+ VRAM) | ~70s/img | Best | Semantic-aware, outdoor |
| **Topaz Gigapixel** | Commercial | $99/yr | Fast | Best-in-class | Landscapes, fine detail |
| **StableSR** | Diffusion | Free locally | ~30s/img | Good | Used in SplatSuRe paper |

### Verdict: Likely Counterproductive

**The research consensus is clear: naive per-image upscaling before 3D reconstruction is a known anti-pattern.**

Why:
1. **View-inconsistent hallucination**: Independent per-image SR produces different hallucinated high-frequency details per view. Multi-view 3D reconstruction averages these out → blurry splats or floaters.
2. **Marble likely downsamples internally**: Docs recommend "1024px on the long side" — suggesting this is near their internal processing resolution.
3. **Your crops already meet the recommended resolution** (1024x1024).

Papers that validate this problem:
- S2Gaussian (CVPR 2025): invented 2-stage blur-free inconsistency modeling to fix this
- SplatSuRe (2025): "Single-image super-resolution operates independently on each view and frequently introduces view-dependent hallucinated textures"
- 3D-GSR (2024): built multi-view SR adapter specifically to enforce cross-view consistency

### The $2.50 A/B Test

If you want to settle this empirically:
1. Take your best 8-crop set
2. Upscale all 8 to 2048x2048 with Real-ESRGAN via Replicate (~$0.04)
3. Send both original and upscaled sets to Marble Plus (~$2.40 for both)
4. Compare the resulting splats side by side

If Marble downsamples to 1024 internally → zero difference → question settled.

---

## Approach 3: Post-Hoc Splat Refinement

### GSFixer (2025) — Most Promising for Reference-Guided Repair

**What it does**: Takes an existing 3DGS with artifacts + sparse reference views. Uses fine-tuned DiT video diffusion model (CogVideoX-5b) to restore artifact regions. Leverages 3D geometric features (VGGT) and 2D semantic features (DINOv2) from reference views.

| Aspect | Detail |
|---|---|
| Accepts reference images? | **Yes** — this is its core feature |
| Code | [github.com/GVCLab/GSFixer](https://github.com/GVCLab/GSFixer) |
| Compute | H100/H20 class (40GB+ VRAM) |
| Blocker | **Requires camera poses for reference views** |

### GSFix3D (2025) — Related

[github.com/GSFix3D/GSFix3D](https://github.com/GSFix3D/GSFix3D) — Similar diffusion-guided novel view repair. Apache 2.0 license.

### Geometric Cleanup (No ML, No Poses Required)

The simplest and most immediately practical approach:

```bash
# Clip gaussians outside a sphere of radius R
npx @playcanvas/splat-transform input.spz output.spz --filter-sphere 0,0,0,R

# Remove low-opacity gaussians
npx @playcanvas/splat-transform input.spz output.spz --filter-value opacity gt 0.1

# Statistical outlier removal
3dgsconverter -i input.spz -o output.spz --sor_intensity medium

# Remove NaN/Inf values
npx @playcanvas/splat-transform input.spz output.spz --filter-nan
```

### Re-Training from PLY Initialization

Convert SPZ → PLY, load as initialization in nerfstudio/splatfacto, re-train with your reference images:
```bash
ns-train nerfgs --pipeline.model.ply-file-path converted.ply --data your_images/
```
**Blocker**: Requires camera poses. Marble doesn't return them. Options:
- COLMAP (failed previously for SV data due to insufficient overlap)
- DUSt3R / MASt3R (designed for sparse unposed images — untested on SV crops)

### SPZ Python Library (Niantic)

Full programmatic access to splat internals:

```python
import spz
import numpy as np

cloud = spz.load_spz("input.spz")
positions = cloud.positions.reshape(-1, 3)
colors = cloud.colors.reshape(-1, 3)
scales = cloud.scales.reshape(-1, 3)
rotations = cloud.rotations.reshape(-1, 4)
alphas = cloud.alphas

# Modify, filter, then save
spz.save_spz(cloud, spz.PackOptions(), "output.spz")
```

Available attributes: `positions`, `scales`, `rotations`, `alphas`, `colors`, `sh`, `sh_degree`, `antialiased`, `num_points`.

---

## The Camera Pose Blocker

Almost every ML-based refinement method requires camera poses. Marble is a black box that doesn't return them.

**Workarounds**:
- **DUSt3R / MASt3R** — designed for sparse unposed images (unlike COLMAP). [Untested on SV crops]
- **Focus on Tier 1 geometric cleanup** — no poses needed
- **Improve Marble inputs** — higher-quality source data beats post-processing

---

## Recommended Action Plan

### Tier 1: Do Now (free, no GPU, no poses)
1. Sphere/box clipping with `splat-transform` to remove horizon tails
2. Statistical outlier removal with `3dgsconverter`
3. Opacity filtering to remove near-transparent floaters

### Tier 2: Cheap Experiment ($2.50)
4. A/B test: Real-ESRGAN upscaled crops vs originals through Marble Plus

### Tier 3: Medium Effort (requires GPU)
5. SuperGaussian on Modal (SPZ→PLY→pkl, ~141s on A6000)
6. Estimate poses via MASt3R, then re-train with nerfstudio splatfacto

### Tier 4: Research Frontier (H100 GPU)
7. GSFixer with reference images (if poses can be estimated)

---

## Key Sources

- [SuperGaussian (Adobe, ECCV 2024)](https://github.com/adobe-research/SuperGaussian)
- [GSFixer (2025)](https://github.com/GVCLab/GSFixer)
- [GSFix3D (2025)](https://github.com/GSFix3D/GSFix3D)
- [SRGS](https://github.com/XiangFeng66/SRGS) | [SplatSuRe](https://github.com/pranav-asthana/SplatSuRe)
- [S2Gaussian (CVPR 2025)](https://arxiv.org/abs/2503.04314)
- [3dgsconverter](https://github.com/francescofugazzi/3dgsconverter)
- [PlayCanvas splat-transform](https://github.com/playcanvas/splat-transform)
- [Niantic SPZ Library](https://github.com/nianticlabs/spz)
- [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | [Replicate](https://replicate.com/nightmareai/real-esrgan)
- [SUPIR](https://github.com/Fanghua-Yu/SUPIR)
- [Nerfstudio Splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html)
- [DUSt3R](https://github.com/naver/dust3r) | [MASt3R](https://github.com/naver/mast3r)
