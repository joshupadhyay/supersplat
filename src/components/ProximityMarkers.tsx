import { useRef, useState, useEffect, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Vector3 } from "three";
import type { Marker } from "../data/markers";
import type CameraControlsImpl from "camera-controls";

interface ProximityMarkersProps {
  markers: Marker[];
  controlsRef: React.RefObject<CameraControlsImpl | null>;
  paused: boolean;
  onActiveMarkerChange: (marker: Marker | null) => void;
}

export function ProximityMarkers({
  markers,
  controlsRef,
  paused,
  onActiveMarkerChange,
}: ProximityMarkersProps) {
  const [nearestId, setNearestId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cameraPosVec = useRef(new Vector3());
  const markerPosVec = useRef(new Vector3());

  // Check camera proximity to markers each frame
  useFrame(() => {
    if (paused || expandedId) return;
    const controls = controlsRef.current;
    if (!controls) return;

    controls.getPosition(cameraPosVec.current);

    let closest: string | null = null;
    let closestDist = Infinity;

    for (const marker of markers) {
      markerPosVec.current.set(...marker.position);
      const dist = cameraPosVec.current.distanceTo(markerPosVec.current);
      if (dist < marker.triggerRadius && dist < closestDist) {
        closest = marker.id;
        closestDist = dist;
      }
    }

    setNearestId(closest);
  });

  const handleExpand = useCallback(
    (marker: Marker) => {
      setExpandedId(marker.id);
      onActiveMarkerChange(marker);
    },
    [onActiveMarkerChange],
  );

  const handleCollapse = useCallback(() => {
    setExpandedId(null);
    onActiveMarkerChange(null);
  }, [onActiveMarkerChange]);

  // Listen for X key to expand/collapse
  useEffect(() => {
    if (paused) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code !== "KeyX") return;

      if (expandedId) {
        handleCollapse();
      } else if (nearestId) {
        const marker = markers.find((m) => m.id === nearestId);
        if (marker) handleExpand(marker);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paused, expandedId, nearestId, markers, handleExpand, handleCollapse]);

  return (
    <>
      {markers.map((marker) => {
        const isNearest = marker.id === nearestId;
        const isExpanded = marker.id === expandedId;

        return (
          <group key={marker.id} position={marker.position}>
            {/* Small floating indicator sphere */}
            <mesh>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshBasicMaterial
                color={isNearest || isExpanded ? "#fbbf24" : "#60a5fa"}
                transparent
                opacity={0.7}
              />
            </mesh>

            {/* "Press X to read" hint when in range */}
            {isNearest && !isExpanded && (
              <Html center distanceFactor={10} style={{ pointerEvents: "none" }}>
                <div className="whitespace-nowrap px-3 py-1.5 rounded-md bg-black/70 backdrop-blur-sm border border-white/10 text-white text-xs">
                  Press{" "}
                  <kbd className="px-1 py-0.5 rounded bg-white/20 font-mono">
                    X
                  </kbd>{" "}
                  to read
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}
