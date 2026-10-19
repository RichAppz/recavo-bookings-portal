import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
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
 * the finger, the pages either side come into view beside it, and on release it
 * either slides on to the next page or eases back where it was. `onPage(1)` is asked
 * for the next page and `onPage(-1)` for the previous one; the caller just re-renders
 * `children` for the new period, nothing here knows what a page is.
 *
 * `neighbour(dir, shown)` draws the page one step either way. It is asked for on
 * every render so the caller can keep that page's data warm, but should only return
 * markup while `shown` — the pager mounts it beside the live page for the length of
 * a sideways drag and takes it down again once the gesture is over.
 *
 * How the hand-over works: on release the outgoing page is cloned into a still
 * picture laid over the pager (scroll positions copied so a scrolled grid doesn't
 * jump), the live element is moved a page-width to the side — exactly where the
 * neighbour was drawn — and re-rendered with the new period in the same commit that
 * takes the neighbour down, then both animate across. The clone is thrown away when
 * it lands. The live element never carries a transform at rest, so sticky headers
 * and inner scrollers behave exactly as before.
 *
 * Vertical drags are left to the browser (the axis is decided once the finger has
 * moved a few px), and if the thing under the finger scrolls sideways itself — the
 * phone Week grid — the page only follows once that scroller is at the matching
 * edge, so panning through the days stays a pan. `prefers-reduced-motion` turns the
 * slide off and the page simply switches.
 */
export function SwipePager({
  onPage,
  neighbour,
  className,
  children,
}: {
  onPage: (dir: SwipeDir) => void;
  neighbour?: (dir: SwipeDir, shown: boolean) => ReactNode;
  /** Classes for the moving element (the card itself, so it slides as a whole). */
  className?: string;
  children: ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const prev = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const settling = useRef<Animation[]>([]);
  const [peeking, setPeeking] = useState(false);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;

  const stopSettling = () => {
    for (const a of settling.current) a.cancel();
    settling.current = [];
  };
  useEffect(() => () => stopSettling(), []);

  const width = () => outer.current?.clientWidth ?? 0;

  const place = (x: number) => {
    const el = inner.current;
    if (el) el.style.transform = x === 0 ? "" : `translate3d(${x}px,0,0)`;
    const w = width();
    if (prev.current) prev.current.style.transform = `translate3d(${x - w}px,0,0)`;
    if (next.current) next.current.style.transform = `translate3d(${x + w}px,0,0)`;
  };

  // The neighbours mount part-way through a drag, so line them up with the page
  // the moment they appear rather than on the next move.
  useLayoutEffect(() => {
    if (peeking) place(currentX(inner.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peeking]);

  /** Ease the live element (and the neighbours beside it) from `from` to rest. */
  const settle = (from: number) => {
    const el = inner.current;
    if (!el || from === 0 || reducedMotion()) {
      place(0);
      setPeeking(false);
      return;
    }
    stopSettling();
    place(from);
    const timing = { duration: DURATION, easing: EASING, fill: "forwards" as const };
    const slide = (node: HTMLElement | null, shift: number) =>
      node?.animate(
        [
          { transform: `translate3d(${from + shift}px,0,0)` },
          { transform: `translate3d(${shift}px,0,0)` },
        ],
        timing,
      );
    const w = width();
    const anims = [slide(el, 0), slide(prev.current, -w), slide(next.current, w)].filter(
      (a): a is Animation => Boolean(a),
    );
    settling.current = anims;
    anims[0]?.addEventListener("finish", () => {
      if (settling.current !== anims) return;
      stopSettling();
      place(0);
      setPeeking(false);
    });
  };

  const turn = (dir: SwipeDir, from: number) => {
    const el = inner.current;
    const box = outer.current;
    const w = width();
    if (!el || !box || w === 0 || reducedMotion()) {
      place(0);
      setPeeking(false);
      onPageRef.current(dir);
      return;
    }
    stopSettling();
    const ghost = snapshot(el);
    box.appendChild(ghost);
    copyScrollPositions(el, ghost);
    ghost
      .animate(
        [
          { transform: `translate3d(${from}px,0,0)` },
          { transform: `translate3d(${-dir * w}px,0,0)` },
        ],
        { duration: DURATION, easing: EASING, fill: "forwards" },
      )
      .addEventListener("finish", () => ghost.remove());
    // The new page starts right beside the outgoing one — where its preview already
    // is — so the two move as a strip. Re-rendering the live element and taking the
    // preview down happen in one commit, so nothing flickers in the hand-over.
    const start = from + dir * w;
    place(start);
    setPeeking(false);
    onPageRef.current(dir);
    requestAnimationFrame(() => settle(start));
  };

  const peekClass = cn(className, "pointer-events-none absolute inset-0 overflow-hidden");

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
          if (settling.current.length) {
            offset = currentX(inner.current);
            stopSettling();
            place(offset);
          }
          gesture.current = {
            x: t.clientX,
            y: t.clientY,
            ...sidewaysScroller(e.target, e.currentTarget),
            axis: null,
            offset,
            // The landing point counts too: a very fast flick on a 60Hz screen can
            // be a single move, and the speed from where it started still tells.
            samples: [{ t: e.timeStamp, x: t.clientX }],
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
            if (neighbour) setPeeking(true);
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
      {neighbour ? (
        <>
          <div ref={prev} aria-hidden inert className={cn(peekClass, !peeking && "hidden")}>
            {neighbour(-1, peeking)}
          </div>
          <div ref={next} aria-hidden inert className={cn(peekClass, !peeking && "hidden")}>
            {neighbour(1, peeking)}
          </div>
        </>
      ) : null}
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
