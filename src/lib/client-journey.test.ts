import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientPayOptions,
  dayPartFor,
  dedupeSlotsByStart,
  defaultClientPayMethod,
  formatCountdown,
  groupSlotsByDayPart,
  hoursLabel,
  isAccountBooking,
  isTooLateToHold,
  looksLikeEmail,
  nationalPhone,
  price,
  splitDisplayName,
  toE164,
  type JourneyHold,
  type PaymentMethodsOffered,
} from "./client-journey.ts";

describe("price — compact money on the client journey", () => {
  it("drops the pence on whole amounts", () => {
    assert.equal(price(4500, "GBP"), "£45");
    assert.equal(price(35000, "GBP"), "£350");
  });
  it("keeps both pence digits on a discounted amount", () => {
    // 10% off £45 is £40.50, which must not print as "£40.5".
    assert.equal(price(4050, "GBP"), "£40.50");
    assert.equal(price(31505, "GBP"), "£315.05");
  });
});

describe("toE164 — UK mobile numbers as people type them", () => {
  it("turns a national number into +44", () => {
    assert.equal(toE164("07700 900123"), "+447700900123");
    assert.equal(toE164("7700900123"), "+447700900123");
  });

  it("keeps an international number as it is", () => {
    assert.equal(toE164("+353 87 123 4567"), "+353871234567");
  });

  it("refuses anything ambiguous instead of guessing", () => {
    assert.equal(toE164("123"), null);
    assert.equal(toE164(""), null);
    assert.equal(toE164("call me"), null);
  });
});

describe("nationalPhone — a stored number back in the form", () => {
  it("shows a +44 number the way it is dialled at home", () => {
    assert.equal(nationalPhone("+447700900123"), "07700 900123");
    assert.equal(toE164(nationalPhone("+447700900123")), "+447700900123");
  });

  it("leaves other countries and odd values alone", () => {
    assert.equal(nationalPhone("+353871234567"), "+353871234567");
    assert.equal(nationalPhone("07700 900123"), "07700 900123");
    assert.equal(nationalPhone(""), "");
  });
});

describe("looksLikeEmail", () => {
  it("catches an obviously mistyped address", () => {
    assert.equal(looksLikeEmail("sam@example.com"), true);
    assert.equal(looksLikeEmail("sam@example"), false);
    assert.equal(looksLikeEmail("sam example.com"), false);
  });
});

describe("formatCountdown", () => {
  it("shows m:ss and never goes negative", () => {
    assert.equal(formatCountdown(9 * 60_000 + 5_000), "9:05");
    assert.equal(formatCountdown(500), "0:01");
    assert.equal(formatCountdown(-10), "0:00");
  });
});

describe("splitDisplayName", () => {
  it("splits first and the rest", () => {
    assert.deepEqual(splitDisplayName("Sam Jo Patel"), { first: "Sam", last: "Jo Patel" });
    assert.deepEqual(splitDisplayName(null), { first: "", last: "" });
  });
});

describe("day parts", () => {
  it("buckets by local hour", () => {
    assert.equal(dayPartFor(8), "Morning");
    assert.equal(dayPartFor(12), "Afternoon");
    assert.equal(dayPartFor(17), "Evening");
  });

  it("groups slots in start order and omits empty parts", () => {
    const slots = [
      { start: "2026-10-16T18:00:00Z" },
      { start: "2026-10-16T08:00:00Z" },
      { start: "2026-10-16T09:00:00Z" },
    ];
    const grouped = groupSlotsByDayPart(slots, (iso) => new Date(iso).getUTCHours());
    assert.deepEqual(
      grouped.map((g) => [g.part, g.slots.length]),
      [
        ["Morning", 2],
        ["Evening", 1],
      ],
    );
    assert.equal(grouped[0]!.slots[0]!.start, "2026-10-16T08:00:00Z");
  });

  it("collapses same-start slots to the one with the most room left", () => {
    const slots = [
      { start: "2026-10-16T09:00:00Z", remainingCapacity: 1 },
      { start: "2026-10-16T09:00:00Z", remainingCapacity: 3 },
      { start: "2026-10-16T08:00:00Z", remainingCapacity: 1 },
    ];
    const deduped = dedupeSlotsByStart(slots);
    assert.equal(deduped.length, 2);
    assert.equal(deduped[1]!.remainingCapacity, 3);
  });
});

describe("hoursLabel", () => {
  it("says it the way people do", () => {
    assert.equal(hoursLabel(24), "24 hours");
    assert.equal(hoursLabel(48), "2 days");
    assert.equal(hoursLabel(6), "6 hours");
    assert.equal(hoursLabel(1), "1 hour");
  });
});

describe("isTooLateToHold — a slot that passed while the visitor typed", () => {
  it("recognises the notice-window refusal and nothing else", () => {
    assert.equal(
      isTooLateToHold({
        status: 422,
        detail: "The selected time is within the booking notice window",
      }),
      true,
    );
    assert.equal(isTooLateToHold({ status: 422, detail: "Payment still settling" }), false);
    assert.equal(
      isTooLateToHold({ status: 409, detail: "within the booking notice window" }),
      false,
    );
    assert.equal(isTooLateToHold({ status: 422 }), false);
  });
});

describe("isAccountBooking — what counts as a booking in the account", () => {
  it("keeps confirmed, unpaid and completed; drops holds and history", () => {
    for (const status of ["awaiting_payment", "confirmed", "completed"]) {
      assert.equal(isAccountBooking({ status }), true, status);
    }
    for (const status of [
      "held",
      "expired",
      "cancelled_by_customer",
      "cancelled_by_business",
      "late_cancelled",
      "no_show",
      "draft",
    ]) {
      assert.equal(isAccountBooking({ status }), false, status);
    }
  });
});

describe("clientPayOptions — what Review and pay offers (RECA-522 bank transfer)", () => {
  const holdWith = (flags: Partial<JourneyHold>): JourneyHold =>
    ({ booking: { id: "b1" }, holdToken: "t", ...flags }) as unknown as JourneyHold;
  const keys = (opts: ReturnType<typeof clientPayOptions>) => opts.map((o) => o.key);
  const profile = (over: Partial<PaymentMethodsOffered>): PaymentMethodsOffered => ({
    card: false,
    bankTransfer: false,
    onTheDay: true,
    ...over,
  });

  it("offers bank transfer whenever the hold says the business accepts it", () => {
    const opts = clientPayOptions({
      hold: holdWith({ onlinePaymentRequired: false, bankTransferAvailable: true }),
      priceMinor: 1800,
      profileMethods: undefined,
      eligibleCredit: false,
    });
    assert.deepEqual(keys(opts), ["in_person", "bank_transfer"]);
    assert.equal(opts[1]?.title, "Bank transfer");
  });

  it("keeps bank transfer alongside card when payment up front is required", () => {
    const opts = clientPayOptions({
      hold: holdWith({ onlinePaymentRequired: true, bankTransferAvailable: true }),
      priceMinor: 4500,
      profileMethods: undefined,
      eligibleCredit: false,
    });
    assert.deepEqual(keys(opts), ["card", "bank_transfer"]);
  });

  it("reads the public profile before a hold exists", () => {
    assert.deepEqual(
      keys(
        clientPayOptions({
          hold: null,
          priceMinor: 1800,
          profileMethods: profile({ bankTransfer: true }),
          eligibleCredit: false,
        }),
      ),
      ["in_person", "bank_transfer"],
    );
    assert.deepEqual(
      keys(
        clientPayOptions({
          hold: null,
          priceMinor: 1800,
          profileMethods: profile({ card: true, bankTransfer: true }),
          eligibleCredit: false,
        }),
      ),
      ["card", "bank_transfer"],
    );
  });

  it("leaves bank transfer out only when the business has no details on file", () => {
    assert.deepEqual(
      keys(
        clientPayOptions({
          hold: holdWith({ onlinePaymentRequired: false, bankTransferAvailable: false }),
          priceMinor: 1800,
          profileMethods: undefined,
          eligibleCredit: false,
        }),
      ),
      ["in_person"],
    );
    assert.deepEqual(
      keys(
        clientPayOptions({
          hold: null,
          priceMinor: 1800,
          profileMethods: profile({}),
          eligibleCredit: false,
        }),
      ),
      ["in_person"],
    );
  });

  it("has nothing to pay for a free session, and a credit leads when eligible", () => {
    assert.deepEqual(
      keys(
        clientPayOptions({
          hold: null,
          priceMinor: 0,
          profileMethods: profile({ card: true, bankTransfer: true }),
          eligibleCredit: false,
        }),
      ),
      [],
    );
    const withCredit = clientPayOptions({
      hold: null,
      priceMinor: 1800,
      profileMethods: profile({ bankTransfer: true }),
      eligibleCredit: true,
    });
    assert.deepEqual(keys(withCredit), ["credit", "in_person", "bank_transfer"]);
    assert.equal(withCredit[0]?.disabled, undefined);
  });

  it("pre-selects bank transfer when it is the only way to pay ahead", () => {
    const hold = holdWith({ onlinePaymentRequired: false, bankTransferAvailable: true });
    assert.equal(
      defaultClientPayMethod({
        hold,
        priceMinor: 1800,
        profileMethods: undefined,
        eligibleCredit: false,
      }),
      "bank_transfer",
    );
    assert.equal(
      defaultClientPayMethod({
        hold: null,
        priceMinor: 1800,
        profileMethods: profile({ bankTransfer: true }),
        eligibleCredit: false,
      }),
      "bank_transfer",
    );
  });

  it("the default is always one of the options offered", () => {
    const cases: { hold: JourneyHold | null; profileMethods: PaymentMethodsOffered | undefined }[] =
      [
        { hold: null, profileMethods: undefined },
        { hold: null, profileMethods: profile({ card: true }) },
        { hold: null, profileMethods: profile({ bankTransfer: true }) },
        { hold: null, profileMethods: profile({ card: true, bankTransfer: true }) },
        { hold: holdWith({ onlinePaymentRequired: true }), profileMethods: undefined },
        { hold: holdWith({ bankTransferAvailable: true }), profileMethods: undefined },
        {
          hold: holdWith({ onlinePaymentRequired: true, bankTransferAvailable: true }),
          profileMethods: undefined,
        },
        { hold: holdWith({}), profileMethods: undefined },
      ];
    for (const c of cases) {
      for (const eligibleCredit of [false, true]) {
        const input = { ...c, priceMinor: 2500, eligibleCredit };
        const offered = keys(clientPayOptions(input));
        assert.ok(
          offered.includes(defaultClientPayMethod(input)),
          JSON.stringify({ input, offered }),
        );
      }
    }
  });
});
