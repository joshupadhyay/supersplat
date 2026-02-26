import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ControlsPanelProps {
  loading: boolean;
  onReset: () => void;
}

export function ControlsPanel({ loading, onReset }: ControlsPanelProps) {
  return (
    <div className="absolute bottom-4 left-4 pointer-events-none z-10">
      <Card className="pointer-events-auto bg-card/80 backdrop-blur-sm border-muted w-72">
        <CardContent className="p-4 space-y-3">
          {loading && (
            <p className="text-sm text-muted-foreground animate-pulse">
              Loading splat...
            </p>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Drag to pan &middot; Scroll to zoom</p>
            <p>Shift + Drag to look around</p>
            <p>WASD / Arrow keys to move</p>
          </div>
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset Camera
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
