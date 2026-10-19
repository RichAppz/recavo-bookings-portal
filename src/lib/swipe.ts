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

/**
 * Which way a touch is heading once it has moved past `slop` px: `"x"` for a
 * sideways drag the page should follow, `"y"` for a scroll the browser owns. Decided
 * once per gesture and then kept, so a swipe that drifts up a little keeps sliding
 * and a scroll that drifts sideways keeps scrolling. Same 1.5:1 rule as
 * `swipeDirection`, so what follows the finger is what will page on release.
 */
export function swipeAxis(dx: number, dy: number, slop = 8): "x" | "y" | null {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.5 ? "x" : "y";
}

/**
 * How far the page should follow the finger mid-gesture. Zero when the thing under
 * the finger is still panning that way itself (the phone Week grid mid-week): the
 * browser is already moving it, and sliding the whole page too would double up.
 */
export function followOffset(g: SwipeGesture): number {
  if (g.dx < 0) return g.atEnd ? g.dx : 0;
  if (g.dx > 0) return g.atStart ? g.dx : 0;
  return 0;
}

/**
 * A short, quick flick turns the page too, the way it does in iOS, even when the
 * finger never travelled `threshold` px. `velocity` is px/ms over the last few
 * samples, signed like `dx`; the flick must be going the same way the page has
 * been dragged, and still past the same edge checks.
 */
export function flickDirection(
  g: SwipeGesture,
  velocity: number,
  minVelocity = 0.35,
  minDistance = 16,
): SwipeDir | null {
  if (Math.abs(velocity) < minVelocity) return null;
  if (Math.sign(velocity) !== Math.sign(g.dx)) return null;
  return swipeDirection(g, minDistance);
}

export type SwipeSample = { t: number; x: number };

/**
 * Sideways speed (px/ms, signed) over the last `window` ms of movement, judged at
 * `endT` when the finger lifted. A finger that paused before lifting reads as zero,
 * however fast it moved earlier, so a drag that stops and lets go eases back
 * rather than paging. Needs two samples inside the window to say anything.
 */
export function releaseVelocity(samples: readonly SwipeSample[], endT: number, window = 100) {
  const recent = samples.filter((s) => endT - s.t <= window);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || first === last) return 0;
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
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
