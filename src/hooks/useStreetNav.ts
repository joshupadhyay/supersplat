import { useState, useEffect, useCallback } from "react";

interface World {
  id: string;
  file: string;
  secondFile?: string;
  center: { lat: number; lng: number };
  note?: string;
}

export interface StreetNav {
  worlds: World[];
  currentIndex: number;
  currentUrl: string;
  secondUrl?: string;
  note?: string;
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

  const currentWorld = worlds[currentIndex];
  const currentUrl = currentWorld ? `/splats/${currentWorld.file}` : "";
  const secondUrl = currentWorld?.secondFile
    ? `/splats/${currentWorld.secondFile}`
    : undefined;

  return {
    worlds,
    currentIndex,
    currentUrl,
    secondUrl,
    note: currentWorld?.note,
    next,
    prev,
    hasNext: currentIndex < worlds.length - 1,
    hasPrev: currentIndex > 0,
    loading,
  };
}
