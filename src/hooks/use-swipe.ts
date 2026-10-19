import { useRef, type TouchEvent } from "react";

/**
 * Horizontal swipe detection for touch surfaces. Fires `onSwipe(-1)` for a swipe to
 * the right (go back) and `onSwipe(1)` for one to the left (go forward) once the
 * finger has moved at least `threshold` px and mostly sideways, so vertical
 * scrolling through a timeline never triggers it.
 */
export function useSwipe(onSwipe: (dir: 1 | -1) => void, threshold = 48) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      onSwipe(dx < 0 ? 1 : -1);
    },
  };
}
