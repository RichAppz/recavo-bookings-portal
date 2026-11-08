import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUiPreferences, samePreferences, withPreference } from "./ui-preferences.ts";

describe("parseUiPreferences", () => {
  it("keeps the known keys and drops everything else", () => {
    assert.deepEqual(
      parseUiPreferences({
        menuCollapsed: true,
        moreOpen: false,
        closedSections: ["money", "money", 3, ""],
        favourites: ["/calendar", "clients", "/calendar", "/clients"],
        theme: "dark",
      }),
      {
        menuCollapsed: true,
        moreOpen: false,
        closedSections: ["money"],
        favourites: ["/calendar", "/clients"],
      },
    );
  });

  it("treats junk as the defaults and leaves empty lists out", () => {
    assert.deepEqual(parseUiPreferences(null), {});
    assert.deepEqual(parseUiPreferences("x"), {});
    assert.deepEqual(parseUiPreferences({ favourites: [], closedSections: "money" }), {});
  });

  it("caps list lengths", () => {
    const many = Array.from({ length: 50 }, (_, i) => `/p${i}`);
    assert.equal(parseUiPreferences({ favourites: many }).favourites?.length, 40);
  });
});

describe("withPreference", () => {
  it("patches one key, removes a key set to undefined and re-validates", () => {
    const current = { menuCollapsed: true, favourites: ["/a"] };
    assert.deepEqual(withPreference(current, { moreOpen: true }), {
      menuCollapsed: true,
      moreOpen: true,
      favourites: ["/a"],
    });
    assert.deepEqual(withPreference(current, { menuCollapsed: undefined }), {
      favourites: ["/a"],
    });
    assert.deepEqual(withPreference(current, { favourites: [] }), { menuCollapsed: true });
  });
});

describe("samePreferences", () => {
  it("ignores key order and unknown keys", () => {
    assert.equal(
      samePreferences(
        { favourites: ["/a"], menuCollapsed: true },
        { menuCollapsed: true, favourites: ["/a"], ...({ x: 1 } as object) },
      ),
      true,
    );
    assert.equal(samePreferences({ favourites: ["/a"] }, { favourites: ["/b"] }), false);
  });
});
