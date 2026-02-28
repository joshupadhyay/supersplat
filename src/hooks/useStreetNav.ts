import { useState, useEffect, useCallback } from "react";

interface World {
  id: string;
  file: string;
  secondFile?: string;
  center: { lat: number; lng: number };
  heading: number;
  note?: string;
}

export interface StreetNav {
  worlds: World[];
  currentIndex: number;
  currentUrl: string;
  secondUrl?: string;
  note?: string;
  heading: number;
  center: { lat: number; lng: number };
  next: () => void;
  prev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  loading: boolean;
}

export function useStreetNav(): StreetNav {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/registry")
      .then((res) => res.json())
      .then((data: { worlds: World[] }) => {
        setWorlds(data.worlds ?? []);
      })
      .catch(() => setWorlds([]))
      .finally(() => setLoading(false));
  }, []);

  const next = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, worlds.length - 1));
  }, [worlds.length]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const R2_BASE = process.env.BUN_PUBLIC_R2_URL ?? "";
  const currentWorld = worlds[currentIndex];
  const currentUrl = currentWorld ? `${R2_BASE}/${currentWorld.file}` : "";
  const secondUrl = currentWorld?.secondFile
    ? `${R2_BASE}/${currentWorld.secondFile}`
    : undefined;

  return {
    worlds,
    currentIndex,
    currentUrl,
    secondUrl,
    note: currentWorld?.note,
    heading: currentWorld?.heading ?? 0,
    center: currentWorld?.center ?? { lat: 0, lng: 0 },
    next,
    prev,
    hasNext: currentIndex < worlds.length - 1,
    hasPrev: currentIndex > 0,
    loading,
  };
}
