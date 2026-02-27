import { useRef, useMemo, useEffect } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { Vector3 } from "three";
import type CameraControlsImpl from "camera-controls";
import type {
  SparkRenderer as SparkRendererClass,
  SplatMesh as SplatMeshClass,
} from "@sparkjsdev/spark";

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
  url: string;
  secondUrl?: string;
  offset?: { x: number; y: number; z: number };
  rotationY?: number;
  showSecond?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  onCameraMove?: (pos: { x: number; y: number; z: number }) => void;
  controlsRef?: React.RefObject<CameraControlsImpl | null>;
}

// camera-controls ACTION enum values
const ACTION_ROTATE = 1;
const ACTION_TRUCK = 2;

function KeyboardMovement({
  controlsRef,
}: {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
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

  // Shift+drag = first-person look-around, default drag = pan (truck)
  const savedDistanceRef = useRef(5);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.mouseButtons.left = ACTION_TRUCK;

    const camPos = new Vector3();
    const target = new Vector3();
    const lookDir = new Vector3();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift" && controlsRef.current) {
        const c = controlsRef.current;
        // Save orbit distance, then collapse target to near-camera for first-person rotation
        savedDistanceRef.current = c.distance;
        c.getPosition(camPos);
        c.getTarget(target);
        lookDir.subVectors(target, camPos).normalize();
        c.setTarget(
          camPos.x + lookDir.x * 0.01,
          camPos.y + lookDir.y * 0.01,
          camPos.z + lookDir.z * 0.01,
          false,
        );
        c.mouseButtons.left = ACTION_ROTATE;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift" && controlsRef.current) {
        const c = controlsRef.current;
        // Restore target along current look direction at saved distance
        c.getPosition(camPos);
        c.getTarget(target);
        lookDir.subVectors(target, camPos).normalize();
        const dist = savedDistanceRef.current;
        c.setTarget(
          camPos.x + lookDir.x * dist,
          camPos.y + lookDir.y * dist,
          camPos.z + lookDir.z * dist,
          false,
        );
        c.mouseButtons.left = ACTION_TRUCK;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [controlsRef]);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const speed = 2 * delta;
    const keys = keysPressed.current;
    if (keys.has("KeyW") || keys.has("ArrowUp"))
      controlsRef.current.forward(speed, false);
    if (keys.has("KeyS") || keys.has("ArrowDown"))
      controlsRef.current.forward(-speed, false);
    if (keys.has("KeyA") || keys.has("ArrowLeft"))
      controlsRef.current.truck(-speed, 0, false);
    if (keys.has("KeyD") || keys.has("ArrowRight"))
      controlsRef.current.truck(speed, 0, false);
  });

  return null;
}

function Scene({
  url,
  secondUrl,
  offset,
  rotationY,
  showSecond,
  onLoadingChange,
  onCameraMove,
  controlsRef,
}: SplatViewerProps) {
  const gl = useThree((state) => state.gl);
  const internalControlsRef = useRef<CameraControlsImpl>(null);
  const activeControlsRef = controlsRef ?? internalControlsRef;

  const sparkArgs = useMemo(() => [{ renderer: gl }], [gl]);

  // Track loading state for both splats
  const loadedRef = useRef({ first: false, second: false });

  const splatArgs = useMemo(
    () => [
      {
        url,
        onLoad: () => {
          loadedRef.current.first = true;
          if (!secondUrl || !showSecond || loadedRef.current.second) {
            onLoadingChange?.(false);
          }
        },
      },
    ],
    [url, onLoadingChange, secondUrl, showSecond],
  );

  const secondSplatArgs = useMemo(
    () =>
      secondUrl
        ? [
            {
              url: secondUrl,
              onLoad: () => {
                loadedRef.current.second = true;
                if (loadedRef.current.first) {
                  onLoadingChange?.(false);
                }
              },
            },
          ]
        : null,
    [secondUrl, onLoadingChange],
  );

  // Reset loading flags independently so a URL that didn't change
  // doesn't need to re-fire onLoad (R3F won't reconstruct unchanged args)
  useEffect(() => {
    loadedRef.current.first = false;
    onLoadingChange?.(true);
  }, [url, onLoadingChange]);

  useEffect(() => {
    loadedRef.current.second = false;
  }, [secondUrl]);

  // Start camera at origin looking forward (-Z), save as reset state
  useEffect(() => {
    const controls = activeControlsRef.current;
    if (!controls) return;
    controls.setLookAt(0, 0, 0, 0, 0, 5, false);
    controls.saveState();
  }, [activeControlsRef]);

  // Report camera position to parent for mini-map
  const cameraPosVec = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const controls = activeControlsRef.current;
    if (!controls || !onCameraMove) return;
    controls.getPosition(cameraPosVec);
    onCameraMove({ x: cameraPosVec.x, y: cameraPosVec.y, z: cameraPosVec.z });
  });

  const off = offset ?? { x: 0, y: 0, z: 0 };
  const yRot = rotationY ?? 0;

  return (
    <>
      <CameraControls ref={activeControlsRef} makeDefault />
      <KeyboardMovement controlsRef={activeControlsRef} />
      <sparkRenderer args={sparkArgs}>
        <splatMesh args={splatArgs} rotation={[Math.PI, 0, 0]} />
        {showSecond && secondSplatArgs && (
          <group position={[off.x, off.y, off.z]} rotation={[0, yRot, 0]}>
            <splatMesh args={secondSplatArgs} rotation={[Math.PI, 0, 0]} />
          </group>
        )}
      </sparkRenderer>
      <ambientLight intensity={1} />
    </>
  );
}

export function SplatViewer({
  url,
  secondUrl,
  offset,
  rotationY,
  showSecond,
  onLoadingChange,
  onCameraMove,
  controlsRef,
}: SplatViewerProps) {
  return (
    <Canvas gl={{ antialias: false }} camera={{ position: [0, 0, 1], fov: 60 }}>
      <Scene
        url={url}
        secondUrl={secondUrl}
        offset={offset}
        rotationY={rotationY}
        showSecond={showSecond}
        onLoadingChange={onLoadingChange}
        onCameraMove={onCameraMove}
        controlsRef={controlsRef}
      />
    </Canvas>
  );
}
