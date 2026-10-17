import assert from "node:assert/strict";
import { test } from "node:test";

import { PDF_MAX_ZOOM, PDF_MIN_ZOOM, nextZoom } from "./pdf-zoom.ts";

test("steps up through the ladder and stops at the top", () => {
  assert.equal(nextZoom(1, 1), 1.5);
  assert.equal(nextZoom(1.5, 1), 2);
  assert.equal(nextZoom(2, 1), 3);
  assert.equal(nextZoom(PDF_MAX_ZOOM, 1), PDF_MAX_ZOOM);
});

test("steps down and never goes below fit width", () => {
  assert.equal(nextZoom(3, -1), 2);
  assert.equal(nextZoom(1.5, -1), 1);
  assert.equal(nextZoom(PDF_MIN_ZOOM, -1), PDF_MIN_ZOOM);
});

test("an unknown zoom restarts from fit width", () => {
  assert.equal(nextZoom(1.37, 1), 1.5);
  assert.equal(nextZoom(1.37, -1), 1);
});
