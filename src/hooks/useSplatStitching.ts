import { useState, useEffect, useCallback, useRef } from "react";
import { latLngToLocal } from "../lib/coords";

interface World {
  id: string;
  file: string;
  center: { lat: number; lng: number };
  heading: number;
  note?: string;
}

export interface SplatSlot {
  id: string;
  url: string;
  offset: { x: number; y: number; z: number };
  shouldLoad: boolean;
}

export interface SplatStitching {
  /** All computed slots (one per world) */
  slots: SplatSlot[];
  /** Index of the world nearest to the camera */
  activeIndex: number;
  /** Origin world's center (for minimap) */
  center: { lat: number; lng: number };
  /** Origin world's heading (for minimap) */
  heading: number;
  /** All worlds (for minimap dots) */
  worlds: World[];
  /** Whether registry is still loading */
  loading: boolean;
  /** Call from useFrame with camera position to update which neighbors load */
  updateCamera: (x: number, z: number) => void;
}

/** Distance (in local units) at which to start loading a neighbor splat */
const LOAD_RADIUS = 999; // Force-load all splats for calibration

export function useSplatStitching(): SplatStitching {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);
  const [shouldLoad, setShouldLoad] = useState<Set<number>>(new Set([0]));
  const [activeIndex, setActiveIndex] = useState(0);

  // Computed offsets (stable after worlds load)
  const offsetsRef = useRef<Array<{ x: number; z: number }>>([]);

  useEffect(() => {
    fetch("/api/registry")
      .then((res) => res.json())
      .then((data: { worlds: World[] }) => {
        const w = data.worlds ?? [];
        setWorlds(w);
        if (w.length > 0) {
          const origin = w[0]!;
          offsetsRef.current = w.map((world) =>
            latLngToLocal(
              origin.center.lat,
              origin.center.lng,
              origin.heading,
              world.center.lat,
              world.center.lng,
            ),
          );
        }
      })
      .catch(() => setWorlds([]))
      .finally(() => setLoading(false));
  }, []);

  const updateCamera = useCallback(
    (cx: number, cz: number) => {
      const offsets = offsetsRef.current;
      if (offsets.length === 0) return;

      // Find nearest world
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < offsets.length; i++) {
        const off = offsets[i]!;
        const dx = cx - off.x;
        const dz = cz - off.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      // Determine which worlds should be loaded based on camera proximity
      const toLoad = new Set<number>();
      toLoad.add(0); // Always keep world 0 loaded (it's at origin)
      toLoad.add(nearestIdx);

      for (let i = 0; i < offsets.length; i++) {
        const off = offsets[i]!;
        const dx = cx - off.x;
        const dz = cz - off.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < LOAD_RADIUS) {
          toLoad.add(i);
        }
      }

      setActiveIndex(nearestIdx);
      setShouldLoad((prev) => {
        // Only update if the set actually changed
        if (prev.size === toLoad.size && [...toLoad].every((v) => prev.has(v)))
          return prev;
        return toLoad;
      });
    },
    [],
  );

  const R2_BASE = process.env.BUN_PUBLIC_R2_URL ?? "";
  const offsets = offsetsRef.current;

  const slots: SplatSlot[] = worlds.map((world, i) => ({
    id: world.id,
    url: `${R2_BASE}/${world.file}`,
    offset: {
      x: offsets[i]?.x ?? 0,
      y: 0,
      z: offsets[i]?.z ?? 0,
    },
    shouldLoad: shouldLoad.has(i),
  }));

  const originWorld = worlds[0];

  return {
    slots,
    activeIndex,
    center: originWorld?.center ?? { lat: 0, lng: 0 },
    heading: originWorld?.heading ?? 0,
    worlds,
    loading,
    updateCamera,
  };
}
