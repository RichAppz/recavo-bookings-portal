import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scrollEdges, swipeDirection } from "./swipe.ts";

const free = { atStart: true, atEnd: true };

describe("swipeDirection", () => {
  it("pages forward on a swipe to the left and back on a swipe to the right", () => {
    assert.equal(swipeDirection({ dx: -80, dy: 4, ...free }), 1);
    assert.equal(swipeDirection({ dx: 80, dy: -4, ...free }), -1);
  });

  it("ignores short or mostly vertical movements", () => {
    assert.equal(swipeDirection({ dx: -30, dy: 0, ...free }), null);
    assert.equal(swipeDirection({ dx: -60, dy: 50, ...free }), null);
    assert.equal(swipeDirection({ dx: 60, dy: -45, ...free }), null);
  });

  it("only pages when the scroller underneath was already at that edge", () => {
    const middle = { atStart: false, atEnd: false };
    assert.equal(swipeDirection({ dx: -80, dy: 0, ...middle }), null);
    assert.equal(swipeDirection({ dx: 80, dy: 0, ...middle }), null);
    assert.equal(swipeDirection({ dx: -80, dy: 0, atStart: false, atEnd: true }), 1);
    assert.equal(swipeDirection({ dx: 80, dy: 0, atStart: false, atEnd: true }), null);
    assert.equal(swipeDirection({ dx: 80, dy: 0, atStart: true, atEnd: false }), -1);
    assert.equal(swipeDirection({ dx: -80, dy: 0, atStart: true, atEnd: false }), null);
  });

  it("honours a custom threshold", () => {
    assert.equal(swipeDirection({ dx: -40, dy: 0, ...free }, 32), 1);
  });
});

describe("scrollEdges", () => {
  it("treats something that cannot scroll sideways as at both edges", () => {
    assert.deepEqual(scrollEdges({ scrollLeft: 0, clientWidth: 390, scrollWidth: 390 }), free);
    assert.deepEqual(scrollEdges({ scrollLeft: 0, clientWidth: 390, scrollWidth: 390.6 }), free);
  });

  it("reports the edges of a sideways scroller with a pixel of slack", () => {
    assert.deepEqual(scrollEdges({ scrollLeft: 0, clientWidth: 390, scrollWidth: 552 }), {
      atStart: true,
      atEnd: false,
    });
    assert.deepEqual(scrollEdges({ scrollLeft: 100, clientWidth: 390, scrollWidth: 552 }), {
      atStart: false,
      atEnd: false,
    });
    assert.deepEqual(scrollEdges({ scrollLeft: 161.5, clientWidth: 390, scrollWidth: 552 }), {
      atStart: false,
      atEnd: true,
    });
  });
});
