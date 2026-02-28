import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { Marker } from "../data/markers";

interface MarkerPopupProps {
  marker: Marker | null;
  onDismiss: () => void;
}

export function MarkerPopup({ marker, onDismiss }: MarkerPopupProps) {
  useEffect(() => {
    if (!marker) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "KeyX") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [marker, onDismiss]);

  if (!marker) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
      <Card className="pointer-events-auto bg-card/80 backdrop-blur-md border-muted max-w-md mx-4 shadow-2xl">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            {marker.title}
          </h2>

          {marker.imageUrl && (
            <img
              src={marker.imageUrl}
              alt={marker.title}
              className="w-full h-48 object-cover rounded-md"
            />
          )}

          <p className="text-sm text-foreground leading-relaxed">
            {marker.content}
          </p>

          {marker.linkUrl && (
            <a
              href={marker.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-blue-400 hover:text-blue-300 underline"
            >
              {marker.linkText ?? "Learn more"}
            </a>
          )}

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
