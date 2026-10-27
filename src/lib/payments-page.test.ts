import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayLabel,
  disputeIsOpen,
  disputeReasonLabel,
  expectingLine,
  isRefundOrDispute,
  matchesFilters,
  pageOf,
  paymentFigures,
  paymentsCsv,
  periodRange,
  requirementLabels,
  rowAriaLabel,
  statusLine,
  whatFor,
  type ActivityRow,
  type OwedRow,
} from "./payments-page.ts";

const TZ = "Europe/London";
const NOW = new Date("2026-10-26T12:00:00Z");

function row(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: "p1",
    source: "card",
    paymentId: "p1",
    method: "card_online",
    amountMinor: 32000,
    refundedMinor: 0,
    feeMinor: 498,
    currency: "GBP",
    status: "succeeded",
    at: "2026-10-26T13:05:00Z",
    customer: { id: "c1", name: "Oliver Grant", email: "oliver@example.test", phone: null },
    booking: {
      id: "b1",
      reference: "NOR-1042",
      serviceName: "Ceramic coating",
      start: "2026-10-20T09:00:00Z",
      timezone: TZ,
      status: "completed",
    },
    package: null,
    recordedBy: null,
    note: null,
    receiptNumber: "1234-5678",
    receiptUrl: null,
    refunds: [],
    ...over,
  };
}

test("periods are whole days in the business time zone", () => {
  const month = periodRange("this_month", NOW, TZ);
  assert.equal(month.from.toISOString(), "2026-09-30T23:00:00.000Z");
  assert.equal(month.to.toISOString(), "2026-10-27T00:00:00.000Z");

  const week = periodRange("this_week", NOW, TZ);
  assert.equal(week.from.toISOString(), "2026-10-26T00:00:00.000Z");

  const last = periodRange("last_month", NOW, TZ);
  assert.equal(last.from.toISOString(), "2026-08-31T23:00:00.000Z");
  assert.equal(last.to.toISOString(), "2026-09-30T23:00:00.000Z");

  const custom = periodRange("custom", NOW, TZ, { from: "2026-10-01", to: "2026-10-03" });
  assert.equal(custom.from.toISOString(), "2026-09-30T23:00:00.000Z");
  assert.equal(custom.to.toISOString(), "2026-10-03T23:00:00.000Z");

  const backwards = periodRange("custom", NOW, TZ, { from: "2026-10-05", to: "2026-10-01" });
  assert.deepEqual(backwards, month);
});

test("dates read Today, Yesterday or the weekday", () => {
  assert.equal(dayLabel("2026-10-26T08:00:00Z", TZ, NOW), "Today");
  assert.equal(dayLabel("2026-10-25T22:30:00Z", TZ, NOW), "Yesterday");
  assert.equal(dayLabel("2026-10-20T09:00:00Z", TZ, NOW), "Tue 20 Oct");
});

test("rows say what they were for and the status line in plain words", () => {
  assert.equal(whatFor(row(), TZ, NOW), "Ceramic coating · Tue 20 Oct");
  assert.equal(
    whatFor(row({ booking: null, package: { id: "k", name: "5 mini valets" } }), TZ, NOW),
    "Package: 5 mini valets",
  );
  assert.equal(
    statusLine(
      row({ source: "manual", method: "cash", recordedBy: { id: "u", name: "Ben" } }),
      TZ,
      NOW,
    ),
    "Recorded by Ben",
  );
  assert.equal(
    statusLine(row({ source: "manual", method: "bank_transfer" }), TZ, NOW),
    "Marked received",
  );
  assert.equal(
    statusLine(row({ status: "failed", failureReason: "Card declined" }), TZ, NOW),
    "Card declined",
  );
  const refund = {
    id: "r1",
    amountMinor: 4000,
    at: "2026-10-21T10:00:00Z",
    method: "card_online" as const,
    reasonCode: "requested_by_customer",
    note: null,
    by: null,
    state: "succeeded" as const,
  };
  assert.equal(
    statusLine(row({ status: "partially_refunded", refunds: [refund] }), TZ, NOW),
    "Refunded 21 Oct",
  );
  assert.equal(
    statusLine(row({ status: "refunded", refunds: [refund] }), TZ, NOW),
    "Requested by client",
  );
  const dispute = {
    id: "dp",
    reason: "fraudulent",
    amountMinor: 32000,
    feeMinor: 2000,
    dueBy: "2026-10-29T23:59:59Z",
    status: "needs_response",
    openedAt: "2026-10-22T10:00:00Z",
  };
  assert.equal(statusLine(row({ status: "disputed", dispute }), TZ, NOW), "Respond by 29 Oct");
  assert.equal(disputeIsOpen(row({ status: "disputed", dispute })), true);
  assert.equal(
    disputeIsOpen(row({ status: "succeeded", dispute: { ...dispute, status: "won" } })),
    false,
  );
  assert.equal(disputeReasonLabel("fraudulent"), "They don't recognise the payment");
  assert.equal(disputeReasonLabel("bank_cannot_process"), "General");
});

test("aria label names everything a sighted user sees", () => {
  assert.equal(
    rowAriaLabel(row(), TZ, NOW),
    "Oliver Grant, ceramic coating, Tuesday 20 October, card online, £320, paid, today 13:05",
  );
});

test("filters match client, method, status and search", () => {
  const cash = row({ id: "p2", method: "cash", source: "manual", receiptNumber: null });
  assert.equal(matchesFilters(row(), { methods: ["cash"] }), false);
  assert.equal(matchesFilters(cash, { methods: ["cash"] }), true);
  assert.equal(matchesFilters(row(), { statuses: ["refunded"] }), false);
  assert.equal(matchesFilters(row(), { q: "1234" }), true);
  assert.equal(matchesFilters(row(), { q: "oliver@" }), true);
  assert.equal(matchesFilters(row(), { q: "nobody" }), false);
  assert.equal(matchesFilters(row(), { clientId: "c2" }), false);
  assert.equal(isRefundOrDispute(row()), false);
  assert.equal(isRefundOrDispute(row({ refundedMinor: 100, status: "partially_refunded" })), true);
});

test("figures: taken keeps refunded payments, refunds take them back out, fees from card rows", () => {
  const range = periodRange("this_month", NOW, TZ);
  const rows = [
    row(),
    row({
      id: "p2",
      method: "cash",
      source: "manual",
      feeMinor: null,
      amountMinor: 4000,
      refundedMinor: 4000,
      status: "refunded",
      refunds: [
        {
          id: "r",
          amountMinor: 4000,
          at: "2026-10-22T10:00:00Z",
          method: "cash",
          reasonCode: "other",
          note: null,
          by: null,
          state: "succeeded",
        },
      ],
    }),
    row({ id: "p3", status: "failed", feeMinor: null }),
  ];
  const owed: OwedRow[] = [
    {
      bookingId: "b9",
      reference: "NOR-1",
      start: "2026-10-20T09:00:00Z",
      end: "2026-10-20T10:00:00Z",
      timezone: TZ,
      serviceName: "Valet",
      status: "completed",
      done: true,
      customer: null,
      paymentMethod: "pay_later",
      priceMinor: 6400,
      paidMinor: 0,
      depositMinor: null,
      outstandingMinor: 6400,
      currency: "GBP",
      daysOutstanding: 6,
    },
  ];
  const f = paymentFigures({ rows, owed, range, filtered: true });
  assert.equal(f.takenMinor, 36000);
  assert.equal(f.takenCount, 2);
  assert.equal(f.refundedMinor, 4000);
  assert.equal(f.feesMinor, 498);
  assert.equal(f.netMinor, 36000 - 4000 - 498);
  assert.equal(f.owedMinor, 6400);
  assert.equal(f.noCardPayments, false);

  const api = paymentFigures({
    rows,
    owed,
    range,
    filtered: false,
    refundsInPeriod: { count: 3, totalMinor: 9000 },
  });
  assert.equal(api.refundedMinor, 9000);
  assert.equal(api.refundCount, 3);

  const noCards = paymentFigures({ rows: [rows[1]!], owed: [], range, filtered: true });
  assert.equal(noCards.noCardPayments, true);
  assert.equal(expectingLine(owed[0]!, "GBP"), "Not recorded");
  assert.equal(
    expectingLine({ ...owed[0]!, paymentMethod: "bank_transfer", daysOutstanding: 4 }, "GBP"),
    "Ref NOR-1 · 4 days",
  );
});

test("pages of 25 and a CSV of what is shown", () => {
  const many = Array.from({ length: 58 }, (_, i) => i);
  assert.deepEqual(pageOf(many, 3), { items: many.slice(50), page: 3, pages: 3 });
  assert.equal(pageOf(many, 9).page, 3);
  const csv = paymentsCsv(
    [row({ customer: { id: "c", name: 'Ann "A", B', email: null, phone: null } })],
    TZ,
    NOW,
  );
  const [header, line] = csv.split("\n");
  assert.equal(header, "Date,Client,What for,Method,Amount,Refunded,Fee,Net,Status,Receipt number");
  assert.equal(
    line,
    '26/10/2026 13:05,"Ann ""A"", B",Ceramic coating · Tue 20 Oct,Card online,320.00,0.00,4.98,315.02,Paid,1234-5678',
  );
});

test("Stripe requirement keys read as plain English", () => {
  assert.deepEqual(
    requirementLabels([
      "individual.verification.document",
      "individual.dob.day",
      "individual.dob.month",
      "external_account",
      "tos_acceptance.date",
      "company.tax_id",
    ]),
    [
      "A photo of your ID",
      "Your date of birth",
      "Your bank account",
      "Accept Stripe's terms",
      "1 other detail",
    ],
  );
});
