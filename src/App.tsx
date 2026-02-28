import { useState, useRef, useCallback } from "react";
import { SplatViewer } from "./components/SplatViewer";
import { ControlsPanel } from "./components/ControlsPanel";
import { DebugPanel } from "./components/DebugPanel";
import { TransitionOverlay } from "./components/TransitionOverlay";
import { LoadingScreen } from "./components/LoadingScreen";
import { InfoPopup } from "./components/InfoPopup";
import { MarkerPopup } from "./components/MarkerPopup";
import { MiniMap } from "./components/MiniMap";
import { MARKERS, type Marker } from "./data/markers";
import { useSplatUrl } from "./hooks/useSplatUrl";
import { useStreetNav } from "./hooks/useStreetNav";
import type CameraControlsImpl from "camera-controls";
import "./index.css";

export function App() {
  const splatParam = useSplatUrl();
  const nav = useStreetNav();
  const [loading, setLoading] = useState(true);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [activeMarker, setActiveMarker] = useState<Marker | null>(null);
  const [overlayActive, setOverlayActive] = useState(false);
  const [displayUrl, setDisplayUrl] = useState("");
  const controlsRef = useRef<CameraControlsImpl>(null);
  const transitioningRef = useRef(false);
  const infoShownRef = useRef(false);

  // Debug panel state (always visible)
  const [debugOffset, setDebugOffset] = useState({ x: 0, y: 0, z: 4 });
  const [debugRotationY, setDebugRotationY] = useState(Math.PI);
  const [debugShowSecond, setDebugShowSecond] = useState(true);

  // Camera position for mini-map
  const [cameraPos, setCameraPos] = useState({ x: 0, z: 0 });
  const handleCameraMove = useCallback(
    (pos: { x: number; y: number; z: number }) => {
      setCameraPos((prev) => {
        // Only update if moved enough to avoid unnecessary re-renders
        if (
          Math.abs(prev.x - pos.x) > 0.01 ||
          Math.abs(prev.z - pos.z) > 0.01
        ) {
          return { x: pos.x, z: pos.z };
        }
        return prev;
      });
    },
    [],
  );

  // Single-splat mode if ?splat= is set, otherwise multi-world with nav
  const hasSplatParam =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("splat");

  // Fall back to default splat URL when registry is empty (e.g. production static hosting)
  const activeUrl = hasSplatParam
    ? splatParam
    : displayUrl || nav.currentUrl || splatParam;

  // Sync displayUrl when nav.currentUrl changes without a transition (initial load)
  if (!hasSplatParam && !displayUrl && nav.currentUrl) {
    setDisplayUrl(nav.currentUrl);
  }

  const handleNavigate = useCallback(
    (direction: "next" | "prev") => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;

      // Fade to black
      setOverlayActive(true);

      setTimeout(() => {
        // Swap world while screen is black
        if (direction === "next") nav.next();
        else nav.prev();
      }, 500);
    },
    [nav],
  );

  // When nav.currentUrl changes (after next/prev), update displayUrl
  // We need to detect when the nav index changed during a transition
  const lastNavUrlRef = useRef(nav.currentUrl);
  if (nav.currentUrl !== lastNavUrlRef.current) {
    lastNavUrlRef.current = nav.currentUrl;
    if (transitioningRef.current) {
      setDisplayUrl(nav.currentUrl);
    }
  }

  const handleLoadingChange = useCallback(
    (isLoading: boolean) => {
      setLoading(isLoading);
      // When splat finishes loading during a transition, fade overlay out
      if (!isLoading && transitioningRef.current) {
        setOverlayActive(false);
        transitioningRef.current = false;
      }
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

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">
      {activeUrl && (
        <SplatViewer
          url={activeUrl}
          secondUrl={nav.secondUrl}
          offset={debugOffset}
          rotationY={debugRotationY}
          showSecond={!!nav.secondUrl && debugShowSecond}
          paused={showInfoPopup || activeMarker !== null}
          markers={MARKERS}
          onActiveMarkerChange={setActiveMarker}
          onLoadingChange={handleLoadingChange}
          onCameraMove={handleCameraMove}
          controlsRef={controlsRef}
        />
      )}
      <TransitionOverlay active={overlayActive} />
      {nav.center.lat !== 0 && (
        <MiniMap
          center={nav.center}
          heading={nav.heading}
          cameraPos={cameraPos}
          allWorlds={nav.worlds
            .filter((w) => w.center?.lat)
            .map((w) => ({ lat: w.center.lat, lng: w.center.lng, id: w.id }))}
          currentIndex={nav.currentIndex}
        />
      )}
      {nav.secondUrl && (
        <DebugPanel
          offset={debugOffset}
          rotationY={debugRotationY}
          showSecond={debugShowSecond}
          onOffsetChange={setDebugOffset}
          onRotationYChange={setDebugRotationY}
          onShowSecondChange={setDebugShowSecond}
        />
      )}
      <LoadingScreen visible={loading} />
      <InfoPopup visible={showInfoPopup} onDismiss={handleDismissInfo} />
      <MarkerPopup marker={activeMarker} onDismiss={() => setActiveMarker(null)} />
      <ControlsPanel
        onReset={handleReset}
        note={nav.note}
        nav={
          hasSplatParam || nav.worlds.length === 0
            ? undefined
            : {
                currentIndex: nav.currentIndex,
                total: nav.worlds.length,
                hasNext: nav.hasNext,
                hasPrev: nav.hasPrev,
                onNext: () => handleNavigate("next"),
                onPrev: () => handleNavigate("prev"),
              }
        }
      />
    </div>
  );
}

export default App;
