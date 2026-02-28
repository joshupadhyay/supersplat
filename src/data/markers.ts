export interface Marker {
  id: string;
  position: [number, number, number]; // world-space [x, y, z]
  title: string;
  content: string;
  imageUrl?: string;
  linkUrl?: string;
  linkText?: string;
  triggerRadius: number; // distance in world units to show prompt
}

// Placeholder positions — calibrate by navigating the splat and noting camera coords
export const MARKERS: Marker[] = [
  {
    id: "welcome",
    position: [0, 0, 2],
    title: "Welcome to GlobeRun",
    content:
      "You're standing inside a 3D Gaussian splat of St. Marks Place in the East Village, NYC. What you see isn't a photo or a video — it's three overlapping point clouds of colored 3D ellipsoids, reconstructed from Google Street View imagery and stitched together in your browser. Walk around with WASD, look around by dragging, and explore the street in full 3D.",
    triggerRadius: 3,
  },
  {
    id: "what-is-gaussian-splatting",
    position: [3, 0, 6],
    title: "What is Gaussian Splatting?",
    content:
      "Unlike traditional 3D (polygons/meshes) or NeRFs (neural radiance fields), Gaussian splatting represents a scene as millions of tiny 3D ellipsoids — each with its own position, color, opacity, and size. When rendered, these \"splats\" blend together to form a photorealistic scene. Each splat here contains roughly 30MB of Gaussian data. The technique was introduced in 2023 and has rapidly become the fastest way to turn photos into explorable 3D.",
    linkUrl: "https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/",
    linkText: "Original 3DGS paper",
    triggerRadius: 3,
  },
  {
    id: "first-attempt-anysplat",
    position: [-2, 0, 10],
    title: "First Attempt: AnySplat on Modal",
    content:
      "The first approach used AnySplat, a feed-forward model running on Modal's serverless GPUs (NVIDIA A10G). It was fast — 12 images produced 205,000 Gaussians in just 3.3 seconds. But the quality told a different story: the reconstructed world \"quickly disintegrates if you move\" away from the original camera angles. Feed-forward models trade quality for speed, and for a walkable street experience, that trade-off didn't work.",
    linkUrl: "https://huggingface.co/lhjiang/anysplat",
    linkText: "AnySplat on HuggingFace",
    triggerRadius: 3,
  },
  {
    id: "circle-discovery",
    position: [1, 0, 15],
    title: "The Circle Discovery",
    content:
      "A key breakthrough came from how input images are arranged. Early attempts used 4 crops at 90° intervals with 90° FOV — edge-to-edge, zero overlap. The reconstruction model had no shared features between views and hallucinated an entire extra street to fill the gaps. The fix: 8 crops at 45° intervals, giving 50% overlap between adjacent images. This circular arrangement with heavy overlap gives the model consistent anchor features to build coherent geometry around a single point.",
    triggerRadius: 3,
  },
  {
    id: "marble-api",
    position: [-1, 0, 20],
    title: "World Labs Marble API",
    content:
      "The production splats use World Labs' Marble API — a black-box service that takes overlapping photos and returns a high-quality .spz Gaussian splat file. Each of the three splats you're walking through was generated from 8 perspective crops extracted from a single Street View panorama, uploaded to Marble's \"Plus\" model at ~$1.20 per generation. Total cost for this entire street scene: about $3.60.",
    linkUrl: "https://www.worldlabs.ai",
    linkText: "World Labs",
    triggerRadius: 3,
  },
  {
    id: "stitching",
    position: [2, 0, 25],
    title: "Stitching Splats Together",
    content:
      "Each splat is an independent 3D world anchored to real GPS coordinates. Rather than merging them into one giant point cloud, GlobeRun places each splat at its geographic offset in 3D space — like level streaming in a video game. As you walk forward, new splats load and distant ones unload. The three splats here are spaced roughly 10 meters apart with ~6 meters of visual overlap, so the transition between worlds feels seamless.",
    triggerRadius: 3,
  },
  {
    id: "vision",
    position: [0, 0, 30],
    title: "The Vision: Mapping the World",
    content:
      "GlobeRun's goal is to convert Earth's entire road system into explorable 3D Gaussian splat scenes. Starting from Fractal Tech's doorstep in the East Village, one Street View location at a time. The pipeline is fully automated: fetch panorama tiles from Google Maps, extract overlapping crops, generate splats via the Marble API, and store them in Cloudflare R2. The project is open source — anyone can fork it, contribute GPU compute, and help map the world.",
    linkUrl: "https://github.com/joshupadhyay/supersplat",
    linkText: "GitHub repo",
    triggerRadius: 3,
  },
];
