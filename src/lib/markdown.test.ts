import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { markdownToPlainText, parsePolicyContent } from "./markdown.ts";

const SEEDED = [
  "<!-- STATUS: PENDING_COUNSEL_REVIEW -->",
  "# PLACEHOLDER — not counsel-approved",
  "",
  "Seed version: `2026-08-01-placeholder`.",
  "Do **not** treat it as final UK GDPR wording.",
  "",
  "# Terms and conditions (platform template)",
  "",
  "## 1. Parties",
  "These terms govern use of booking services.",
  "",
].join("\n");

describe("parsePolicyContent", () => {
  it("lifts the status comment out of the body", () => {
    const { reviewStatus, body } = parsePolicyContent(SEEDED);
    assert.equal(reviewStatus, "pending_counsel_review");
    assert.ok(!body.includes("<!--"));
    assert.ok(!body.includes("STATUS"));
  });

  it("drops the counsel banner but keeps the policy itself", () => {
    const { body } = parsePolicyContent(SEEDED);
    assert.ok(body.startsWith("# Terms and conditions (platform template)"));
    assert.ok(body.includes("## 1. Parties"));
    assert.ok(!body.includes("PLACEHOLDER"));
  });

  it("keeps the banner when nothing follows it", () => {
    const onlyBanner =
      "<!-- STATUS: PENDING_COUNSEL_REVIEW -->\n# PLACEHOLDER — not approved\n\nStub.";
    const { body } = parsePolicyContent(onlyBanner);
    assert.ok(body.includes("PLACEHOLDER"));
  });

  it("leaves counsel-approved content untouched", () => {
    const approved = "# Cancellation policy\n\nGive 24 hours notice.";
    assert.deepEqual(parsePolicyContent(approved), {
      reviewStatus: null,
      body: approved,
    });
  });

  it("handles missing content", () => {
    assert.deepEqual(parsePolicyContent(null), { reviewStatus: null, body: "" });
  });
});

describe("markdownToPlainText", () => {
  it("flattens syntax and comments to one line", () => {
    assert.equal(
      markdownToPlainText("<!-- x -->\n# Title\n\n- **bold** item\n- [link](https://a.test)"),
      "Title bold item link",
    );
  });
});
