import { useState, useRef, useCallback } from "react";
import { SplatViewer } from "./components/SplatViewer";
import { ControlsPanel } from "./components/ControlsPanel";
import { DebugPanel } from "./components/DebugPanel";
import { TransitionOverlay } from "./components/TransitionOverlay";
import { useSplatUrl } from "./hooks/useSplatUrl";
import { useStreetNav } from "./hooks/useStreetNav";
import type CameraControlsImpl from "camera-controls";
import "./index.css";

export function App() {
  const splatParam = useSplatUrl();
  const nav = useStreetNav();
  const [loading, setLoading] = useState(true);
  const [overlayActive, setOverlayActive] = useState(false);
  const [displayUrl, setDisplayUrl] = useState("");
  const controlsRef = useRef<CameraControlsImpl>(null);
  const transitioningRef = useRef(false);

  // Debug panel state (always visible)
  const [debugOffset, setDebugOffset] = useState({ x: 0, y: 0, z: 4 });
  const [debugRotationY, setDebugRotationY] = useState(0);
  const [debugShowSecond, setDebugShowSecond] = useState(true);

  // Single-splat mode if ?splat= is set, otherwise multi-world with nav
  const hasSplatParam =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("splat");

  const activeUrl = hasSplatParam
    ? splatParam
    : displayUrl || nav.currentUrl;

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
    },
    [],
  );

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
          onLoadingChange={handleLoadingChange}
          controlsRef={controlsRef}
        />
      )}
      <TransitionOverlay active={overlayActive} />
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
      <ControlsPanel
        loading={loading}
        onReset={handleReset}
        note={nav.note}
        nav={
          hasSplatParam
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
