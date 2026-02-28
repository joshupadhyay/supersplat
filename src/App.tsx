import { useState, useRef, useCallback, useEffect } from "react";
import { SplatViewer } from "./components/SplatViewer";
import { ControlsPanel } from "./components/ControlsPanel";
import { DebugHud, type SplatOverride } from "./components/DebugHud";
import { LoadingScreen } from "./components/LoadingScreen";
import { InfoPopup } from "./components/InfoPopup";
import { MarkerPopup } from "./components/MarkerPopup";
import { MiniMap } from "./components/MiniMap";
import { MARKERS_BY_WORLD, type Marker } from "./data/markers";
import { useSplatUrl } from "./hooks/useSplatUrl";
import { useSplatStitching } from "./hooks/useSplatStitching";
import type CameraControlsImpl from "camera-controls";
import "./index.css";

export function App() {
  const splatParam = useSplatUrl();
  const stitch = useSplatStitching();
  const [loading, setLoading] = useState(true);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [activeMarker, setActiveMarker] = useState<Marker | null>(null);
  const controlsRef = useRef<CameraControlsImpl>(null);
  const infoShownRef = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Camera position for mini-map and debug HUD
  const [cameraPos, setCameraPos] = useState({ x: 0, z: 0 });
  const [cameraPos3d, setCameraPos3d] = useState({ x: 0, y: 0, z: 0 });

  // Per-splat offset/rotation overrides for calibration
  const [overrides, setOverrides] = useState<Record<string, SplatOverride>>({});
  const handleOverrideChange = useCallback((id: string, ov: SplatOverride) => {
    setOverrides((prev) => ({ ...prev, [id]: ov }));
  }, []);

  // Per-splat load toggle (default: first two enabled)
  const [loadEnabled, setLoadEnabled] = useState(() => new Set([0, 1]));
  const handleLoadToggle = useCallback((index: number) => {
    setLoadEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // Single-splat mode if ?splat= is set
  const hasSplatParam =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("splat");

  // Camera position updates feed mini-map, debug HUD, and stitching proximity checks
  const handleCameraMove = useCallback(
    (pos: { x: number; y: number; z: number }) => {
      stitch.updateCamera(pos.x, pos.z);
      setCameraPos3d(pos);
      setCameraPos((prev) => {
        if (Math.abs(prev.x - pos.x) > 0.01 || Math.abs(prev.z - pos.z) > 0.01) {
          return { x: pos.x, z: pos.z };
        }
        return prev;
      });
    },
    [stitch.updateCamera],
  );

  const handleLoadingChange = useCallback(
    (isLoading: boolean) => {
      setLoading(isLoading);
      // Show info popup after first successful load
      if (!isLoading && !infoShownRef.current) {
        infoShownRef.current = true;
        setTimeout(() => setShowInfoPopup(true), 800);
      }
    },
    [],
  );

  const handleDismissInfo = useCallback(() => {
    setShowInfoPopup(false);
  }, []);

  const handleReset = useCallback(() => {
    controlsRef.current?.reset(true);
  }, []);

  // Reset camera when switching worlds
  useEffect(() => {
    controlsRef.current?.reset(true);
  }, [selectedIndex]);

  // Nav callbacks
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < stitch.worlds.length - 1;
  const onPrev = useCallback(() => setSelectedIndex((i) => Math.max(0, i - 1)), []);
  const onNext = useCallback(
    () => setSelectedIndex((i) => Math.min(stitch.worlds.length - 1, i + 1)),
    [stitch.worlds.length],
  );

  // Selected world's geo for MiniMap
  const selectedWorld = stitch.worlds[selectedIndex];
  const selectedCenter = selectedWorld?.center ?? { lat: 0, lng: 0 };
  const selectedHeading = selectedWorld?.heading ?? 0;

  // In single-splat mode, build a one-element slots array from the URL param
  // In multi-splat mode, show only the selected world at origin
  const selectedSlot = stitch.slots[selectedIndex];
  const slots = hasSplatParam
    ? [{ id: "single", url: splatParam, offset: { x: 0, y: 0, z: 0 }, shouldLoad: true }]
    : selectedSlot
      ? [{ ...selectedSlot, offset: { x: 0, y: 0, z: 0 }, shouldLoad: true }]
      : [];

  const markers = MARKERS_BY_WORLD[selectedIndex] ?? [];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">
      {slots.length > 0 && (
        <SplatViewer
          slots={slots}
          overrides={overrides}
          paused={showInfoPopup || activeMarker !== null}
          markers={markers}
          onActiveMarkerChange={setActiveMarker}
          onLoadingChange={handleLoadingChange}
          onCameraMove={handleCameraMove}
          controlsRef={controlsRef}
        />
      )}
      {selectedCenter.lat !== 0 && (
        <MiniMap
          center={selectedCenter}
          heading={selectedHeading}
          cameraPos={cameraPos}
          allWorlds={stitch.worlds
            .filter((w) => w.center?.lat)
            .map((w) => ({ lat: w.center.lat, lng: w.center.lng, id: w.id }))}
          currentIndex={selectedIndex}
        />
      )}
      <DebugHud
        cameraPos={cameraPos3d}
        slots={stitch.slots}
        activeIndex={stitch.activeIndex}
        overrides={overrides}
        onOverrideChange={handleOverrideChange}
        loadEnabled={loadEnabled}
        onLoadToggle={handleLoadToggle}
      />
      <LoadingScreen visible={loading} />
      <InfoPopup visible={showInfoPopup} onDismiss={handleDismissInfo} />
      <MarkerPopup marker={activeMarker} onDismiss={() => setActiveMarker(null)} />
      <ControlsPanel
        onReset={handleReset}
        nav={{
          currentIndex: selectedIndex,
          total: stitch.worlds.length,
          hasNext,
          hasPrev,
          onNext,
          onPrev,
        }}
        note={selectedWorld?.note}
      />
    </div>
  );
}

export default App;
