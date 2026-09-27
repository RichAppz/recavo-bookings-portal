import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RELEASE_NOTES } from "../content/release-notes.ts";
import {
  latestReleaseDate,
  unseenReleases,
  validateReleaseNotes,
  type ReleaseNote,
} from "./release-notes.ts";

const notes: ReleaseNote[] = [
  { date: "2026-09-26", title: "c", items: [{ kind: "new", text: "x" }] },
  { date: "2026-09-25", title: "b", items: [{ kind: "fixed", text: "y" }] },
  { date: "2026-09-19", title: "a", items: [{ kind: "improved", text: "z" }] },
];

describe("release notes", () => {
  it("the shipped log is well-formed and newest-first", () => {
    assert.deepEqual(validateReleaseNotes(RELEASE_NOTES), []);
    assert.ok(RELEASE_NOTES.length > 0);
  });

  it("flags out-of-order, duplicate and empty entries", () => {
    const bad: ReleaseNote[] = [
      { date: "2026-09-19", title: "a", items: [{ kind: "new", text: "x" }] },
      { date: "2026-09-25", title: "", items: [] },
      { date: "2026-09-25", title: "dup", items: [{ kind: "new", text: " " }] },
      { date: "26/09/2026", title: "fmt", items: [{ kind: "new", text: "x" }] },
    ];
    const problems = validateReleaseNotes(bad);
    assert.ok(problems.some((p) => p.includes("out of order")));
    assert.ok(problems.some((p) => p.includes("duplicate")));
    assert.ok(problems.some((p) => p.includes("missing title")));
    assert.ok(problems.some((p) => p.includes("no items")));
    assert.ok(problems.some((p) => p.includes("empty item")));
    assert.ok(problems.some((p) => p.includes("not YYYY-MM-DD")));
  });

  it("counts entries newer than the last one seen", () => {
    assert.equal(latestReleaseDate(notes), "2026-09-26");
    assert.equal(unseenReleases(notes, null), 3);
    assert.equal(unseenReleases(notes, ""), 3);
    assert.equal(unseenReleases(notes, "2026-09-19"), 2);
    assert.equal(unseenReleases(notes, "2026-09-25"), 1);
    assert.equal(unseenReleases(notes, "2026-09-26"), 0);
    assert.equal(unseenReleases(notes, "2027-01-01"), 0);
    assert.equal(latestReleaseDate([]), "");
  });
});
