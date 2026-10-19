import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  flickDirection,
  followOffset,
  neighbourOffset,
  PAGE_GAP,
  pageStride,
  releaseVelocity,
  scrollEdges,
  swipeAxis,
  swipeDirection,
} from "./swipe.ts";

const free = { atStart: true, atEnd: true };

describe("swipeAxis", () => {
  it("waits for the finger to move past the slop", () => {
    assert.equal(swipeAxis(0, 0), null);
    assert.equal(swipeAxis(5, -6), null);
  });

  it("locks sideways only when the drag is clearly sideways", () => {
    assert.equal(swipeAxis(12, 2), "x");
    assert.equal(swipeAxis(-9, 0), "x");
    assert.equal(swipeAxis(10, 8), "y");
    assert.equal(swipeAxis(0, 14), "y");
  });
});

describe("followOffset", () => {
  it("follows the finger when nothing underneath is panning", () => {
    assert.equal(followOffset({ dx: -37, dy: 0, ...free }), -37);
    assert.equal(followOffset({ dx: 22, dy: 0, ...free }), 22);
    assert.equal(followOffset({ dx: 0, dy: 0, ...free }), 0);
  });

  it("stays put while the scroller underneath still has room that way", () => {
    assert.equal(followOffset({ dx: -37, dy: 0, atStart: true, atEnd: false }), 0);
    assert.equal(followOffset({ dx: 22, dy: 0, atStart: false, atEnd: true }), 0);
    assert.equal(followOffset({ dx: -37, dy: 0, atStart: false, atEnd: true }), -37);
    assert.equal(followOffset({ dx: 22, dy: 0, atStart: true, atEnd: false }), 22);
  });
});

describe("releaseVelocity", () => {
  it("measures the last stretch of movement before the finger lifted", () => {
    const samples = [
      { t: 0, x: 100 },
      { t: 300, x: 110 },
      { t: 330, x: 130 },
      { t: 360, x: 150 },
    ];
    // Only the last 60ms count: 40px in 60ms, not 50px in 360ms.
    assert.ok(Math.abs(releaseVelocity(samples, 370) - 40 / 60) < 1e-9);
  });

  it("reads zero when the finger paused before lifting, or barely moved", () => {
    const fast = [
      { t: 0, x: 100 },
      { t: 20, x: 160 },
    ];
    assert.equal(releaseVelocity(fast, 400), 0);
    assert.equal(releaseVelocity([{ t: 0, x: 100 }], 10), 0);
    assert.equal(releaseVelocity([], 10), 0);
  });

  it("is signed like the movement", () => {
    assert.ok(
      releaseVelocity(
        [
          { t: 0, x: 200 },
          { t: 40, x: 160 },
        ],
        50,
      ) < 0,
    );
  });
});

describe("flickDirection", () => {
  it("pages on a short, fast flick in the same direction", () => {
    assert.equal(flickDirection({ dx: -24, dy: 2, ...free }, -0.8), 1);
    assert.equal(flickDirection({ dx: 30, dy: 0, ...free }, 0.5), -1);
  });

  it("ignores slow, tiny, reversed or vertical flicks", () => {
    assert.equal(flickDirection({ dx: -24, dy: 2, ...free }, -0.2), null);
    assert.equal(flickDirection({ dx: -10, dy: 0, ...free }, -1), null);
    assert.equal(flickDirection({ dx: -24, dy: 0, ...free }, 0.9), null);
    assert.equal(flickDirection({ dx: -24, dy: 30, ...free }, -0.9), null);
  });

  it("keeps the edge rule of a normal swipe", () => {
    assert.equal(flickDirection({ dx: -24, dy: 0, atStart: true, atEnd: false }, -1), null);
    assert.equal(flickDirection({ dx: -24, dy: 0, atStart: false, atEnd: true }, -1), 1);
  });
});

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

describe("pageStride / neighbourOffset", () => {
  it("leaves a gap of background between pages", () => {
    assert.equal(PAGE_GAP, 16);
    assert.equal(pageStride(358), 374);
    assert.equal(pageStride(358, 12), 370);
    assert.equal(pageStride(0), 0);
  });

  it("draws the neighbours a page plus the gap either side of the live page", () => {
    assert.equal(neighbourOffset(0, 1, 358), 374);
    assert.equal(neighbourOffset(0, -1, 358), -374);
    assert.equal(neighbourOffset(-112, 1, 358), 262);
    assert.equal(neighbourOffset(80, -1, 358), -294);
  });

  it("starts the incoming page exactly where its preview sat", () => {
    for (const from of [-200, -112, -3.5, 0, 47, 150]) {
      for (const dir of [1, -1] as const) {
        const preview = neighbourOffset(from, dir, 358);
        const ghostEnd = neighbourOffset(0, dir === 1 ? -1 : 1, 358);
        // The live page lands at 0 and the ghost one stride the other way, so the
        // gap between them never changes during the slide.
        assert.equal(preview - from, dir * 374);
        assert.equal(0 - ghostEnd, dir * 374);
      }
    }
  });
});
