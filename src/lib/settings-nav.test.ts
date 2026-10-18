import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SETTINGS_PAGE,
  SETTINGS_NAV,
  SETTINGS_PAGE_KEYS,
  isSettingsPageKey,
  legacySettingsTarget,
  settingsAttention,
  settingsItem,
  settingsPath,
  visibleSettingsNav,
} from "./settings-nav.ts";

const everything = { canReadAudit: true, canManageBilling: true };

describe("settings nav model", () => {
  it("has unique page keys and the spec's six groups in order", () => {
    assert.deepEqual(
      SETTINGS_NAV.map((g) => g.label),
      ["Your account", "Business", "How it works", "Clients", "Money", "Records"],
    );
    assert.equal(new Set(SETTINGS_PAGE_KEYS).size, SETTINGS_PAGE_KEYS.length);
    assert.equal(DEFAULT_SETTINGS_PAGE, "business");
  });

  it("recognises page keys and builds paths", () => {
    assert.equal(isSettingsPageKey("get-paid"), true);
    assert.equal(isSettingsPageKey("payments"), false);
    assert.equal(isSettingsPageKey(undefined), false);
    assert.equal(settingsPath("plan"), "/settings/plan");
    assert.equal(settingsItem("tax").label, "Tax and address");
  });

  it("hides gated pages from people without the permission", () => {
    const visible = visibleSettingsNav({ canReadAudit: false, canManageBilling: false });
    const keys = visible.flatMap((g) => g.items.map((i) => i.key));
    assert.ok(!keys.includes("activity"));
    assert.ok(!keys.includes("plan"));
    // Empty groups are dropped rather than shown as a bare heading.
    assert.ok(!visible.some((g) => g.key === "records"));
    assert.ok(!visible.some((g) => g.key === "money" && g.items.length === 0));
    assert.ok(keys.includes("get-paid"));
  });

  it("search matches labels, hints and setting names inside pages", () => {
    const vat = visibleSettingsNav(everything, "VAT").flatMap((g) => g.items.map((i) => i.key));
    assert.deepEqual(vat, ["tax"]);
    const tz = visibleSettingsNav(everything, "time zone").flatMap((g) =>
      g.items.map((i) => i.key),
    );
    assert.ok(tz.includes("profile"));
    assert.ok(tz.includes("business"));
    assert.deepEqual(visibleSettingsNav(everything, "zzzz"), []);
  });

  it("maps every old ?tab= link to its new page", () => {
    assert.deepEqual(legacySettingsTarget({ tab: "account" }), { page: "profile" });
    assert.deepEqual(legacySettingsTarget({ tab: "security" }), { page: "security" });
    assert.deepEqual(legacySettingsTarget({ tab: "business" }), { page: "business" });
    assert.deepEqual(legacySettingsTarget({ tab: "configuration" }), { page: "booking-rules" });
    assert.deepEqual(legacySettingsTarget({ tab: "team" }), { page: "team" });
    assert.deepEqual(legacySettingsTarget({ tab: "policies" }), { page: "policies" });
    assert.deepEqual(legacySettingsTarget({ tab: "policies", assist: "1" }), {
      page: "policies",
      assist: true,
    });
    // The URL search parser hands `?assist=1` over as the number 1.
    assert.deepEqual(legacySettingsTarget({ tab: "policies", assist: 1 }), {
      page: "policies",
      assist: true,
    });
    assert.deepEqual(legacySettingsTarget({ tab: "policies", assist: true }), {
      page: "policies",
      assist: true,
    });
    assert.deepEqual(legacySettingsTarget({ tab: "privacy" }), {
      page: "policies",
      hash: "privacy",
    });
    assert.deepEqual(legacySettingsTarget({ tab: "notifications" }), { page: "client-messages" });
    assert.deepEqual(legacySettingsTarget({ tab: "audit" }), { page: "activity" });
    assert.deepEqual(legacySettingsTarget({ tab: "payments" }), { page: "get-paid" });
    assert.deepEqual(legacySettingsTarget({ tab: "billing" }), { page: "plan" });
    assert.deepEqual(legacySettingsTarget({}), { page: "business" });
    assert.deepEqual(legacySettingsTarget({ tab: "nonsense" }), { page: "business" });
  });

  it("puts amber dots where attention is needed", () => {
    assert.deepEqual(
      settingsAttention({ paymentsReady: true, paymentFailed: false, textCredits: "ok" }),
      {},
    );
    const out = settingsAttention({
      paymentsReady: false,
      paymentFailed: true,
      textCredits: "low",
    });
    assert.ok(out["get-paid"]);
    assert.match(out.plan ?? "", /payment/);
    assert.match(
      settingsAttention({ paymentsReady: true, paymentFailed: false, textCredits: "low" }).plan ??
        "",
      /running low/,
    );
    assert.match(
      settingsAttention({ paymentsReady: true, paymentFailed: false, textCredits: "empty" }).plan ??
        "",
      /out of/,
    );
  });
});
