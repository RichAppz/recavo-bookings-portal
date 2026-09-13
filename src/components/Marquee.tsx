import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Text that slides back and forth when it is wider than its box, instead of being
 * cut off. Used for calendar bars, where "All day · R1 2 CAR · Full valet" on a
 * one-day cell would otherwise lose everything after the first word or two.
 *
 * Nothing moves while the content fits. Speed scales with how far there is to
 * travel so long labels don't race; `prefers-reduced-motion` turns the slide off
 * (via `motion-safe:`) and the text simply clips.
 */
export function Marquee({ children, className }: { children: ReactNode; className?: string }) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => setOverflow(Math.max(0, i.scrollWidth - o.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [children]);

  const style: CSSProperties | undefined =
    overflow > 0
      ? ({
          "--marquee-shift": `-${overflow + 6}px`,
          // ~30px/s, but never so short it flickers.
          "--marquee-duration": `${Math.max(4, overflow / 30)}s`,
        } as CSSProperties)
      : undefined;

  return (
    <span ref={outer} className={cn("min-w-0 flex-1 overflow-hidden whitespace-nowrap", className)}>
      <span
        ref={inner}
        style={style}
        className={cn(
          "inline-flex items-center gap-1.5 will-change-transform",
          overflow > 0 && "motion-safe:animate-marquee",
        )}
      >
        {children}
      </span>
    </span>
  );
}
