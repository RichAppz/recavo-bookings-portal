import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inDisplayOrder } from "./service-categories.ts";

const s = (name: string, category: string | null) => ({ name, category });
const names = (items: { name: string }[]) => items.map((x) => x.name);

describe("inDisplayOrder", () => {
  it("puts uncategorised sessions after the groups, as the page lists them", () => {
    const services = [s("1-2-1", null), s("Group", "Group"), s("Girls group", "Group")];
    assert.deepEqual(names(inDisplayOrder(services)), ["Group", "Girls group", "1-2-1"]);
  });

  it("follows the saved category order", () => {
    const services = [s("A", "Alpha"), s("B", "Beta")];
    assert.deepEqual(names(inDisplayOrder(services, ["Beta", "Alpha"])), ["B", "A"]);
  });

  it("keeps the given order when there is nothing to group", () => {
    assert.deepEqual(names(inDisplayOrder([s("B", null), s("A", null)])), ["B", "A"]);
    assert.deepEqual(names(inDisplayOrder([s("B", "Only"), s("A", "Only")])), ["B", "A"]);
  });
});
