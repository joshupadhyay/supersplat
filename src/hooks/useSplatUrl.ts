const R2_BASE = process.env.BUN_PUBLIC_R2_URL ?? "";
const DEFAULT_SPLAT_URL = `${R2_BASE}/multi8_p0.spz`;

export function useSplatUrl(): string {
  if (typeof window === "undefined") return DEFAULT_SPLAT_URL;

  const params = new URLSearchParams(window.location.search);
  const splatParam = params.get("splat");
  if (splatParam) {
    return splatParam.startsWith("http") ? splatParam : `${R2_BASE}/${splatParam}`;
  }
  return DEFAULT_SPLAT_URL;
}
