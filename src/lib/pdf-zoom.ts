/** Zoom steps for the enlarged PDF view; 1 = the page fits the viewer's width. */
export const PDF_ZOOM_STEPS = [1, 1.5, 2, 3] as const;

export const PDF_MIN_ZOOM: number = PDF_ZOOM_STEPS[0];
export const PDF_MAX_ZOOM: number = PDF_ZOOM_STEPS[PDF_ZOOM_STEPS.length - 1] ?? 1;

/** The next step up or down from `current`, clamped to the ends; unknown values restart at fit. */
export function nextZoom(current: number, direction: 1 | -1): number {
  const steps: readonly number[] = PDF_ZOOM_STEPS;
  const index = steps.indexOf(current);
  const at = index === -1 ? 0 : index;
  return steps[Math.min(steps.length - 1, Math.max(0, at + direction))] ?? 1;
}
