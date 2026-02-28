import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface NavControls {
  currentIndex: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
}

interface ControlsPanelProps {
  onReset: () => void;
  nav?: NavControls;
  note?: string;
}

export function ControlsPanel({ onReset, nav, note }: ControlsPanelProps) {
  return (
    <div className="absolute bottom-4 left-4 pointer-events-none z-10">
      <Card className="pointer-events-auto bg-card/80 backdrop-blur-sm border-muted w-72">
        <CardContent className="p-4 space-y-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Drag to pan &middot; Scroll to zoom</p>
            <p>Shift + Drag to look around</p>
            <p>WASD / Arrow keys to move</p>
          </div>
          {note && (
            <p className="text-xs text-amber-400/90 italic">{note}</p>
          )}
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset Camera
          </Button>
          {nav && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={nav.onPrev}
                disabled={!nav.hasPrev}
              >
                Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                World {nav.currentIndex + 1}/{nav.total}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={nav.onNext}
                disabled={!nav.hasNext}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
