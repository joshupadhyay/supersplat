import { useEffect, useRef } from "react";
import L from "leaflet";

// Inline Leaflet CSS to avoid needing a separate CSS import
const LEAFLET_CSS =
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

interface MiniMapProps {
  /** Center of the splat in real-world coords */
  center: { lat: number; lng: number };
  /** Street heading in degrees from north, clockwise */
  heading: number;
  /** Camera position in Three.js world space */
  cameraPos: { x: number; z: number };
  /** Meters per local unit (calibrated from collider mesh) */
  scale?: number;
}

/** Convert camera local (x, z) to lat/lng given heading and scale. */
function cameraToLatLng(
  center: { lat: number; lng: number },
  heading: number,
  cx: number,
  cz: number,
  scale: number,
): [number, number] {
  const theta = (heading * Math.PI) / 180;

  // Camera +Z = forward along heading, +X = right of heading
  const eastM = (cz * Math.sin(theta) + cx * Math.cos(theta)) * scale;
  const northM = (cz * Math.cos(theta) - cx * Math.sin(theta)) * scale;

  const dLat = northM / 111320;
  const dLng = eastM / (111320 * Math.cos((center.lat * Math.PI) / 180));

  return [center.lat + dLat, center.lng + dLng];
}

export function MiniMap({
  center,
  heading,
  cameraPos,
  scale = 1.25,
}: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const headingLineRef = useRef<L.Polyline | null>(null);
  const cssLoadedRef = useRef(false);

  // Load Leaflet CSS once
  useEffect(() => {
    if (cssLoadedRef.current) return;
    cssLoadedRef.current = true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 19,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 22,
    }).addTo(map);

    // Pano center marker
    L.circleMarker([center.lat, center.lng], {
      radius: 4,
      color: "#666",
      fillColor: "#888",
      fillOpacity: 0.6,
      weight: 1,
    }).addTo(map);

    // Camera position marker
    const marker = L.circleMarker([center.lat, center.lng], {
      radius: 6,
      color: "#3b82f6",
      fillColor: "#60a5fa",
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);

    // Heading indicator line from camera position
    const headingLine = L.polyline(
      [
        [center.lat, center.lng],
        [center.lat, center.lng],
      ],
      { color: "#60a5fa", weight: 2, opacity: 0.7 },
    ).addTo(map);

    mapRef.current = map;
    markerRef.current = marker;
    headingLineRef.current = headingLine;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      headingLineRef.current = null;
    };
  }, [center.lat, center.lng]);

  // Update marker position when camera moves
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return;

    const [lat, lng] = cameraToLatLng(
      center,
      heading,
      cameraPos.x,
      cameraPos.z,
      scale,
    );

    markerRef.current.setLatLng([lat, lng]);

    // Short heading line showing which way the camera faces
    // (We'd need camera rotation for true heading, but for now
    // just show the dot position)
    const lineLen = 0.00003; // ~3m
    const theta = (heading * Math.PI) / 180;
    headingLineRef.current?.setLatLngs([
      [lat, lng],
      [lat + lineLen * Math.cos(theta), lng + lineLen * Math.sin(theta)],
    ]);

    // Keep map centered on camera
    mapRef.current.setView([lat, lng], mapRef.current.getZoom(), {
      animate: false,
    });
  }, [center, heading, cameraPos.x, cameraPos.z, scale]);

  const distFromOrigin = Math.sqrt(cameraPos.x ** 2 + cameraPos.z ** 2);
  const distMeters = (distFromOrigin * scale).toFixed(1);

  return (
    <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 50 }}>
      <div
        style={{
          color: "#94a3b8",
          fontSize: 12,
          fontFamily: "monospace",
          textAlign: "center",
          marginBottom: 4,
          textShadow: "0 1px 3px rgba(0,0,0,0.8)",
        }}
      >
        {distMeters}m from center ({distFromOrigin.toFixed(1)} units)
      </div>
      <div
        ref={containerRef}
        style={{
          width: 220,
          height: 220,
          borderRadius: 12,
          overflow: "hidden",
          border: "2px solid rgba(255,255,255,0.15)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}
