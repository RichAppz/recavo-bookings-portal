import { useEffect, useState } from "react";

export type VisualViewportBox = {
  /** Height of the part of the page actually on screen, in CSS px. */
  height: number;
  /** How far the visible part sits below the layout viewport's top edge. */
  offsetTop: number;
};

/**
 * The visible part of the page, as opposed to the layout viewport `position: fixed`
 * measures against. On iOS the on-screen keyboard shrinks the former and leaves the
 * latter alone, so something pinned to `bottom: 0` ends up behind the keys. Sizing a
 * fixed container to this box keeps it on screen. Null until mounted, or where the
 * browser has no `visualViewport` — callers fall back to the plain fixed box.
 */
export function useVisualViewport(): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setBox({ height: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop) });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}
