import { useState, useRef, useCallback } from "react";
import { SplatViewer } from "./components/SplatViewer";
import { ControlsPanel } from "./components/ControlsPanel";
import { LoadingScreen } from "./components/LoadingScreen";
import { InfoPopup } from "./components/InfoPopup";
import { MarkerPopup } from "./components/MarkerPopup";
import { MiniMap } from "./components/MiniMap";
import { MARKERS, type Marker } from "./data/markers";
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

  // Camera position for mini-map
  const [cameraPos, setCameraPos] = useState({ x: 0, z: 0 });

  // Single-splat mode if ?splat= is set
  const hasSplatParam =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("splat");

  // Camera position updates feed both mini-map and stitching proximity checks
  const handleCameraMove = useCallback(
    (pos: { x: number; y: number; z: number }) => {
      stitch.updateCamera(pos.x, pos.z);
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

  // In single-splat mode, build a one-element slots array from the URL param
  const slots = hasSplatParam
    ? [{ id: "single", url: splatParam, offset: { x: 0, y: 0, z: 0 }, shouldLoad: true }]
    : stitch.slots;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">
      {slots.length > 0 && (
        <SplatViewer
          slots={slots}
          paused={showInfoPopup || activeMarker !== null}
          markers={MARKERS}
          onActiveMarkerChange={setActiveMarker}
          onLoadingChange={handleLoadingChange}
          onCameraMove={handleCameraMove}
          controlsRef={controlsRef}
        />
      )}
      {stitch.center.lat !== 0 && (
        <MiniMap
          center={stitch.center}
          heading={stitch.heading}
          cameraPos={cameraPos}
          allWorlds={stitch.worlds
            .filter((w) => w.center?.lat)
            .map((w) => ({ lat: w.center.lat, lng: w.center.lng, id: w.id }))}
          currentIndex={stitch.activeIndex}
        />
      )}
      <LoadingScreen visible={loading} />
      <InfoPopup visible={showInfoPopup} onDismiss={handleDismissInfo} />
      <MarkerPopup marker={activeMarker} onDismiss={() => setActiveMarker(null)} />
      <ControlsPanel onReset={handleReset} />
    </div>
  );
}

export default App;
