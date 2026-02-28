import { Card, CardContent } from "@/components/ui/card";
import type { SplatSlot } from "../hooks/useSplatStitching";

export type SplatOverride = { dx: number; dy: number; dz: number; ry: number };

interface DebugHudProps {
  cameraPos: { x: number; y: number; z: number };
  slots: SplatSlot[];
  activeIndex: number;
  overrides: Record<string, SplatOverride>;
  onOverrideChange: (id: string, override: SplatOverride) => void;
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
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(2)}</span>
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

export function DebugHud({
  cameraPos,
  slots,
  activeIndex,
  overrides,
  onOverrideChange,
}: DebugHudProps) {
  return (
    <div className="absolute top-4 left-4 pointer-events-none z-10 max-h-[90vh] overflow-y-auto">
      <Card className="pointer-events-auto bg-card/80 backdrop-blur-sm border-muted w-72">
        <CardContent className="p-3 space-y-3">
          {/* Camera position */}
          <div className="font-mono text-xs text-muted-foreground">
            <div>
              cam: ({cameraPos.x.toFixed(2)}, {cameraPos.y.toFixed(2)},{" "}
              {cameraPos.z.toFixed(2)})
            </div>
            <div>nearest: world {activeIndex}</div>
          </div>

          {/* Per-slot info + controls */}
          {slots.map((slot, i) => {
            const ov = overrides[slot.id] ?? { dx: 0, dy: 0, dz: 0, ry: 0 };
            const isOrigin = i === 0;
            return (
              <div key={slot.id} className="space-y-1 border-t border-muted pt-2">
                <div className="flex justify-between text-xs">
                  <span className="font-medium truncate">
                    {i}: {slot.id.slice(0, 20)}
                  </span>
                  <span className="text-muted-foreground">
                    {slot.shouldLoad ? "loaded" : "—"}
                  </span>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  offset: ({slot.offset.x.toFixed(2)}, {slot.offset.y.toFixed(2)},{" "}
                  {slot.offset.z.toFixed(2)})
                </div>
                {!isOrigin && (
                  <div className="space-y-1">
                    <SliderRow
                      label="dx"
                      value={ov.dx}
                      min={-30}
                      max={30}
                      step={0.1}
                      onChange={(dx) => onOverrideChange(slot.id, { ...ov, dx })}
                    />
                    <SliderRow
                      label="dy"
                      value={ov.dy}
                      min={-5}
                      max={5}
                      step={0.1}
                      onChange={(dy) => onOverrideChange(slot.id, { ...ov, dy })}
                    />
                    <SliderRow
                      label="dz"
                      value={ov.dz}
                      min={-40}
                      max={40}
                      step={0.1}
                      onChange={(dz) => onOverrideChange(slot.id, { ...ov, dz })}
                    />
                    <SliderRow
                      label={`rot-Y (${((ov.ry * 180) / Math.PI).toFixed(0)}\u00B0)`}
                      value={ov.ry}
                      min={-Math.PI}
                      max={Math.PI}
                      step={0.01}
                      onChange={(ry) => onOverrideChange(slot.id, { ...ov, ry })}
                    />
                    <button
                      onClick={() =>
                        onOverrideChange(slot.id, { dx: 0, dy: 0, dz: 0, ry: 0 })
                      }
                      className="w-full px-2 py-1 text-xs rounded border border-muted bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
