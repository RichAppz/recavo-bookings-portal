import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicPackageLink } from "@/lib/api/hooks";
import {
  landingSectionOrder,
  offersSectionVisible,
  offersToShow,
  sampleOffer,
} from "./client-offers.ts";

function link(code: string, name = code): PublicPackageLink {
  return { link: { code, name }, services: [], packages: [] };
}

describe("offersToShow", () => {
  it("is empty for a guest with no link", () => {
    assert.deepEqual(offersToShow(null, undefined), []);
    assert.deepEqual(offersToShow(undefined, []), []);
  });

  it("puts the link they arrived by first and never repeats a code", () => {
    const out = offersToShow(link("SPRING"), [link("VIP"), link("SPRING", "dup"), link("NEW")]);
    assert.deepEqual(
      out.map((o) => o.link.code),
      ["SPRING", "VIP", "NEW"],
    );
    assert.equal(out[0]!.link.name, "SPRING");
  });

  it("lists a signed-in client's offers on their own", () => {
    assert.deepEqual(
      offersToShow(null, [link("A"), link("B")]).map((o) => o.link.code),
      ["A", "B"],
    );
  });
});

describe("offersSectionVisible", () => {
  it("hides the section for a guest with nothing to show", () => {
    assert.equal(offersSectionVisible({ enabled: true, offers: [], preview: false }), false);
  });

  it("shows it once there is an offer", () => {
    assert.equal(
      offersSectionVisible({ enabled: true, offers: [link("A")], preview: false }),
      true,
    );
  });

  it("respects the business turning it off, even with offers", () => {
    assert.equal(
      offersSectionVisible({ enabled: false, offers: [link("A")], preview: false }),
      false,
    );
    assert.equal(offersSectionVisible({ enabled: false, offers: [], preview: true }), false);
  });

  it("always shows it in the editor's preview so the business can place it", () => {
    assert.equal(offersSectionVisible({ enabled: true, offers: [], preview: true }), true);
  });

  it("a private offer link shows its offer even when the section is switched off", () => {
    assert.equal(
      offersSectionVisible({
        enabled: false,
        offers: [link("A")],
        preview: false,
        offerOnly: true,
      }),
      true,
    );
    assert.equal(
      offersSectionVisible({ enabled: true, offers: [], preview: false, offerOnly: true }),
      false,
    );
  });
});

describe("landingSectionOrder — a private offer link is the page", () => {
  const order = ["about", "sessions", "offers", "staff", "reviews", "location"] as const;

  it("keeps the business's order on the ordinary page", () => {
    assert.deepEqual(landingSectionOrder(order, false), [...order]);
  });

  it("leads with the offer and drops the catalogue, keeping the rest in order", () => {
    assert.deepEqual(landingSectionOrder(order, true), [
      "offers",
      "about",
      "staff",
      "reviews",
      "location",
    ]);
  });

  it("still shows the offer when the business had the section off", () => {
    assert.deepEqual(landingSectionOrder(["sessions", "about"], true), ["offers", "about"]);
  });
});

describe("sampleOffer", () => {
  it("uses the first session and package the business has", () => {
    const service = {
      id: "s1",
      name: "PT session",
      description: null,
      category: null,
      durationMinutes: 60,
      basePriceMinor: 5000,
      currency: "GBP",
      colour: null,
    };
    const pkg = {
      id: "p1",
      name: "5 pack",
      description: null,
      priceMinor: 20000,
      currency: "GBP",
      creditsIssued: 5,
      eligibleServiceIds: [],
      validity: { kind: "days" as const, amount: 90 },
    };
    const out = sampleOffer([service], [pkg]);
    assert.equal(out.services.length, 1);
    assert.equal(out.packages.length, 1);
    assert.equal(out.link.discount?.kind, "percent");
  });

  it("still has a heading when the catalogue is empty", () => {
    const out = sampleOffer([], []);
    assert.ok(out.link.name);
    assert.deepEqual(out.services, []);
  });
});
