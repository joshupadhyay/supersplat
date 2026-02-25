const DEFAULT_SPLAT_URL = "/splats/scene-sequence.ply";

export function useSplatUrl(): string {
  if (typeof window === "undefined") return DEFAULT_SPLAT_URL;

  const params = new URLSearchParams(window.location.search);
  return params.get("splat") || DEFAULT_SPLAT_URL;
}
