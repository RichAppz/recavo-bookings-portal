import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recallCameFrom, rememberCameFrom } from "./came-from.ts";
import { emailAppHref } from "./email-app.ts";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("came-from — the booking page the sign-in offers a way back to", () => {
  it("round-trips the page", () => {
    const s = fakeStorage();
    rememberCameFrom({ slug: "northside-strength", name: "Northside Strength" }, s);
    assert.deepEqual(recallCameFrom(s), { slug: "northside-strength", name: "Northside Strength" });
  });

  it("is nothing when there is no page, or the stored value is junk", () => {
    const s = fakeStorage();
    assert.equal(recallCameFrom(s), null);
    s.setItem("recavo:came-from", "not json");
    assert.equal(recallCameFrom(s), null);
    s.setItem("recavo:came-from", JSON.stringify({ slug: "", name: "x" }));
    assert.equal(recallCameFrom(s), null);
    assert.equal(recallCameFrom(null), null);
  });
});

describe("emailAppHref — Open email app on a phone only", () => {
  it("opens Mail on iOS and the email category on Android", () => {
    assert.equal(
      emailAppHref("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"),
      "message://",
    );
    assert.match(emailAppHref("Mozilla/5.0 (Linux; Android 14; Pixel 8)") ?? "", /^intent:\/\//);
  });

  it("offers nothing on a desktop", () => {
    assert.equal(emailAppHref("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"), null);
    assert.equal(emailAppHref("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), null);
  });
});
