import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addBookingBlockers,
  addBookingDirty,
  addDaysToIsoDate,
  addDeposit,
  addFooterSummary,
  addNotifyHint,
  bookingWords,
  contactBlocks,
  currencySymbol,
  dayLabel,
  dayStrip,
  defaultPaymentMethod,
  editDefaultTicks,
  editDeposit,
  editFooterSummary,
  editNotifyHint,
  isRememberedMethod,
  jobPrice,
  listInWords,
  moneyInputValue,
  moneyShort,
  notifyPrefFrom,
  notifyTicks,
  PAYMENT_METHOD_NAMES,
  priceError,
  priceMode,
  priceModeLabel,
  reachableChannels,
  slotSummary,
  stillNeeded,
  timeRange,
} from "./booking-form.ts";

const PT = bookingWords({
  staff: "Trainer",
  service: "Session",
  booking: "Session",
  linkedRecord: "Record",
});
const AUTO = bookingWords({
  staff: "Detailer",
  service: "Service type",
  booking: "Job",
  linkedRecord: "Vehicle",
});

describe("bookingWords", () => {
  it("swaps the nouns per trade and drops a trailing 'type'", () => {
    assert.equal(PT.service, "session");
    assert.equal(PT.Services, "Sessions");
    assert.equal(PT.Staff, "Trainer");
    assert.equal(PT.staff, "trainer");
    assert.equal(AUTO.service, "service");
    assert.equal(AUTO.services, "services");
    assert.equal(AUTO.vehicle, "vehicle");
    assert.equal(AUTO.vehicles, "vehicles");
    assert.equal(AUTO.booking, "job");
  });

  it("falls back to the generic words when a term is blank", () => {
    const w = bookingWords({ staff: " ", service: "", booking: "", linkedRecord: "" });
    assert.equal(w.Staff, "Staff");
    assert.equal(w.service, "service");
    assert.equal(w.vehicle, "record");
  });
});

describe("money and time", () => {
  it("reads the symbol from the business currency", () => {
    assert.equal(currencySymbol("GBP"), "£");
    assert.equal(currencySymbol("EUR"), "€");
    assert.equal(currencySymbol("not-a-code"), "not-a-code");
  });

  it("always shows two decimals in inputs", () => {
    assert.equal(moneyInputValue(4000), "40.00");
    assert.equal(moneyInputValue(5), "0.05");
  });

  it("drops .00 in summary lines but keeps real pence", () => {
    assert.equal(moneyShort(5300, "GBP"), "£53");
    assert.equal(moneyShort(5350, "GBP"), "£53.50");
  });

  it("writes time ranges with 'to', never a dash", () => {
    assert.equal(
      timeRange("2026-10-20T09:00:00Z", "2026-10-20T10:15:00Z", "Europe/London"),
      "10:00 to 11:15",
    );
  });

  it("labels days and builds the day strip from the business's today", () => {
    assert.equal(dayLabel("2026-10-20"), "Tue 20 Oct");
    assert.equal(addDaysToIsoDate("2026-10-31", 1), "2026-11-01");
    const strip = dayStrip("2026-10-19", 6);
    assert.equal(strip.length, 6);
    assert.deepEqual(
      strip.map((d) => d.label),
      ["Today 19", "Tue 20", "Wed 21", "Thu 22", "Fri 23", "Sat 24"],
    );
    assert.equal(strip[5]!.isoDate, "2026-10-24");
  });

  it("lists in words", () => {
    assert.equal(listInWords([]), "");
    assert.equal(listInWords(["price"]), "price");
    assert.equal(listInWords(["session", "price"]), "session and price");
    assert.equal(listInWords(["a", "b", "c"]), "a, b and c");
  });
});

describe("notify channels", () => {
  it("reads every remembered value, including the pre-tick-box on/off", () => {
    assert.deepEqual(notifyTicks("email"), { email: true, sms: false });
    assert.deepEqual(notifyTicks("sms"), { email: false, sms: true });
    assert.deepEqual(notifyTicks("both"), { email: true, sms: true });
    assert.deepEqual(notifyTicks("none"), { email: false, sms: false });
    assert.deepEqual(notifyTicks("on"), { email: true, sms: false });
    assert.deepEqual(notifyTicks("off"), { email: false, sms: false });
  });

  it("stores the ticks back as one value", () => {
    assert.equal(notifyPrefFrom({ email: true, sms: true }), "both");
    assert.equal(notifyPrefFrom({ email: true, sms: false }), "email");
    assert.equal(notifyPrefFrom({ email: false, sms: true }), "sms");
    assert.equal(notifyPrefFrom({ email: false, sms: false }), "none");
  });

  const reachable = {
    emailDisplay: "a@b.c",
    phoneDisplay: "07700 900000",
    contactPreferences: { operationalNotifications: true },
  };

  it("says why a channel can't reach the client", () => {
    assert.deepEqual(contactBlocks(null, false), { email: null, sms: null });
    assert.deepEqual(contactBlocks(reachable, false), { email: null, sms: null });
    assert.deepEqual(contactBlocks({ ...reachable, emailDisplay: null }, false), {
      email: "no email address on file",
      sms: null,
    });
    assert.equal(
      contactBlocks({ ...reachable, phoneDisplay: null }, false).sms,
      "no mobile number on file",
    );
    assert.equal(
      contactBlocks(
        { ...reachable, contactPreferences: { operationalNotifications: false } },
        false,
      ).sms,
      "they've turned off text messages",
    );
    assert.equal(contactBlocks(reachable, true).sms, "you have no text credits left");
    // A normalised value alone is enough.
    assert.equal(
      contactBlocks({ ...reachable, emailDisplay: null, emailNormalised: "a@b.c" }, false).email,
      null,
    );
  });

  it("only sends on ticked channels that reach the client", () => {
    const none = { email: null, sms: null };
    assert.deepEqual(reachableChannels({ email: true, sms: true }, none), ["email", "sms"]);
    assert.deepEqual(
      reachableChannels(
        { email: true, sms: true },
        { email: "no email address on file", sms: null },
      ),
      ["sms"],
    );
    assert.deepEqual(reachableChannels({ email: false, sms: false }, none), []);
  });

  it("explains Add booking's confirmation", () => {
    const none = { email: null, sms: null };
    assert.equal(
      addNotifyHint(["email"], none),
      "Goes out by email as soon as the booking is created.",
    );
    assert.equal(
      addNotifyHint(["email", "sms"], none),
      "Goes out by email and text as soon as the booking is created.",
    );
    assert.equal(
      addNotifyHint(["email"], { email: null, sms: "no mobile number on file" }),
      "Goes out by email as soon as the booking is created. Text is off: no mobile number on file.",
    );
    assert.equal(
      addNotifyHint([], none),
      "Nothing is sent now. Use Resend on the booking when they're ready to hear from you.",
    );
  });
});

describe("Edit booking's notify control", () => {
  const open = { email: null, sms: null };

  it("ticks nothing when the client wouldn't notice the change", () => {
    assert.deepEqual(editDefaultTicks({ pref: "both", blocks: open, clientVisible: false }), {
      email: false,
      sms: false,
    });
  });

  it("ticks the remembered channels minus any that are blocked", () => {
    assert.deepEqual(editDefaultTicks({ pref: "both", blocks: open, clientVisible: true }), {
      email: true,
      sms: true,
    });
    assert.deepEqual(
      editDefaultTicks({
        pref: "both",
        blocks: { email: null, sms: "no mobile number on file" },
        clientVisible: true,
      }),
      { email: true, sms: false },
    );
  });

  it("falls back to whichever channel reaches them, as the single box did", () => {
    assert.deepEqual(
      editDefaultTicks({
        pref: "email",
        blocks: { email: "no email address on file", sms: null },
        clientVisible: true,
      }),
      { email: false, sms: true },
    );
    assert.deepEqual(editDefaultTicks({ pref: "none", blocks: open, clientVisible: true }), {
      email: true,
      sms: false,
    });
  });

  const base = {
    name: "Jo Bloggs",
    amendDirty: true,
    onlyDateFix: false,
    channels: ["email"] as ("email" | "sms")[],
    blocks: open,
    followingDefault: true,
    visibleChanges: ["session", "price"],
    leavesBankPending: false,
    nextMessage: "confirmation" as const,
  };

  it("says why it's ticked", () => {
    assert.deepEqual(editNotifyHint(base), {
      text: "Ticked because the session and price changed. Jo Bloggs gets the confirmation again by email with the new details.",
      tone: "muted",
    });
    assert.equal(
      editNotifyHint({ ...base, followingDefault: false }).text,
      "Jo Bloggs gets the confirmation again by email with the new details.",
    );
  });

  it("covers unticked, date fix only, unreachable and leaving a bank transfer", () => {
    assert.equal(
      editNotifyHint({ ...base, channels: [] }).text,
      "Nothing is sent. Use Resend on the booking if you change your mind.",
    );
    assert.equal(
      editNotifyHint({ ...base, amendDirty: false, onlyDateFix: true, channels: [] }).text,
      "A date fix isn't sent to the client. Use Reschedule if they need to know.",
    );
    assert.deepEqual(
      editNotifyHint({
        ...base,
        channels: [],
        blocks: { email: "no email address on file", sms: "no mobile number on file" },
      }),
      {
        text: "Can't reach Jo Bloggs: no email address on file; no mobile number on file.",
        tone: "destructive",
      },
    );
    assert.equal(
      editNotifyHint({ ...base, leavesBankPending: true, nextMessage: "payment request" }).text,
      "Jo Bloggs gets a fresh payment request by email for the new way of paying, replacing the transfer message.",
    );
  });

  it("adds why text is off", () => {
    assert.match(
      editNotifyHint({ ...base, blocks: { email: null, sms: "you have no text credits left" } })
        .text,
      /Text is off: you have no text credits left\.$/,
    );
  });
});

describe("payment method", () => {
  it("opens on the last one used", () => {
    assert.equal(
      defaultPaymentMethod({
        lastMethod: "pay_later",
        isCarDetailing: false,
        bankTransferEnabled: false,
      }),
      "pay_later",
    );
    assert.equal(
      defaultPaymentMethod({
        lastMethod: "bank_transfer",
        isCarDetailing: true,
        bankTransferEnabled: true,
      }),
      "bank_transfer",
    );
  });

  it("defaults a first booking by trade", () => {
    assert.equal(
      defaultPaymentMethod({
        lastMethod: "unset",
        isCarDetailing: true,
        bankTransferEnabled: false,
      }),
      "pay_later",
    );
    assert.equal(
      defaultPaymentMethod({
        lastMethod: "unset",
        isCarDetailing: false,
        bankTransferEnabled: true,
      }),
      "none",
    );
  });

  it("falls back to up front when bank transfer has been switched off", () => {
    assert.equal(
      defaultPaymentMethod({
        lastMethod: "bank_transfer",
        isCarDetailing: true,
        bankTransferEnabled: false,
      }),
      "none",
    );
  });

  it("never remembers package credit", () => {
    assert.equal(isRememberedMethod("credit"), false);
    assert.equal(isRememberedMethod("none"), true);
  });

  it("has one name per option", () => {
    assert.deepEqual(PAYMENT_METHOD_NAMES, {
      none: "Pay up front",
      pay_later: "Pay after the job",
      credit: "Package credit",
      bank_transfer: "Bank transfer",
    });
  });
});

describe("jobPrice", () => {
  const rows = [
    { typed: undefined, listMinor: 4000 },
    { typed: undefined, listMinor: 1500 },
  ];

  it("is the list total when nothing is typed", () => {
    const p = jobPrice({ rolledTotalMinor: 5500, priceInput: null, discount: null, rows });
    assert.equal(p.effectiveTotalMinor, 5500);
    assert.equal(p.priceOverridden, false);
    assert.equal(p.priceChanged, false);
    assert.equal(p.priceInvalid, false);
    assert.equal(priceMode(p), "list");
  });

  it("takes a typed whole-job total, including zero", () => {
    const p = jobPrice({ rolledTotalMinor: 5500, priceInput: "50", discount: null, rows });
    assert.equal(p.effectiveTotalMinor, 5000);
    assert.equal(p.priceChanged, true);
    assert.equal(priceMode(p), "whole_job");
    const free = jobPrice({ rolledTotalMinor: 5500, priceInput: "0", discount: null, rows });
    assert.equal(free.effectiveTotalMinor, 0);
    assert.equal(free.priceInvalid, false);
  });

  it("rejects a negative or unreadable total", () => {
    for (const priceInput of ["-1", "", "abc"]) {
      const p = jobPrice({ rolledTotalMinor: 5500, priceInput, discount: null, rows });
      assert.equal(p.priceInvalid, true, priceInput);
      assert.equal(p.effectiveTotalMinor, 5500, priceInput);
    }
  });

  it("works out a discount off the list", () => {
    const pct = jobPrice({
      rolledTotalMinor: 5500,
      priceInput: null,
      discount: { mode: "percent", value: "10" },
      rows,
    });
    assert.equal(pct.discountMinor, 550);
    assert.equal(pct.effectiveTotalMinor, 4950);
    assert.equal(priceMode(pct), "discount");
    const amount = jobPrice({
      rolledTotalMinor: 5500,
      priceInput: null,
      discount: { mode: "amount", value: "5" },
      rows,
    });
    assert.equal(amount.effectiveTotalMinor, 5000);
  });

  it("flags a discount that can't apply", () => {
    const p = jobPrice({
      rolledTotalMinor: 5500,
      priceInput: null,
      discount: { mode: "percent", value: "150" },
      rows,
    });
    assert.equal(p.discountInvalid, true);
    assert.equal(p.priceInvalid, true);
    // A blank discount box is not an error.
    const blank = jobPrice({
      rolledTotalMinor: 5500,
      priceInput: null,
      discount: { mode: "percent", value: " " },
      rows,
    });
    assert.equal(blank.priceInvalid, false);
  });

  it("sums row prices, and calls it priced per service only when a row moved", () => {
    const p = jobPrice({
      rolledTotalMinor: 5500,
      priceInput: null,
      discount: null,
      rows: [{ typed: "30", listMinor: 4000 }, rows[1]!],
    });
    assert.equal(p.lineTotalMinor, 4500);
    assert.equal(p.effectiveTotalMinor, 4500);
    assert.equal(p.linesRepriced, true);
    assert.equal(priceMode(p), "per_service");
    const same = jobPrice({
      rolledTotalMinor: 5500,
      priceInput: null,
      discount: null,
      rows: [{ typed: "40.00", listMinor: 4000 }, rows[1]!],
    });
    assert.equal(same.linePricesTouched, true);
    assert.equal(same.linesRepriced, false);
    assert.equal(same.priceChanged, false);
    assert.equal(priceMode(same), "list");
  });

  it("flags a row price that isn't an amount", () => {
    const p = jobPrice({
      rolledTotalMinor: 5500,
      priceInput: null,
      discount: null,
      rows: [{ typed: "x", listMinor: 4000 }, rows[1]!],
    });
    assert.equal(p.lineInvalid, true);
    assert.equal(p.priceInvalid, true);
  });

  it("lets a typed total win over a discount and rows", () => {
    const p = jobPrice({
      rolledTotalMinor: 5500,
      priceInput: "20",
      discount: { mode: "percent", value: "10" },
      rows: [{ typed: "30", listMinor: 4000 }, rows[1]!],
    });
    assert.equal(p.effectiveTotalMinor, 2000);
  });

  it("names the modes and errors", () => {
    assert.equal(priceModeLabel("list", PT), "List price");
    assert.equal(priceModeLabel("per_service", PT), "Priced per session");
    assert.equal(priceModeLabel("whole_job", PT), "Whole-job price");
    assert.equal(priceModeLabel("discount", PT), "Discount");
    assert.equal(
      priceError(
        { discountInvalid: true, lineInvalid: false },
        { mode: "percent", value: "200" },
        "£55.00",
        PT,
      ),
      "Enter a percentage between 0 and 100.",
    );
    assert.equal(
      priceError(
        { discountInvalid: true, lineInvalid: false },
        { mode: "amount", value: "200" },
        "£55.00",
        PT,
      ),
      "Enter an amount up to £55.00.",
    );
    assert.equal(
      priceError({ discountInvalid: false, lineInvalid: true }, null, "£55.00", PT),
      "One of the session prices isn't an amount. Fix it, or clear it to use the list price.",
    );
    assert.equal(
      priceError({ discountInvalid: false, lineInvalid: false }, null, "£55.00", PT),
      "Enter an amount, or reset to the list price.",
    );
  });
});

describe("addDeposit", () => {
  it("follows the services' deposits until typed over", () => {
    assert.deepEqual(
      addDeposit({
        depositInput: null,
        defaultDepositMinor: 1500,
        totalMinor: 5000,
        applies: true,
      }),
      { minor: 1500, invalid: false, overridden: false },
    );
  });

  it("treats a cleared box as no deposit", () => {
    assert.deepEqual(
      addDeposit({ depositInput: "", defaultDepositMinor: 1500, totalMinor: 5000, applies: true }),
      { minor: null, invalid: false, overridden: true },
    );
  });

  it("takes an amount under the total and refuses one at or over it", () => {
    assert.equal(
      addDeposit({ depositInput: "20", defaultDepositMinor: null, totalMinor: 5000, applies: true })
        .minor,
      2000,
    );
    const over = addDeposit({
      depositInput: "50",
      defaultDepositMinor: null,
      totalMinor: 5000,
      applies: true,
    });
    assert.equal(over.minor, null);
    assert.equal(over.invalid, true);
    assert.equal(
      addDeposit({
        depositInput: "abc",
        defaultDepositMinor: null,
        totalMinor: 5000,
        applies: true,
      }).invalid,
      true,
    );
  });

  it("has no deposit for credit", () => {
    assert.equal(
      addDeposit({
        depositInput: null,
        defaultDepositMinor: 1500,
        totalMinor: 5000,
        applies: false,
      }).minor,
      null,
    );
  });
});

describe("editDeposit", () => {
  it("reads '' and 0 as no deposit, without an error", () => {
    assert.deepEqual(editDeposit({ depositInput: "", totalMinor: 5000, applies: true }), {
      minor: null,
      invalid: false,
    });
    assert.deepEqual(editDeposit({ depositInput: "0", totalMinor: 5000, applies: true }), {
      minor: null,
      invalid: false,
    });
  });

  it("points out an amount the clamp would throw away", () => {
    assert.deepEqual(editDeposit({ depositInput: "60", totalMinor: 5000, applies: true }), {
      minor: null,
      invalid: true,
    });
    assert.deepEqual(editDeposit({ depositInput: "20.00", totalMinor: 5000, applies: true }), {
      minor: 2000,
      invalid: false,
    });
  });

  it("doesn't apply without a total or for credit", () => {
    assert.deepEqual(editDeposit({ depositInput: "20", totalMinor: 5000, applies: false }), {
      minor: null,
      invalid: false,
    });
  });
});

describe("addBookingBlockers", () => {
  const ready = {
    words: PT,
    hasClient: true,
    hasService: true,
    vehicleMissing: false,
    hasLocation: true,
    scheduling: "slot" as const,
    hasSlot: true,
    slotsAvailable: true,
    hasCustomStaff: true,
    hasCustomWindow: true,
    allDay: false,
    clash: false,
    priceInvalid: false,
    depositInvalid: false,
  };
  const labels = (input: Parameters<typeof addBookingBlockers>[0]) =>
    addBookingBlockers(input).map((b) => b.label);

  it("is empty once everything is in", () => {
    assert.deepEqual(addBookingBlockers(ready), []);
  });

  it("lists what's missing in section order, with the trade's words", () => {
    assert.deepEqual(
      addBookingBlockers({
        ...ready,
        hasClient: false,
        hasService: false,
        hasLocation: false,
      }),
      [
        { label: "Choose a client", section: "client" },
        { label: "Choose a session", section: "services" },
        { label: "Choose a location", section: "when" },
      ],
    );
    assert.deepEqual(labels({ ...ready, words: AUTO, vehicleMissing: true }), ["Choose a vehicle"]);
  });

  it("asks for a slot, or a date with free times", () => {
    assert.deepEqual(labels({ ...ready, hasSlot: false }), ["Pick a time slot"]);
    assert.deepEqual(labels({ ...ready, hasSlot: false, slotsAvailable: false }), [
      "Pick a date with free times",
    ]);
  });

  it("asks a set time for a person and a window", () => {
    const custom = { ...ready, scheduling: "custom" as const };
    assert.deepEqual(labels({ ...custom, hasCustomStaff: false }), ["Choose a trainer"]);
    assert.deepEqual(labels({ ...custom, hasCustomWindow: false }), ["Set a start and end time"]);
    assert.deepEqual(labels({ ...custom, hasCustomWindow: false, allDay: true }), [
      "Set the first and last day",
    ]);
  });

  it("holds Create while a red clash shows", () => {
    assert.deepEqual(addBookingBlockers({ ...ready, scheduling: "custom", clash: true }), [
      { label: "Pick a free time", section: "when" },
    ]);
    // A slot from the quote is free by definition.
    assert.deepEqual(labels({ ...ready, clash: true }), []);
  });

  it("checks price and deposit only once a service is picked", () => {
    assert.deepEqual(labels({ ...ready, priceInvalid: true, depositInvalid: true }), [
      "Check the price",
      "Check the deposit",
    ]);
    assert.deepEqual(
      labels({ ...ready, hasService: false, priceInvalid: true, depositInvalid: true }),
      ["Choose a session"],
    );
  });

  it("counts what's left", () => {
    assert.equal(stillNeeded(1), "1 thing still needed");
    assert.equal(stillNeeded(3), "3 things still needed");
  });
});

describe("addBookingDirty", () => {
  const untouched = {
    customerId: "",
    defaultCustomerId: "",
    serviceId: "",
    defaultServiceId: "",
    additionalCount: 0,
    linkedRecordId: "none",
    defaultLinkedRecordId: "none",
    quickAddPending: false,
    slotPicked: false,
    notes: "",
    liftNeeded: false,
    priceInput: null,
    discount: null,
    linePriceCount: 0,
    depositInput: null,
    paymentTouched: false,
  };

  it("ignores what the form filled in itself", () => {
    assert.equal(addBookingDirty(untouched), false);
    // Opened from a client's profile with a follow-up's service and vehicle.
    assert.equal(
      addBookingDirty({
        ...untouched,
        customerId: "c1",
        defaultCustomerId: "c1",
        serviceId: "s1",
        defaultServiceId: "s1",
        linkedRecordId: "v1",
        defaultLinkedRecordId: "v1",
      }),
      false,
    );
    assert.equal(addBookingDirty({ ...untouched, notes: "   " }), false);
  });

  it("counts anything the person picked or typed", () => {
    const cases: Partial<typeof untouched>[] = [
      { customerId: "c1" },
      { serviceId: "s1" },
      { additionalCount: 1 },
      { linkedRecordId: "v1" },
      { quickAddPending: true },
      { slotPicked: true },
      { notes: "Gate code 1234" },
      { liftNeeded: true },
      { priceInput: "40" },
      { discount: { mode: "percent", value: "" } },
      { linePriceCount: 1 },
      { depositInput: "" },
      { paymentTouched: true },
    ];
    for (const change of cases) {
      assert.equal(addBookingDirty({ ...untouched, ...change }), true, JSON.stringify(change));
    }
  });
});

describe("footer summaries", () => {
  it("counts what's left on Add, named for the client once chosen", () => {
    assert.deepEqual(
      addFooterSummary({
        blockers: 2,
        clientName: null,
        when: null,
        serviceCount: 0,
        words: PT,
        totalMinor: 0,
        depositMinor: null,
        currency: "GBP",
        credit: false,
      }),
      { main: "New booking", sub: "2 things still needed", attention: true },
    );
    assert.equal(
      addFooterSummary({
        blockers: 1,
        clientName: "Jo Bloggs",
        when: null,
        serviceCount: 1,
        words: PT,
        totalMinor: 0,
        depositMinor: null,
        currency: "GBP",
        credit: false,
      }).main,
      "Jo Bloggs",
    );
  });

  it("shows what's booked once ready", () => {
    assert.deepEqual(
      addFooterSummary({
        blockers: 0,
        clientName: "Jo Bloggs",
        when: "Tue 20 Oct · 10:00 to 11:15",
        serviceCount: 2,
        words: PT,
        totalMinor: 5300,
        depositMinor: 1500,
        currency: "GBP",
        credit: false,
      }),
      {
        main: "Tue 20 Oct · 10:00 to 11:15",
        sub: "2 sessions · £53 · £15 deposit",
        attention: false,
      },
    );
    assert.equal(
      addFooterSummary({
        blockers: 0,
        clientName: "Jo Bloggs",
        when: "Tue 20 Oct · 10:00 to 11:00",
        serviceCount: 1,
        words: PT,
        totalMinor: 4000,
        depositMinor: null,
        currency: "GBP",
        credit: true,
      }).sub,
      "1 session · 1 credit",
    );
  });

  it("counts Edit's changes and says who hears about them", () => {
    assert.deepEqual(
      editFooterSummary({ changes: 0, amendDirty: false, notifying: false, name: "Jo" }),
      {
        main: "No changes yet",
        sub: "Nothing will be sent",
      },
    );
    assert.deepEqual(
      editFooterSummary({ changes: 1, amendDirty: false, notifying: false, name: "Jo" }),
      {
        main: "1 change",
        sub: "Only the diary changes",
      },
    );
    assert.deepEqual(
      editFooterSummary({ changes: 3, amendDirty: true, notifying: true, name: "Jo" }),
      {
        main: "3 changes",
        sub: "Jo will be sent the new details",
      },
    );
    assert.equal(
      editFooterSummary({ changes: 2, amendDirty: true, notifying: false, name: "Jo" }).sub,
      "Nothing will be sent",
    );
  });
});

describe("slotSummary", () => {
  const slot = {
    start: "2026-10-20T09:00:00Z",
    end: "2026-10-20T10:15:00Z",
    priceMinor: 5300,
    currency: "GBP",
    remainingCapacity: 1,
  };

  it("reads price, end and the grid step, with no slot token", () => {
    assert.equal(
      slotSummary({
        slot,
        timeZone: "Europe/London",
        multiDay: false,
        capacity: null,
        stepMinutes: 30,
      }),
      "£53 · ends 11:15 · free times every 30 minutes",
    );
  });

  it("adds places left for a group class", () => {
    assert.equal(
      slotSummary({
        slot: { ...slot, remainingCapacity: 4 },
        timeZone: "Europe/London",
        multiDay: false,
        capacity: 6,
        stepMinutes: 30,
      }),
      "£53 · ends 11:15 · 4 of 6 places left · free times every 30 minutes",
    );
  });

  it("reads drop-off and ready for a job over several days", () => {
    assert.equal(
      slotSummary({
        slot: {
          ...slot,
          start: "2026-10-20T08:30:00Z",
          end: "2026-10-21T16:00:00Z",
          priceMinor: 32000,
        },
        timeZone: "Europe/London",
        multiDay: true,
        capacity: null,
        stepMinutes: 30,
      }),
      "Drop-off Tue 09:30 · ready Wed 17:00 · £320",
    );
  });
});
