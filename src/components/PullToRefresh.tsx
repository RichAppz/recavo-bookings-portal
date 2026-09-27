import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/native";
import { cn } from "@/lib/utils";

/** How far (px) the finger must travel past the top before letting go refreshes. */
const THRESHOLD = 72;
/** Cap on how far the indicator itself follows the finger. */
const MAX_PULL = 110;
/** Keep the spinner up long enough to register even when the refetch is instant. */
const MIN_SPIN_MS = 500;

/**
 * Pull-to-refresh for the mobile app. The pages are the document's own scroll
 * view, so we watch touches on `window`: a drag that starts with the page at the
 * very top and moves down past the threshold refetches every active query and
 * re-runs route loaders. Touches inside dialogs, sheets or an inner scroller
 * that isn't at its top are left alone so those keep their own scrolling.
 *
 * Renders nothing on the web; browsers either already do this or shouldn't.
 */
export function PullToRefresh() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => setEnabled(isNativeApp()), []);
  return enabled ? <PullToRefreshImpl /> : null;
}

function PullToRefreshImpl() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pull, setPullState] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const setPull = (value: number) => {
      pullRef.current = value;
      setPullState(value);
    };

    const refresh = async () => {
      refreshingRef.current = true;
      setRefreshing(true);
      setPull(THRESHOLD * 0.8);
      const started = Date.now();
      try {
        await Promise.all([queryClient.invalidateQueries(), router.invalidate()]);
      } finally {
        const wait = MIN_SPIN_MS - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        refreshingRef.current = false;
        setRefreshing(false);
        setPull(0);
      }
    };

    const onStart = (e: TouchEvent) => {
      start.current = null;
      if (refreshingRef.current || e.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      const target = e.target as Element | null;
      if (!target) return;
      // Overlays own their gestures; so does any inner scroller that has room to scroll up.
      if (target.closest('[role="dialog"], [data-bottom-sheet-viewport]')) return;
      for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
        const { overflowY } = getComputedStyle(el);
        if ((overflowY === "auto" || overflowY === "scroll") && el.scrollTop > 0) return;
      }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dx = e.touches[0].clientX - start.current.x;
      const dy = e.touches[0].clientY - start.current.y;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        if (dy < -8 || Math.abs(dx) > 24) start.current = null;
        setPull(0);
        return;
      }
      // Ease off as the finger travels so the indicator feels tethered.
      setPull(Math.min(MAX_PULL, dy * 0.6));
    };

    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      if (pullRef.current >= THRESHOLD * 0.6) void refresh();
      else setPull(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [queryClient, router]);

  const visible = refreshing || pull > 4;
  const progress = Math.min(1, pull / (THRESHOLD * 0.6));

  return (
    <div
      aria-live="polite"
      aria-label={refreshing ? "Refreshing" : undefined}
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-full border bg-background shadow-md",
          refreshing
            ? "transition-transform duration-200"
            : pull === 0 && "transition-all duration-200",
        )}
        style={{
          opacity: visible ? 1 : 0,
          transform: `translateY(${visible ? Math.max(0, pull - 32) : -48}px) scale(${
            visible ? 0.7 + 0.3 * progress : 0.7
          })`,
        }}
      >
        <Loader2
          className={cn("size-4 text-primary", refreshing && "animate-spin")}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </div>
    </div>
  );
}
