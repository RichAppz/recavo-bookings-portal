import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alertCount, arrangeMenu, moveFavourite, placeFavourite, toggleFavourite } from "./menu.ts";

const items = [
  { to: "/", label: "Overview" },
  { to: "/calendar", label: "Calendar" },
  { to: "/bookings", label: "Bookings" },
  { to: "/clients", label: "Clients" },
  { to: "/services", label: "Sessions" },
  { to: "/payments", label: "Payments" },
  { to: "/settings", label: "Settings" },
];

describe("arrangeMenu", () => {
  it("puts Overview on top and groups the rest by job, dropping empty sections", () => {
    const menu = arrangeMenu(items, []);
    assert.equal(menu.overview?.to, "/");
    assert.deepEqual(menu.favourites, []);
    assert.deepEqual(
      menu.sections.map((s) => [s.key, s.items.map((i) => i.to)]),
      [
        ["schedule", ["/calendar", "/bookings"]],
        ["clients", ["/clients"]],
        ["offer", ["/services"]],
        ["money", ["/payments"]],
      ],
    );
  });

  it("moves favourites out of their sections, keeps the saved order and skips hidden ones", () => {
    const menu = arrangeMenu(items, ["/payments", "/reports", "/calendar"]);
    assert.deepEqual(
      menu.favourites.map((i) => i.to),
      ["/payments", "/calendar"],
    );
    assert.deepEqual(
      menu.sections.map((s) => [s.key, s.items.map((i) => i.to)]),
      [
        ["schedule", ["/bookings"]],
        ["clients", ["/clients"]],
        ["offer", ["/services"]],
      ],
    );
  });

  it("never lets Overview be a favourite", () => {
    assert.deepEqual(arrangeMenu(items, ["/"]).favourites, []);
    assert.equal(arrangeMenu(items, ["/"]).overview?.to, "/");
  });
});

describe("favourites", () => {
  it("toggle adds to the end and removes in place", () => {
    assert.deepEqual(toggleFavourite([], "/calendar"), ["/calendar"]);
    assert.deepEqual(toggleFavourite(["/calendar", "/clients"], "/calendar"), ["/clients"]);
  });

  it("move swaps with a neighbour and ignores the edges", () => {
    const favs = ["/a", "/b", "/c"];
    assert.deepEqual(moveFavourite(favs, "/b", "up"), ["/b", "/a", "/c"]);
    assert.deepEqual(moveFavourite(favs, "/b", "down"), ["/a", "/c", "/b"]);
    assert.deepEqual(moveFavourite(favs, "/a", "up"), favs);
    assert.deepEqual(moveFavourite(favs, "/c", "down"), favs);
    assert.deepEqual(moveFavourite(favs, "/zzz", "down"), favs);
  });

  it("place drops the moving item in front of the target", () => {
    const favs = ["/a", "/b", "/c", "/d"];
    assert.deepEqual(placeFavourite(favs, "/d", "/b"), ["/a", "/d", "/b", "/c"]);
    assert.deepEqual(placeFavourite(favs, "/a", "/d"), ["/b", "/c", "/a", "/d"]);
    assert.deepEqual(placeFavourite(favs, "/a", "/a"), favs);
    assert.deepEqual(placeFavourite(favs, "/a", "/nope"), favs);
  });
});

describe("alertCount", () => {
  it("counts amber and mint badges, not grey or missing ones", () => {
    assert.equal(
      alertCount([
        { tone: "amber", text: "7" },
        { tone: "mint", text: "5" },
        { tone: "grey", text: "1 left" },
        null,
        undefined,
      ]),
      2,
    );
    assert.equal(alertCount([]), 0);
  });
});
