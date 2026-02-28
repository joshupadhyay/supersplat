import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  visible: boolean;
}

export function LoadingScreen({ visible }: LoadingScreenProps) {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else {
      const timer = setTimeout(() => setMounted(false), 700);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black transition-opacity duration-700",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="mb-8 flex gap-2">
        <div className="h-2 w-2 rounded-full bg-white/60 animate-bounce [animation-delay:0ms]" />
        <div className="h-2 w-2 rounded-full bg-white/60 animate-bounce [animation-delay:150ms]" />
        <div className="h-2 w-2 rounded-full bg-white/60 animate-bounce [animation-delay:300ms]" />
      </div>

      <h1 className="text-2xl font-light text-white/90 tracking-wide mb-3">
        Building NYC streets...
      </h1>

      <p className="text-sm text-white/40 italic">
        (Rome wasn't built in a day.. but this will be)
      </p>
    </div>
  );
}
