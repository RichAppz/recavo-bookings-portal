/**
 * jsdom setup shared by every component test.
 *
 * jsdom implements a lot of the DOM but not the handful of browser APIs that
 * Radix (which every shadcn primitive is built on) reaches for on mount. Left
 * undefined they throw inside the component under test, which reads as a bug
 * in our code rather than a gap in the environment, so they are filled here
 * once instead of in each spec.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

for (const name of ["ResizeObserver", "IntersectionObserver"] as const) {
  if (!(name in window)) {
    (window as unknown as Record<string, unknown>)[name] = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
}

// Radix measures and scrolls popovers/selects into view; jsdom has neither.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// `input-otp` polls this on a timer to keep its fake caret over the right box.
// jsdom has no layout, so it does not implement it, and the throw lands on the
// timer rather than in a test — an unhandled error that fails the run while
// every assertion passes.
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

// A component that fires a fetch we forgot to stub should fail loudly rather
// than hang until the test times out with no clue as to which call it was.
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    throw new Error(`Unstubbed fetch in a component test: ${String(input)}`);
  }) as unknown as typeof fetch;
}
