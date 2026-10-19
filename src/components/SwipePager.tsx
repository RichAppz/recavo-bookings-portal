import { useEffect, useRef, type ReactNode, type TouchEvent } from "react";
import {
  flickDirection,
  followOffset,
  releaseVelocity,
  scrollEdges,
  swipeAxis,
  swipeDirection,
  type SwipeDir,
  type SwipeSample,
} from "@/lib/swipe";
import { cn } from "@/lib/utils";

const DURATION = 260;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Turns a sideways swipe into a page turn that moves like iOS: the content follows
 * the finger, and on release it either slides on out while the next page slides in
 * behind it, or eases back where it was. `onPage(1)` is asked for the next page and
 * `onPage(-1)` for the previous one; the caller just re-renders `children` for the
 * new period, nothing here knows what a page is.
 *
 * How the hand-over works without rendering two periods at once: on release the
 * outgoing page is cloned into a still picture laid over the pager (scroll positions
 * copied so a scrolled grid doesn't jump), the live element is moved a page-width
 * to the side and re-rendered with the new period, then both animate across. The
 * clone is thrown away when it lands. The live element never carries a transform at
 * rest, so sticky headers and inner scrollers behave exactly as before.
 *
 * Vertical drags are left to the browser (the axis is decided once the finger has
 * moved a few px), and if the thing under the finger scrolls sideways itself — the
 * phone Week grid — the page only follows once that scroller is at the matching
 * edge, so panning through the days stays a pan. `prefers-reduced-motion` turns the
 * slide off and the page simply switches.
 */
export function SwipePager({
  onPage,
  className,
  children,
}: {
  onPage: (dir: SwipeDir) => void;
  /** Classes for the moving element (the card itself, so it slides as a whole). */
  className?: string;
  children: ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const settling = useRef<Animation | null>(null);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;

  useEffect(
    () => () => {
      settling.current?.cancel();
    },
    [],
  );

  const place = (x: number) => {
    const el = inner.current;
    if (el) el.style.transform = x === 0 ? "" : `translate3d(${x}px,0,0)`;
  };

  /** Ease the live element from `from` to rest, then drop every inline transform. */
  const settle = (from: number) => {
    const el = inner.current;
    if (!el || from === 0) {
      place(0);
      return;
    }
    settling.current?.cancel();
    if (reducedMotion()) {
      place(0);
      return;
    }
    place(from);
    const anim = el.animate(
      [{ transform: `translate3d(${from}px,0,0)` }, { transform: "translate3d(0,0,0)" }],
      { duration: DURATION, easing: EASING, fill: "forwards" },
    );
    settling.current = anim;
    anim.onfinish = () => {
      place(0);
      anim.cancel();
      if (settling.current === anim) settling.current = null;
    };
  };

  const turn = (dir: SwipeDir, from: number) => {
    const el = inner.current;
    const box = outer.current;
    const width = box?.clientWidth ?? 0;
    if (!el || !box || width === 0 || reducedMotion()) {
      place(0);
      onPageRef.current(dir);
      return;
    }
    settling.current?.cancel();
    const ghost = snapshot(el);
    box.appendChild(ghost);
    copyScrollPositions(el, ghost);
    ghost
      .animate(
        [
          { transform: `translate3d(${from}px,0,0)` },
          { transform: `translate3d(${-dir * width}px,0,0)` },
        ],
        { duration: DURATION, easing: EASING, fill: "forwards" },
      )
      .addEventListener("finish", () => ghost.remove());
    // The new page starts right beside the outgoing one, so the two move as a strip.
    const start = from + dir * width;
    place(start);
    onPageRef.current(dir);
    requestAnimationFrame(() => settle(start));
  };

  return (
    <div ref={outer} className="relative overflow-x-clip">
      <div
        ref={inner}
        className={className}
        onTouchStart={(e: TouchEvent) => {
          const t = e.touches[0];
          if (!t || e.touches.length > 1) {
            gesture.current = null;
            return;
          }
          // A finger landing mid-slide takes over from wherever the page is.
          let offset = 0;
          if (settling.current) {
            offset = currentX(inner.current);
            settling.current.cancel();
            settling.current = null;
            place(offset);
          }
          gesture.current = {
            x: t.clientX,
            y: t.clientY,
            ...sidewaysScroller(e.target, e.currentTarget),
            axis: null,
            offset,
            samples: [],
          };
        }}
        onTouchMove={(e: TouchEvent) => {
          const g = gesture.current;
          const t = e.touches[0];
          if (!g || !t || g.axis === "y") return;
          const dx = t.clientX - g.x;
          const dy = t.clientY - g.y;
          if (g.axis === null) {
            g.axis = swipeAxis(dx, dy);
            if (g.axis !== "x") return;
          }
          g.samples.push({ t: e.timeStamp, x: t.clientX });
          if (g.samples.length > 12) g.samples.shift();
          place(followOffset({ dx: dx + g.offset, dy, atStart: g.atStart, atEnd: g.atEnd }));
        }}
        onTouchEnd={(e: TouchEvent) => {
          const g = gesture.current;
          gesture.current = null;
          const t = e.changedTouches[0];
          if (!g || !t) return;
          const dx = t.clientX - g.x + g.offset;
          const dy = t.clientY - g.y;
          const edges = { atStart: g.atStart, atEnd: g.atEnd };
          const dir =
            g.axis === "y"
              ? null
              : (swipeDirection({ dx, dy, ...edges }) ??
                flickDirection({ dx, dy, ...edges }, releaseVelocity(g.samples, e.timeStamp)));
          const from = currentX(inner.current);
          if (dir) turn(dir, from);
          else settle(from);
        }}
        onTouchCancel={() => {
          gesture.current = null;
          settle(currentX(inner.current));
        }}
      >
        {children}
      </div>
    </div>
  );
}

type Gesture = {
  x: number;
  y: number;
  atStart: boolean;
  atEnd: boolean;
  axis: "x" | "y" | null;
  /** Where the page already was when the finger landed (0 unless mid-slide). */
  offset: number;
  /** Recent sideways positions, for the speed at release. */
  samples: SwipeSample[];
};

function reducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The live element's current sideways offset, mid-animation or at rest. */
function currentX(el: HTMLElement | null): number {
  if (!el) return 0;
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
  return Number.isFinite(m.m41) ? m.m41 : 0;
}

/**
 * A still picture of the outgoing page: a deep clone to lay over the pager, kept out
 * of the accessibility tree and untouchable.
 */
function snapshot(el: HTMLElement): HTMLElement {
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.className = cn(
    el.className,
    "pointer-events-none absolute inset-x-0 top-0 overflow-hidden",
  );
  ghost.style.height = `${el.offsetHeight}px`;
  return ghost;
}

/**
 * cloneNode drops scroll positions, so the week grid's copy would snap to its first
 * hour. Only works once the clone is in the document, hence a separate step.
 */
function copyScrollPositions(from: HTMLElement, to: HTMLElement) {
  const live = from.querySelectorAll<HTMLElement>("*");
  const copy = to.querySelectorAll<HTMLElement>("*");
  live.forEach((node, i) => {
    if (node.scrollTop || node.scrollLeft) {
      const twin = copy[i];
      if (twin) {
        twin.scrollTop = node.scrollTop;
        twin.scrollLeft = node.scrollLeft;
      }
    }
  });
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
