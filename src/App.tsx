import { useState, useRef, useCallback } from "react";
import { SplatViewer } from "./components/SplatViewer";
import { ControlsPanel } from "./components/ControlsPanel";
import { useSplatUrl } from "./hooks/useSplatUrl";
import type CameraControlsImpl from "camera-controls";
import "./index.css";

export function App() {
  const url = useSplatUrl();
  const [loading, setLoading] = useState(true);
  const controlsRef = useRef<CameraControlsImpl>(null);

  const handleReset = useCallback(() => {
    controlsRef.current?.reset(true);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background">
      <SplatViewer
        url={url}
        onLoadingChange={setLoading}
        controlsRef={controlsRef}
      />
      <ControlsPanel loading={loading} onReset={handleReset} />
    </div>
  );
}

export default App;
