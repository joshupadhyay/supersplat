# GlobeRun

Using `bun init` with shadcn + tailwind css.

[Read the whole PRD.](PRD- GlobeRun.md).

**Goal: A car drives through NYC streets. Each location is a gaussian splat you can explore in 3D. The world grows as the car moves.**

## Build Order (5-Day Plan)

### Monday (Today): Pipeline Foundation
1. Set up Modal account + CLI
2. Build the Street View fetching function on Modal:
   - Input: pano ID or lat/lng
   - Download full equirectangular pano via Tiles API
   - Extract 8-12 perspective crops at different headings/pitches
   - Store in .Volume
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


## Note on Modal

⏺ That's expected — Modal doesn't use an API key in your project. It uses CLI-based authentication stored in your home directory.                              
                                                                                                                                                               
  When you run modal setup (or modal token set), it saves your credentials to ~/.modal.toml. The Modal SDK picks them up automatically from there — no .env or 
  explicit key needed in your code.                                                                                                                            
                                                                                                                                                               
  To check if you're already authenticated:                                                                                                                    
                                                                                                                                                               
  modal token list

  If you haven't set it up yet:

  pip install modal   # or: pipx install modal
  modal setup         # opens browser for auth

