import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emailReturnUrl } from "./email-redirect.ts";

describe("emailReturnUrl", () => {
  it("returns to the origin and page the person is on, never the Site URL", () => {
    assert.equal(
      emailReturnUrl({
        origin: "https://book.recavo.app",
        pathname: "/conrad-k-fitness",
        search: "?offer=ABCD",
      }),
      "https://book.recavo.app/conrad-k-fitness?offer=ABCD",
    );
    assert.equal(
      emailReturnUrl({ origin: "https://bookings.recavo.app", pathname: "/login", search: "" }),
      "https://bookings.recavo.app/login",
    );
  });
});
