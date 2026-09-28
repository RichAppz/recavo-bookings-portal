import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasTakingsBreakdown, takingsRows, takingsSummary } from "./takings.ts";

type Revenue = Parameters<typeof takingsRows>[0];
type MethodTotal = NonNullable<Revenue["byMethod"]>[number];

function revenue(byMethod: MethodTotal[]): Revenue {
  const totals = byMethod.reduce(
    (acc, m) => ({
      grossMinor: acc.grossMinor + m.grossMinor,
      refundedMinor: acc.refundedMinor + m.refundedMinor,
      disputedMinor: acc.disputedMinor + m.disputedMinor,
      netMinor: acc.netMinor + m.netMinor,
    }),
    { grossMinor: 0, refundedMinor: 0, disputedMinor: 0, netMinor: 0 },
  );
  return { ...totals, byMethod };
}

/**
 * `m` is a plain string rather than the generated union, and cast on the way in, because a
 * deployed portal is older than the API it talks to: the enum can grow a value this build
 * has never heard of, and the "crypto" case below is exactly that situation.
 */
const method = (
  m: string,
  grossMinor: number,
  over: { refundedMinor?: number; count?: number } = {},
): MethodTotal => ({
  method: m as MethodTotal["method"],
  grossMinor,
  refundedMinor: over.refundedMinor ?? 0,
  disputedMinor: 0,
  netMinor: grossMinor - (over.refundedMinor ?? 0),
  count: over.count ?? 1,
});

describe("takingsRows", () => {
  it("is empty when nothing was taken", () => {
    assert.deepEqual(takingsRows(revenue([])), []);
  });

  it("labels each method for the person who took the money", () => {
    const rows = takingsRows(
      revenue([
        method("card_online", 10_000),
        method("card_manual", 5000),
        method("cash", 3000),
        method("bank_transfer", 2000),
        method("other", 1000),
      ]),
    );

    assert.deepEqual(
      rows.map((r) => r.label),
      ["Card (online)", "Card machine", "Cash", "Bank transfer", "Other"],
    );
  });

  it("gives each method its share of gross, summing to one", () => {
    const rows = takingsRows(revenue([method("cash", 7500), method("card_online", 2500)]));

    assert.deepEqual(
      rows.map((r) => r.share),
      [0.75, 0.25],
    );
    assert.equal(
      rows.reduce((sum, r) => sum + r.share, 0),
      1,
    );
  });

  it("keeps the order the API sent rather than sorting by value", () => {
    // Fixed order means a legend does not reshuffle when the date range changes.
    const rows = takingsRows(revenue([method("card_online", 100), method("cash", 90_000)]));

    assert.deepEqual(
      rows.map((r) => r.method),
      ["card_online", "cash"],
    );
  });

  it("keeps an unrecognised method visible under its own name", () => {
    // Money we cannot label is still money; dropping it would make the split stop
    // adding up to the total.
    const rows = takingsRows(revenue([method("crypto", 2000)]));

    assert.deepEqual(rows, [
      {
        method: "crypto",
        label: "crypto",
        grossMinor: 2000,
        refundedMinor: 0,
        netMinor: 2000,
        count: 1,
        share: 1,
      },
    ]);
  });

  it("reports refunds against the method that took the money", () => {
    const rows = takingsRows(
      revenue([method("card_online", 10_000, { refundedMinor: 2500, count: 3 })]),
    );

    assert.equal(rows[0]!.refundedMinor, 2500);
    assert.equal(rows[0]!.netMinor, 7500);
    // Three payments, not four: a refund is not a payment.
    assert.equal(rows[0]!.count, 3);
  });

  it("does not divide by zero when every method is zero", () => {
    const rows = takingsRows(revenue([method("cash", 0, { count: 0 })]));
    assert.equal(rows[0]!.share, 0);
  });
});

describe("takingsSummary", () => {
  it("merges the two card methods into one Card line", () => {
    const rows = takingsSummary(
      revenue([
        method("card_online", 10_000, { refundedMinor: 1000, count: 2 }),
        method("card_manual", 5000, { count: 1 }),
        method("cash", 5000),
      ]),
    );

    assert.deepEqual(
      rows.map((r) => [r.label, r.grossMinor, r.count]),
      [
        ["Card", 15_000, 3],
        ["Cash", 5000, 1],
      ],
    );
    assert.equal(rows[0]!.refundedMinor, 1000);
    assert.equal(rows[0]!.netMinor, 14_000);
    assert.equal(rows[0]!.share, 0.75);
  });

  it("leaves a single card method alone rather than relabelling it", () => {
    // Nothing to merge, so the more precise label survives.
    const rows = takingsSummary(revenue([method("card_online", 10_000), method("cash", 5000)]));

    assert.deepEqual(
      rows.map((r) => r.label),
      ["Card (online)", "Cash"],
    );
  });

  it("merges without losing the total", () => {
    const source = revenue([
      method("card_online", 10_000),
      method("card_manual", 5000),
      method("bank_transfer", 2000),
    ]);
    const rows = takingsSummary(source);

    assert.equal(
      rows.reduce((sum, r) => sum + r.grossMinor, 0),
      source.grossMinor,
    );
  });
});

describe("hasTakingsBreakdown", () => {
  it("separates 'took nothing' from 'this API build has no breakdown'", () => {
    assert.equal(hasTakingsBreakdown(revenue([])), true);
    // An API build from before the breakdown shipped sends no `byMethod` at all.
    assert.equal(
      hasTakingsBreakdown({
        grossMinor: 5000,
        refundedMinor: 0,
        disputedMinor: 0,
        netMinor: 5000,
      } as Revenue),
      false,
    );
  });
});
