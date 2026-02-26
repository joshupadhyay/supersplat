interface TransitionOverlayProps {
  active: boolean;
}

export function TransitionOverlay({ active }: TransitionOverlayProps) {
  return (
    <div
      className="absolute inset-0 z-50 pointer-events-none bg-black transition-opacity duration-500"
      style={{ opacity: active ? 1 : 0 }}
    />
  );
}
