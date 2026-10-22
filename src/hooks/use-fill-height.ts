import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Height that takes an element from where it starts down to the bottom of the page
 * panel (less the page's own bottom padding), so a full-height layout fits whatever
 * sits above it: the page header, a billing banner, a wrapped title. Null until
 * measured or when there is no page panel.
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>, enabled = true) {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const panel = el?.closest<HTMLElement>('[data-testid="page-panel"]');
    if (!enabled || !el || !panel) {
      setHeight(null);
      return;
    }
    const main = el.closest("main");
    const measure = () => {
      const padding = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      // Below the desktop breakpoint the panel is not a scroll box; the window scrolls.
      if (getComputedStyle(panel).overflowY === "visible") {
        const top = el.getBoundingClientRect().top + window.scrollY;
        setHeight(Math.floor(window.innerHeight - top - padding));
        return;
      }
      const offset =
        el.getBoundingClientRect().top -
        panel.getBoundingClientRect().top -
        panel.clientTop +
        panel.scrollTop;
      setHeight(Math.floor(panel.clientHeight - offset - padding));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    for (const sibling of Array.from(el.parentElement?.children ?? [])) {
      if (sibling !== el) observer.observe(sibling);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, enabled]);

  return height;
}
