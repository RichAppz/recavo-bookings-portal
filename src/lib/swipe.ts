export type SwipeDir = 1 | -1;

export type SwipeGesture = {
  dx: number;
  dy: number;
  /** Was the nearest sideways scroller already at its left edge when the finger went down? */
  atStart: boolean;
  /** …and at its right edge? Both true when nothing underneath scrolls sideways. */
  atEnd: boolean;
};

/**
 * Decide whether a finished touch gesture should page the calendar. `1` means the
 * finger moved left (go forward), `-1` right (go back), `null` means leave it alone:
 * too short, mostly vertical (the person was scrolling the timeline), or the thing
 * under the finger still had room to scroll in that direction (the person was
 * panning the week and the browser has already done that for them).
 */
export function swipeDirection(g: SwipeGesture, threshold = 48): SwipeDir | null {
  if (Math.abs(g.dx) < threshold || Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return null;
  if (g.dx < 0) return g.atEnd ? 1 : null;
  return g.atStart ? -1 : null;
}

/** Edge state of a sideways scroller, with a pixel of slack for sub-pixel widths. */
export function scrollEdges(el: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}): Pick<SwipeGesture, "atStart" | "atEnd"> {
  if (el.scrollWidth <= el.clientWidth + 1) return { atStart: true, atEnd: true };
  return {
    atStart: el.scrollLeft <= 1,
    atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
  };
}
