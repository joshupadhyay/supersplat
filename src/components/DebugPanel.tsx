import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface DebugPanelProps {
  offset: { x: number; y: number; z: number };
  rotationY: number;
  showSecond: boolean;
  onOffsetChange: (offset: { x: number; y: number; z: number }) => void;
  onRotationYChange: (rotationY: number) => void;
  onShowSecondChange: (show: boolean) => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-muted accent-primary"
      />
    </div>
  );
}

export function DebugPanel({
  offset,
  rotationY,
  showSecond,
  onOffsetChange,
  onRotationYChange,
  onShowSecondChange,
}: DebugPanelProps) {
  const [visible, setVisible] = useState(true);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if user is typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    // Use backtick to toggle (D conflicts with WASD movement)
    if (e.key === "`") {
      setVisible((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) {
    return (
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => setVisible(true)}
          className="px-2 py-1 text-xs rounded bg-card/80 backdrop-blur-sm border border-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          Debug Panel (`)
        </button>
      </div>
    );
  }

  const rotDeg = (rotationY * 180) / Math.PI;

  return (
    <div className="absolute top-4 right-4 pointer-events-none z-10">
      <Card className="pointer-events-auto bg-card/80 backdrop-blur-sm border-muted w-72">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Debug: Dual Splat</h3>
            <button
              onClick={() => setVisible(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Hide (`)
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSecond}
              onChange={(e) => onShowSecondChange(e.target.checked)}
              className="rounded accent-primary"
            />
            <span className="text-sm">Show Second Splat</span>
          </label>

          <div className="space-y-2">
            <SliderRow
              label="Offset X (lateral)"
              value={offset.x}
              min={-50}
              max={50}
              step={0.5}
              onChange={(x) => onOffsetChange({ ...offset, x })}
            />
            <SliderRow
              label="Offset Y (vertical)"
              value={offset.y}
              min={-10}
              max={10}
              step={0.25}
              onChange={(y) => onOffsetChange({ ...offset, y })}
            />
            <SliderRow
              label="Offset Z (depth)"
              value={offset.z}
              min={-50}
              max={50}
              step={0.5}
              onChange={(z) => onOffsetChange({ ...offset, z })}
            />
            <SliderRow
              label={`Rotation Y (${rotDeg.toFixed(0)}\u00B0)`}
              value={rotationY}
              min={0}
              max={2 * Math.PI}
              step={0.01}
              onChange={onRotationYChange}
            />
          </div>

          <button
            onClick={() => {
              onOffsetChange({ x: 0, y: 0, z: -20 });
              onRotationYChange(0);
            }}
            className="w-full px-3 py-1.5 text-xs rounded border border-muted bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Reset to Defaults
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
