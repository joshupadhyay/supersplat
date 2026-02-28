import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface InfoPopupProps {
  visible: boolean;
  onDismiss: () => void;
}

export function InfoPopup({ visible, onDismiss }: InfoPopupProps) {
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "KeyX") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
      <Card className="pointer-events-auto bg-card/80 backdrop-blur-md border-muted max-w-lg mx-4 shadow-2xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-foreground leading-relaxed">
            This is a combination of Gaussian splats of St. Mark's Place,
            rendered with the help of streetview images and World Labs' Marble
            API.
          </p>
          <p className="text-sm text-foreground leading-relaxed">
            This attempts to be a digital recreation, with a minimap for roughly
            translation into the real world.
          </p>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Press{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs font-mono">
              X
            </kbd>{" "}
            to close
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
