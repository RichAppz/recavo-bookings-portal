import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Check, Info, Loader2, X } from "lucide-react";
import { Toaster as Sonner } from "sonner";

import { TOAST_DURATION_MS } from "@/lib/toast";

/** Sonner's fixed card width; used to decide whether a toast still fits beside an open drawer. */
const TOAST_WIDTH = 356;
const EDGE_GAP = 24;

/**
 * Width of an open right-hand drawer (Sheet side="right"), or 0. Toasts shift left by
 * this much so they never sit over a form someone is filling in. Only applies when a
 * toast still fits in the space that is left; on a phone the drawer covers most of
 * the screen and toasts stay full width above it.
 */
function useSideDrawerInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const drawer = document.querySelector<HTMLElement>(
        '[data-sheet-side="right"][data-state="open"]',
      );
      // offsetWidth ignores the slide-in transform, so this is the final width from the first frame.
      const width = drawer?.offsetWidth ?? 0;
      const room = window.innerWidth - width;
      setInset(width > 0 && room >= TOAST_WIDTH + EDGE_GAP * 2 ? width : 0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return inset;
}

/**
 * Keeps a finger that lands on a toast out of the page's scroll view. Sonner sets
 * `touch-action: none` on each toast, but WebKit (Safari and the Capacitor WKWebView)
 * still hands a vertical pan to the scroller and cancels the pointer sequence unless
 * `touchmove` is prevented from a non-passive listener — so a swipe up nudged the
 * card and then stuck, while a swipe right worked. Horizontal swipes are unaffected.
 */
function useToastTouchGuard() {
  useEffect(() => {
    let onToast = false;
    const start = (e: TouchEvent) => {
      const target = e.target as Element | null;
      onToast = Boolean(target?.closest?.("[data-sonner-toast]"));
    };
    const move = (e: TouchEvent) => {
      if (onToast && e.cancelable) e.preventDefault();
    };
    const end = () => {
      onToast = false;
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", end, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, []);
}

/** Coloured disc with a soft halo, tinted by the toast's type via --toast-accent. */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-9 place-items-center rounded-full bg-(--toast-accent)/25">
      <span className="grid size-6 place-items-center rounded-full bg-(--toast-accent) text-white">
        {children}
      </span>
    </span>
  );
}

/**
 * App-wide toast host. Dark card, slide in from the right, dismissable by the X or a
 * swipe up or right, with a timer bar showing how long is left. Sits top-right, clear
 * of the notch/Dynamic Island in the mobile app, and steps left of any open side drawer.
 */
const Toaster = () => {
  const drawerInset = useSideDrawerInset();
  useToastTouchGuard();

  return (
    <Sonner
      className="toaster group"
      position="top-right"
      // Up (off the top edge) or right (the way it came in). Explicit rather than
      // sonner's position-derived default so a position change cannot silently drop one.
      swipeDirections={["top", "right"]}
      expand
      closeButton
      gap={10}
      duration={TOAST_DURATION_MS}
      offset={{
        top: "calc(env(safe-area-inset-top, 0px) + 24px)",
        right: drawerInset + EDGE_GAP,
      }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      icons={{
        success: (
          <Glyph>
            <Check className="size-3.5" strokeWidth={3} />
          </Glyph>
        ),
        error: (
          <Glyph>
            <X className="size-3.5" strokeWidth={3} />
          </Glyph>
        ),
        warning: (
          <Glyph>
            <AlertTriangle className="size-3.5" strokeWidth={2.5} />
          </Glyph>
        ),
        info: (
          <Glyph>
            <Info className="size-3.5" strokeWidth={2.5} />
          </Glyph>
        ),
        loading: (
          <Glyph>
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} />
          </Glyph>
        ),
        close: <X className="size-[18px]" strokeWidth={2.25} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-(--width) items-center gap-3 rounded-2xl py-3 pl-3 pr-2 text-white ring-1 ring-white/10 ring-inset",
          icon: "relative grid size-9 shrink-0 place-items-center",
          content: "flex min-w-0 flex-1 flex-col py-0.5",
          title: "text-[15px] font-medium leading-[1.35]",
          description: "mt-0.5 text-[13px] leading-snug text-white/70",
          closeButton:
            "order-last grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
          actionButton:
            "h-7 shrink-0 cursor-pointer rounded-lg bg-white px-2.5 text-xs font-semibold text-neutral-900 transition-colors hover:bg-white/90",
          cancelButton:
            "h-7 shrink-0 cursor-pointer rounded-lg bg-white/10 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/20",
        },
      }}
    />
  );
};

export { Toaster };
