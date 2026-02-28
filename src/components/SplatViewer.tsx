import { useRef, useMemo, useEffect, useCallback } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { Vector3 } from "three";
import type CameraControlsImpl from "camera-controls";
import type {
  SparkRenderer as SparkRendererClass,
  SplatMesh as SplatMeshClass,
} from "@sparkjsdev/spark";
import { ProximityMarkers } from "./ProximityMarkers";
import type { Marker } from "../data/markers";
import type { SplatSlot } from "../hooks/useSplatStitching";
import type { SplatOverride } from "./DebugHud";

// Register Spark classes with R3F
import "./spark/SparkRenderer";
import "./spark/SplatMesh";

// Extend JSX.IntrinsicElements for R3F
declare module "@react-three/fiber" {
  interface ThreeElements {
    sparkRenderer: JSX.IntrinsicElements["mesh"] & {
      args?: [ConstructorParameters<typeof SparkRendererClass>[0]];
    };
    splatMesh: JSX.IntrinsicElements["mesh"] & {
      args?: [ConstructorParameters<typeof SplatMeshClass>[0]];
    };
  }
}

interface SplatViewerProps {
  slots: SplatSlot[];
  overrides?: Record<string, SplatOverride>;
  paused?: boolean;
  markers?: Marker[];
  onActiveMarkerChange?: (marker: Marker | null) => void;
  onLoadingChange?: (loading: boolean) => void;
  onCameraMove?: (pos: { x: number; y: number; z: number }) => void;
  controlsRef?: React.RefObject<CameraControlsImpl | null>;
}

// camera-controls ACTION enum values
const ACTION_ROTATE = 1;
const ACTION_TRUCK = 2;
const ACTION_NONE = 0;

function KeyboardMovement({
  controlsRef,
  paused,
}: {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
  paused?: boolean;
}) {
  const keysPressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => keysPressed.current.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Mirror Spark.js controls: left-drag = rotate, right-drag = slide, scroll = forward/back
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.mouseButtons.left = ACTION_ROTATE;
    controls.mouseButtons.right = ACTION_TRUCK;
    controls.mouseButtons.middle = ACTION_NONE;
    controls.mouseButtons.wheel = ACTION_NONE; // we handle scroll manually below
  }, [controlsRef]);

  // Scroll = forward/backward movement (like Spark), not dolly/zoom
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = controlsRef.current;
      if (!c || paused) return;
      const speed = e.deltaY * 0.005;
      c.forward(-speed, false);
    };
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [controlsRef, paused]);

  useFrame((_, delta) => {
    if (!controlsRef.current || paused) return;
    const keys = keysPressed.current;
    const shift = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = 2 * delta * (shift ? 5 : 1);
    if (keys.has("KeyW") || keys.has("ArrowUp"))
      controlsRef.current.forward(speed, false);
    if (keys.has("KeyS") || keys.has("ArrowDown"))
      controlsRef.current.forward(-speed, false);
    if (keys.has("KeyA") || keys.has("ArrowLeft"))
      controlsRef.current.truck(-speed, 0, false);
    if (keys.has("KeyD") || keys.has("ArrowRight"))
      controlsRef.current.truck(speed, 0, false);
    if (keys.has("KeyR") || keys.has("PageUp"))
      controlsRef.current.truck(0, speed, false);
    if (keys.has("KeyF") || keys.has("PageDown"))
      controlsRef.current.truck(0, -speed, false);
  });

  return null;
}

function SplatNode({
  url,
  onLoad,
}: {
  url: string;
  onLoad: () => void;
}) {
  const onLoadStable = useRef(onLoad);
  onLoadStable.current = onLoad;

  const args = useMemo(
    () => [{ url, onLoad: () => onLoadStable.current() }],
    [url],
  );

  return <splatMesh args={args} rotation={[Math.PI, 0, 0]} />;
}

function Scene({
  slots,
  overrides,
  paused,
  markers,
  onActiveMarkerChange,
  onLoadingChange,
  onCameraMove,
  controlsRef,
}: SplatViewerProps) {
  const gl = useThree((state) => state.gl);
  const internalControlsRef = useRef<CameraControlsImpl>(null);
  const activeControlsRef = controlsRef ?? internalControlsRef;

  const sparkArgs = useMemo(() => [{ renderer: gl }], [gl]);

  // Track loading: at least the first slot must be loaded
  const loadedSetRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  const handleSplatLoad = useCallback(
    (id: string) => {
      loadedSetRef.current.add(id);
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true;
        onLoadingChange?.(false);
      }
    },
    [onLoadingChange],
  );

  // Reset loading state when first slot URL changes
  const firstUrl = slots[0]?.url;
  useEffect(() => {
    loadedSetRef.current.clear();
    initialLoadDoneRef.current = false;
    onLoadingChange?.(true);
  }, [firstUrl, onLoadingChange]);

  // Start camera at origin looking forward (+Z), save as reset state
  useEffect(() => {
    const controls = activeControlsRef.current;
    if (!controls) return;
    controls.setLookAt(0, 0, 0, 0, 0, 0.01, false);
    controls.saveState();
  }, [activeControlsRef]);

  // Report camera position to parent for mini-map and stitching updates
  const cameraPosVec = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const controls = activeControlsRef.current;
    if (!controls || !onCameraMove) return;
    controls.getPosition(cameraPosVec);
    onCameraMove({ x: cameraPosVec.x, y: cameraPosVec.y, z: cameraPosVec.z });
  });

  return (
    <>
      <CameraControls ref={activeControlsRef} makeDefault enabled={!paused} />
      <KeyboardMovement controlsRef={activeControlsRef} paused={paused} />
      <sparkRenderer args={sparkArgs}>
        {slots.map((slot) => {
          if (!slot.shouldLoad) return null;
          const ov = overrides?.[slot.id];
          const px = slot.offset.x + (ov?.dx ?? 0);
          const py = slot.offset.y + (ov?.dy ?? 0);
          const pz = slot.offset.z + (ov?.dz ?? 0);
          const ry = ov?.ry ?? 0;
          return (
            <group key={slot.id} position={[px, py, pz]} rotation={[0, ry, 0]}>
              <SplatNode
                url={slot.url}
                onLoad={() => handleSplatLoad(slot.id)}
              />
            </group>
          );
        })}
      </sparkRenderer>
      {markers && markers.length > 0 && onActiveMarkerChange && (
        <ProximityMarkers
          markers={markers}
          controlsRef={activeControlsRef}
          paused={!!paused}
          onActiveMarkerChange={onActiveMarkerChange}
        />
      )}
      <ambientLight intensity={1} />
    </>
  );
}

export function SplatViewer({
  slots,
  overrides,
  paused,
  markers,
  onActiveMarkerChange,
  onLoadingChange,
  onCameraMove,
  controlsRef,
}: SplatViewerProps) {
  return (
    <Canvas gl={{ antialias: false }} camera={{ position: [0, 0, 1], fov: 60 }}>
      <Scene
        slots={slots}
        overrides={overrides}
        paused={paused}
        markers={markers}
        onActiveMarkerChange={onActiveMarkerChange}
        onLoadingChange={onLoadingChange}
        onCameraMove={onCameraMove}
        controlsRef={controlsRef}
      />
    </Canvas>
  );
}
