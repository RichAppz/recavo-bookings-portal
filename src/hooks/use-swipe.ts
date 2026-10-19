import { useRef, type TouchEvent } from "react";
import { scrollEdges, swipeDirection, type SwipeDir } from "@/lib/swipe";

/**
 * Horizontal swipe detection for touch surfaces. Fires `onSwipe(-1)` for a swipe to
 * the right (go back) and `onSwipe(1)` for one to the left (go forward) once the
 * finger has moved at least `threshold` px and mostly sideways, so vertical
 * scrolling through a timeline never triggers it.
 *
 * If the finger lands on something that scrolls sideways (the phone Week grid), the
 * swipe only counts when that scroller was already at the matching edge: panning
 * through the days stays a pan, and one more swipe at the end turns the page.
 */
export function useSwipe(onSwipe: (dir: SwipeDir) => void, threshold = 48) {
  const start = useRef<{ x: number; y: number; atStart: boolean; atEnd: boolean } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) {
        start.current = null;
        return;
      }
      const edges = sidewaysScroller(e.target, e.currentTarget);
      start.current = { x: t.clientX, y: t.clientY, ...edges };
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const dir = swipeDirection(
        { dx: t.clientX - s.x, dy: t.clientY - s.y, atStart: s.atStart, atEnd: s.atEnd },
        threshold,
      );
      if (dir) onSwipe(dir);
    },
  };
}

function sidewaysScroller(target: EventTarget | null, boundary: EventTarget | null) {
  let el = target instanceof Element ? target : null;
  while (el) {
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
      const overflowX = getComputedStyle(el).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return scrollEdges(el);
    }
    if (el === boundary) break;
    el = el.parentElement;
  }
  return { atStart: true, atEnd: true };
}
