---
tags:
  - project
  - fractal
  - week4
  - gaussian-splatting
  - modal
  - three-js
related:
  - "[[Career]]"
  - "[[Action Plan - Feb-Mar 2026]]"
  - "[[GlobeRun - PRD]]"
status: pitch
created: 2026-02-23
---

# GlobeRun: Turn Earth's Roads Into a 3D World

> A live, open-source project to convert the entire world's road system into explorable 3D gaussian splats — one street at a time.

Inspired by [Internet Road Trip](https://neal.fun/internet-road-trip/) — but instead of flat Street View, it's fully 3D. You can fly out of the car, look around, explore the world as a gaussian splat.

Ideally, the user is in a vehicle (a car), and will navigate the 3D modelled world slowly. You can place yourself in multiple spots, too 

---

## What You're Building

A live web experience where:
1. A "car" drives through the world's road system using Google Street View data
2. As it moves, the system converts each location into a gaussian splat on serverless GPUs
3. Users watch and explore the 3D world in their browser — fly around, look at buildings, zoom in/out
4. Over time, the mapped world grows. Progress bar: **"We have mapped 0.003% of Earth's road system."**
5. It's open source. Anyone can fork it, contribute compute, and help map the world.

**The pitch to the world:** Let's turn Earth into a gaussian splat. Together.

---

## How This Differs From the Original GlobeRun Concept

The original PRD was: "drop a pin → generate one isolated scene → explore it."

Andrew's insight reframed it:

| | Original | Revised |
|---|---------|---------|
| **Scope** | One location at a time | Continuous world along roads |
| **UX** | User picks a spot, waits, explores | Live — a car is always driving, always mapping |
| **Generation** | On-demand per request | Procedural — generate the next block as the car approaches |
| **Social** | Single user | Live viewers, community, shared progress |
| **Goal** | "Explore a place" | "Map the entire world's road system in 3D" |
| **Open source** | Not mentioned | Core to the identity — people contribute compute |
| **Virality** | None | "This guy's trying to map the whole world — we should help" |
| **Demo starting point** | Pre-computed NYC/Paris/Tokyo | Start at Fractal Tech, drive through NYC live |

The key scoping insight from Andrew: **"If you can get it working for one car, one location at a time, that's the whole project."** Everything else (multiple cars, stitching, racing) is layered on top.

---

## What New Technology / Skill You Are Implementing

| Layer | Technology | New? |
|-------|-----------|------|
| **3D Reconstruction** | Gaussian splatting (InstantSplat / gsplat) | Never touched |
| **GPU Compute** | Modal serverless GPUs | Never used |
| **Pose Estimation** | VGGT or MASt3R-SfM (no COLMAP) | Never touched |
| **3D Web Rendering** | Three.js + Spark gaussian splat viewer | Never touched |
| **Street View Pipeline** | Google Street View Tiles API | Never used |
| **Splat Stitching** | Transitioning/compositing between adjacent splats | Nobody's really done this well |
| **Live/Streaming UX** | Real-time progress, live car movement | New pattern |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                      Next.js + Three.js                          │
│                                                                  │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────────┐  │
│  │  Globe/Map   │  │   Spark Viewer    │  │   Live Feed      │  │
│  │  (progress   │  │  (gaussian splat  │  │  (car position,  │  │
│  │   overview)  │  │   renderer)       │  │   chat, stats)   │  │
│  └──────────────┘  └───────────────────┘  └──────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Progress: ████░░░░░░░░░░  0.003% of world roads mapped │    │
│  └──────────────────────────────────────────────────────────┘    │
└────────┬──────────────────────▲──────────────────────────────────┘
         │                      │
         │ next location        │ .spz files (streamed)
         ▼                      │
┌─────────────────────────────────────────────────────────────────┐
│                     PIPELINE (Modal)                              │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────────────┐     │
│  │  Route Planner      │    │  Splat Generator (GPU)      │     │
│  │                     │    │                             │     │
│  │  - Current position │───►│  1. Fetch Street View panos │     │
│  │  - Road graph from  │    │  2. Extract perspective     │     │
│  │    Google/OSM       │    │     crops                   │     │
│  │  - Next N locations │    │  3. InstantSplat or         │     │
│  │    to pre-generate  │    │     VGGT + gsplat           │     │
│  │  - Intersection     │    │  4. Compress .ply → .spz    │     │
│  │    decisions        │    │  5. Store in Volume         │     │
│  └─────────────────────┘    └──────────────┬──────────────┘     │
│                                             │                    │
│                                             ▼                    │
│                                    modal.Volume                  │
│                                    (persistent splat storage)    │
│                                    - Keyed by pano ID / lat,lng  │
│                                    - Never regenerate what       │
│                                      already exists              │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Core Loop

This is the heartbeat of GlobeRun:

```
1. Car is at position P on a road
2. Look ahead: what are the next 3-5 Street View positions along this road?
3. Check storage: have we already generated splats for those positions?
4. For any missing: kick off GPU pipeline (fetch panos → reconstruct → compress → store)
5. As the car reaches position P+1:
   - Load that splat into the viewer
   - Transition/crossfade from previous splat
   - Start pre-generating the next batch
6. Repeat forever
```

Note – we can precompute a lot of tiles, such that we will prefetch the next few tiles before the user gets there. 

The car moves slowly enough that generation stays ahead of movement. If it catches up, the car pauses at an intersection ("choosing a route...") while the pipeline catches up.

**Key insight:** Each splat is a discrete location (one Street View position). The "continuous world" feeling comes from smooth transitions between adjacent splats. Don't try to stitch them into one giant mesh — load/unload them as the car moves, like level streaming in a game engine.

For tiles that are not yet computed, we can explore quick / dynamic generation of a street and see the results.  

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | Next.js | Already know it |
| **Map/Globe** | Google Maps JS API or Mapbox Globe | Overview of progress, car position |
| **3D Viewer** | Spark (sparkjs.dev) | Best Three.js gaussian splat renderer. MIT. Supports multiple splat objects with depth sorting — critical for transitions |
| **3D Reconstruction** | InstantSplat (primary) or VGGT + gsplat | End-to-end, no COLMAP needed |
| **GPU Compute** | Modal (A10G or A100) | Per-second billing. $30/month free. ~$1-2 per splat |
| **Street View** | Google Street View Tiles API | Full equirectangular panos. ~195 free/month at zoom 5 |
| **Road Graph** | Google Street View pano links (or OpenStreetMap via osmnx) | Pano links give you the exact road network Street View covers |
| **Storage** | modal.Volume | Persistent. Keyed by pano ID. Never regenerate existing splats |
| **Compression** | Niantic spz | .ply → .spz (~90% smaller) |
| **Deploy** | Vercel | Free tier |

---

## V1 Scope — Ship by Friday

**Goal: A car drives through NYC streets. Each location is a gaussian splat you can explore in 3D. The world grows as the car moves.**

### Must-Have (V1)
- [ ] A single "car" that follows a route through NYC starting at Fractal Tech
- [ ] Pipeline: Street View pano → gaussian splat → .spz on Modal
- [ ] Spark viewer renders the current splat in-browser
- [ ] WASD + mouse to fly around the current location (fly out of the car, look at buildings)
- [ ] Smooth transition when moving to the next location (crossfade or loading screen)
- [ ] Pre-generate 5-10 locations along a route for the demo (don't rely on live generation)
- [ ] Simple UI: 3D view takes up most of the screen, small map overlay showing position
- [ ] Progress stat: "X locations mapped" or "X meters of road mapped"

### Nice-to-Have (V1.5, if time)
- [ ] Live generation — car moves, pipeline generates ahead in real-time
- [ ] Intersection choices — at a fork, the system picks a random direction (or users vote)
- [ ] Mini-map showing which roads have been mapped vs unmapped
- [ ] Basic chat or viewer count

### What V1 Does NOT Include
- No multiplayer / multiple cars
- No user-contributed compute
- No racing mechanics
- No mobile optimization
- No continuous stitching (discrete location transitions are fine)

---

## Build Order (5-Day Plan)

### Monday (Today): Pipeline Foundation
1. Set up Modal account + CLI
2. Build the Street View fetching function on Modal:
   - Input: pano ID or lat/lng
   - Download full equirectangular pano via Tiles API
   - Extract 8-12 perspective crops at different headings/pitches
   - Store in modal.Volume
3. Test: given coordinates near Fractal Tech, get 20+ images from nearby panos
4. Start exploring InstantSplat / gsplat installation on Modal (CUDA image)

### Tuesday: Gaussian Splatting Working
1. Get InstantSplat (or VGGT + gsplat) running on Modal
2. Feed Street View images in → get .ply out
3. Convert .ply → .spz
4. View result in SuperSplat editor — is the quality usable?
5. If yes: batch-generate 5-10 splats along a NYC route
6. If no: debug image quality, try different extraction strategies, try different models

### Wednesday: Web Viewer + "The Car"
1. Next.js app with Spark viewer — load and render a .spz file
2. WASD + mouse look controls (fly mode)
3. "Car" logic: a route (sequence of pano IDs), advance to next on button press or timer
4. Load next splat when car advances, transition between them
5. Small Google Maps overlay showing car position
6. Wire to pre-generated splats from Tuesday

### Thursday: Polish + Live Pipeline
1. Hook up live generation: car requests next splat, Modal generates it, frontend loads it
2. UI polish: loading states, progress counter, smooth transitions
3. Landing page explaining the project vision ("Help us map the world")
4. Deploy to Vercel
5. Pre-generate more locations along the demo route as buffer

### Friday: Demo Day
1. Final bug fixes
2. Practice demo: start at Fractal Tech, drive through a few blocks of NYC
3. Show the map overview, show the 3D exploration, show the progress counter
4. Talk about the vision: open source, community compute, map the world

---

## Key Technical Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| **InstantSplat won't run on Modal** | Fallback: VGGT + gsplat (separate steps). Test Monday. |
| **Street View images → bad splats** | Try different numbers of crops, zoom levels, reconstruction methods. Quality will vary — that's OK for V1 |
| **Generation too slow for "live"** | Pre-generate the demo route. Live generation is V1.5, not V1. |
| **Transitions between splats look jarring** | Simple crossfade (fade to black briefly). Don't try to solve stitching in week 1. |
| **Street View coverage gaps** | Use pano links to follow only roads that have coverage. Skip gaps. |
| **Splat files too large for browser** | .spz compression (~90% reduction). Reduce gaussian count if needed. |
| **CUDA build issues on Modal** | Start with nvidia/cuda:12.4.0-devel-ubuntu22.04 image. Test early. |

---

## Storage & Scale Estimates

**Per splat (one Street View location):**
- .ply file: ~50-250 MB (raw)
- .spz file: ~5-25 MB (compressed, web-ready)
- Conservative estimate: ~10 MB per location

**Scale projections:**
- 1 city block (~10 locations): ~100 MB
- Manhattan (~50,000 Street View locations): ~500 GB
- Entire world (~100M+ Street View locations): ~1-100 TB

Andrew's take: "I have a feeling it's not that much data." Individual splats are small. The world is big but the data per point is manageable.

**For V1:** Store in modal.Volume. For scale: S3/Glacier. The storage problem is a good problem to have — it means the project is working.

---

## Cost Estimate (V1 / Week 1)

| Resource | Free Tier | Expected Usage | Cost |
|----------|-----------|---------------|------|
| **Modal** | $30/month | ~20-30 training runs (dev + demo route) | $0 |
| **Street View Tiles** | 100K tiles/month | ~30 panos × 64 tiles × 30 attempts = ~58K | $0 |
| **Google Maps JS** | 10K loads/month | ~200 loads | $0 |
| **Vercel** | Free tier | Static + API routes | $0 |
| **Total** | | | **$0** |

---

## The Vision (Beyond Week 1)

### Phase 2: Live + Community
- Multiple cars exploring simultaneously
- Users vote on turns at intersections (like Internet Road Trip)
- Anyone can fork + run their own car, contributing splats to a shared database
- Global leaderboard: "NYC: 12% mapped. Tokyo: 3% mapped."

### Phase 3: Racing
- Pick two mapped locations → generate a race route between them
- Vehicle physics, checkpoints, timer
- Multiplayer racing through gaussian splat worlds

### Phase 4: Open World
- Zoom out from street level to satellite → combined view
- Time travel: compare splats generated from different Street View capture dates
- AI-generated content layered on top (weather, time of day, NPCs)

---

## What This Demonstrates

- **"I built a pipeline that converts Google Street View into explorable 3D worlds"** — novel end-to-end system
- **"I deployed GPU-accelerated ML on serverless infrastructure"** — gaussian splatting on Modal
- **"I assembled cutting-edge research into a working product in 5 days"** — VGGT (CVPR 2025 Best Paper), InstantSplat, Spark
- **"I designed for scale from day one"** — persistent storage, incremental generation, open-source-ready architecture
- **"I navigated an entirely unfamiliar domain"** — zero 3D/GPU/graphics experience going in

---

## Key Resources

| Resource | URL |
|----------|-----|
| Internet Road Trip (inspiration) | neal.fun/internet-road-trip |
| InstantSplat | github.com/NVlabs/InstantSplat |
| gsplat | github.com/nerfstudio-project/gsplat |
| VGGT | github.com/facebookresearch/vggt |
| AnySplat | github.com/InternRobotics/AnySplat |
| MASt3R-SfM | github.com/naver/mast3r |
| Spark (web viewer) | sparkjs.dev |
| SuperSplat (editor) | superspl.at/editor |
| spz compression | github.com/nianticlabs/spz |
| streetlevel (pano fetcher) | github.com/sk-zk/streetlevel |
| Street View Tiles API | developers.google.com/maps/documentation/tile/streetview |
| Modal docs | modal.com/docs |

---

## The Pitch (One Sentence)

"I'm building an open-source project to turn Earth's entire road system into explorable 3D gaussian splats — starting with NYC, one Street View location at a time, using serverless GPUs and cutting-edge 3D reconstruction that I've never touched before."
