/**
 * The decisions behind the staff Add booking and Edit booking forms, kept pure so
 * they can be tested without rendering a drawer: what is still missing, whether
 * closing would lose work, who the confirmation can reach, which pricing route is
 * in force, and the one-line summaries the sticky footer shows.
 */

import { linePriceMinor } from "./booking-price.ts";
import { effectiveDepositMinor } from "./booking-payment.ts";
import { discountOffMinor, type Discount } from "./discount.ts";
import { formatInTz, formatMoney, parseMoneyToMinor } from "./format.ts";

// ---- Words that change per business -------------------------------------------------

export type BookingWords = {
  /** "session" / "service", for sentences. */
  service: string;
  services: string;
  /** "Session" / "Service", for titles. */
  Service: string;
  Services: string;
  /** "Trainer" / "Detailer", for labels. */
  Staff: string;
  staff: string;
  booking: string;
  Vehicle: string;
  vehicle: string;
  vehicles: string;
};

const plural = (word: string) => (/s$/i.test(word) ? word : `${word}s`);
const capital = (word: string) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word);

export function bookingWords(terminology: {
  staff: string;
  service: string;
  booking: string;
  linkedRecord: string;
}): BookingWords {
  // Some businesses call their services "Job type"; sentences read "job".
  const service = (terminology.service.replace(/\s+type$/i, "").trim() || "Service").toLowerCase();
  const Staff = terminology.staff.trim() || "Staff";
  const vehicle = (terminology.linkedRecord.trim() || "Record").toLowerCase();
  return {
    service,
    services: plural(service),
    Service: capital(service),
    Services: capital(plural(service)),
    Staff,
    staff: Staff.toLowerCase(),
    booking: (terminology.booking.trim() || "Booking").toLowerCase(),
    Vehicle: capital(vehicle),
    vehicle,
    vehicles: plural(vehicle),
  };
}

/** "a, b and c". */
export function listInWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ---- Money and time -------------------------------------------------------------------

/** "£" for GBP, "€" for EUR: shown inside money inputs and on the "£ off" toggle. */
export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-GB", { style: "currency", currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Minor units as a money input shows them: always two decimals ("40.00"). */
export function moneyInputValue(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Summary lines may drop ".00" ("£53") but keep pence when there are some ("£53.50"). */
export function moneyShort(minor: number, currency: string): string {
  return minor % 100 === 0
    ? formatMoney(minor, currency, { compact: true })
    : formatMoney(minor, currency);
}

const hhmm = (iso: string, timeZone: string) =>
  formatInTz(iso, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "10:00 to 11:15", never "10:00–11:15". */
export function timeRange(startIso: string, endIso: string, timeZone: string): string {
  return `${hhmm(startIso, timeZone)} to ${hhmm(endIso, timeZone)}`;
}

const utcNoon = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`);

/** "Tue 20 Oct" for a `YYYY-MM-DD` date. */
export function dayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(utcNoon(isoDate))
    .replace(",", "");
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const d = utcNoon(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DayChip = { isoDate: string; label: string; weekday: string; day: string };

/**
 * The When section's day strip: today and the days after it ("Today 19", "Tue 20" …).
 * `todayIsoDate` is today on the business's clock, not the device's.
 */
export function dayStrip(todayIsoDate: string, count: number): DayChip[] {
  return Array.from({ length: count }, (_, i) => {
    const isoDate = addDaysToIsoDate(todayIsoDate, i);
    const date = utcNoon(isoDate);
    const weekday =
      i === 0
        ? "Today"
        : new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(date);
    const day = String(date.getUTCDate());
    return { isoDate, label: `${weekday} ${day}`, weekday, day };
  });
}

// ---- Telling the client ---------------------------------------------------------------

/** Remembered choice of confirmation channels; "on"/"off" are the pre-tick-box values. */
export const NOTIFY_PREFS = ["email", "sms", "both", "none", "on", "off"] as const;
export type NotifyPref = (typeof NOTIFY_PREFS)[number];
export type NotifyChannel = "email" | "sms";
export type ChannelTicks = { email: boolean; sms: boolean };
export type ContactBlocks = { email: string | null; sms: string | null };

export function notifyTicks(pref: NotifyPref): ChannelTicks {
  return {
    email: pref === "email" || pref === "both" || pref === "on",
    sms: pref === "sms" || pref === "both",
  };
}

export function notifyPrefFrom(ticks: ChannelTicks): NotifyPref {
  return ticks.email && ticks.sms ? "both" : ticks.email ? "email" : ticks.sms ? "sms" : "none";
}

/**
 * Why a channel can't reach this client, or null when it can. A box is greyed out (not
 * silently ignored) so staff see why before they save rather than in the history later.
 */
export function contactBlocks(
  customer: {
    emailDisplay?: string | null;
    emailNormalised?: string | null;
    phoneDisplay?: string | null;
    phoneNormalised?: string | null;
    contactPreferences?: { operationalNotifications?: boolean | null } | null;
  } | null,
  smsCreditsEmpty: boolean,
): ContactBlocks {
  if (!customer) return { email: null, sms: null };
  return {
    email: customer.emailDisplay || customer.emailNormalised ? null : "no email address on file",
    sms: !(customer.phoneDisplay || customer.phoneNormalised)
      ? "no mobile number on file"
      : customer.contactPreferences?.operationalNotifications === false
        ? "they've turned off text messages"
        : smsCreditsEmpty
          ? "you have no text credits left"
          : null,
  };
}

/** The ticked channels that can actually reach the client, email first. */
export function reachableChannels(ticks: ChannelTicks, blocks: ContactBlocks): NotifyChannel[] {
  return [
    ...(ticks.email && !blocks.email ? (["email"] as const) : []),
    ...(ticks.sms && !blocks.sms ? (["sms"] as const) : []),
  ];
}

function channelsInWords(channels: readonly NotifyChannel[]): string {
  return channels.length === 2 ? "email and text" : channels[0] === "sms" ? "text" : "email";
}

function blockedNotes(blocks: ContactBlocks): string[] {
  return [
    blocks.email ? `Email is off: ${blocks.email}.` : null,
    blocks.sms ? `Text is off: ${blocks.sms}.` : null,
  ].filter((x): x is string => x !== null);
}

/** Hint under Add booking's "Send confirmation" boxes. */
export function addNotifyHint(channels: readonly NotifyChannel[], blocks: ContactBlocks): string {
  const blocked = blockedNotes(blocks);
  if (channels.length === 0) {
    return [
      "Nothing is sent now. Use Resend on the booking when they're ready to hear from you.",
      ...blocked,
    ].join(" ");
  }
  return [
    `Goes out by ${channelsInWords(channels)} as soon as the booking is created.`,
    ...blocked,
  ].join(" ");
}

/**
 * What Edit booking ticks before staff touch the boxes: nothing unless the client would
 * notice a change, then the remembered channels that reach them. When the remembered
 * choice reaches nobody it falls back to whichever channel does, so a change the client
 * should hear about is never silently unsent.
 */
export function editDefaultTicks(input: {
  pref: NotifyPref;
  blocks: ContactBlocks;
  clientVisible: boolean;
}): ChannelTicks {
  if (!input.clientVisible) return { email: false, sms: false };
  const remembered = reachableChannels(notifyTicks(input.pref), input.blocks);
  if (remembered.length > 0) {
    return { email: remembered.includes("email"), sms: remembered.includes("sms") };
  }
  if (!input.blocks.email) return { email: true, sms: false };
  if (!input.blocks.sms) return { email: false, sms: true };
  return { email: false, sms: false };
}

/** Hint under Edit booking's "Send {name} the updated details" boxes. */
export function editNotifyHint(input: {
  name: string;
  /** Something other than the date fix changed. */
  amendDirty: boolean;
  /** Only the date fix changed. */
  onlyDateFix: boolean;
  channels: readonly NotifyChannel[];
  blocks: ContactBlocks;
  /** The boxes still show what the form ticked (staff haven't touched them). */
  followingDefault: boolean;
  /** Lower-case names of what the client would notice: "session", "price". */
  visibleChanges: readonly string[];
  /** Moving off a bank transfer that is still waiting for the money. */
  leavesBankPending: boolean;
  /** Payment request (pay up front) or a plain confirmation, for the bank case. */
  nextMessage: "payment request" | "confirmation";
}): { text: string; tone: "muted" | "destructive" } {
  const { name, channels, blocks } = input;
  if (input.onlyDateFix) {
    return {
      text: "A date fix isn't sent to the client. Use Reschedule if they need to know.",
      tone: "muted",
    };
  }
  const unreachable = Boolean(blocks.email && blocks.sms);
  if (input.amendDirty && unreachable && input.followingDefault && input.visibleChanges.length) {
    return {
      text: `Can't reach ${name}: ${[blocks.email, blocks.sms].join("; ")}.`,
      tone: "destructive",
    };
  }
  if (channels.length === 0) {
    return {
      text: "Nothing is sent. Use Resend on the booking if you change your mind.",
      tone: "muted",
    };
  }
  const blocked = blocks.sms ? [`Text is off: ${blocks.sms}.`] : [];
  if (input.leavesBankPending) {
    return {
      text: [
        `${name} gets a fresh ${input.nextMessage} by ${channelsInWords(channels)} for the new way of paying, replacing the transfer message.`,
        ...blocked,
      ].join(" "),
      tone: "muted",
    };
  }
  const because =
    input.followingDefault && input.visibleChanges.length > 0
      ? `Ticked because the ${listInWords(input.visibleChanges)} changed. `
      : "";
  return {
    text: [
      `${because}${name} gets the confirmation again by ${channelsInWords(channels)} with the new details.`,
      ...blocked,
    ].join(" "),
    tone: "muted",
  };
}

// ---- Payment method ---------------------------------------------------------------------

/**
 * How the money is handled. `none` = pay up front (the confirmation is a payment
 * request); `pay_later` = pay after the job (plain confirmation, payment taken later);
 * `credit` / `bank_transfer` as named.
 */
export type PaymentMethod = "none" | "credit" | "bank_transfer" | "pay_later";

/** Package credit is left out: it depends on the client, not the business's habits. */
export const REMEMBERED_METHODS = ["none", "pay_later", "bank_transfer"] as const;
export type RememberedMethod = (typeof REMEMBERED_METHODS)[number];
export const isRememberedMethod = (m: PaymentMethod): m is RememberedMethod =>
  (REMEMBERED_METHODS as readonly string[]).includes(m);

/** One name for each option, in both forms. */
export const PAYMENT_METHOD_NAMES: Record<PaymentMethod, string> = {
  none: "Pay up front",
  pay_later: "Pay after the job",
  credit: "Package credit",
  bank_transfer: "Bank transfer",
};

/**
 * The method a new booking opens on: the last one used here; for a first booking,
 * pay after the job for detailing (the norm in that trade) and up front for everyone
 * else. A remembered bank transfer that has since been switched off falls back to up front.
 */
export function defaultPaymentMethod(input: {
  lastMethod: RememberedMethod | "unset";
  isCarDetailing: boolean;
  bankTransferEnabled: boolean;
}): RememberedMethod {
  if (input.lastMethod === "unset") return input.isCarDetailing ? "pay_later" : "none";
  if (input.lastMethod === "bank_transfer" && !input.bankTransferEnabled) return "none";
  return input.lastMethod;
}

// ---- Price -------------------------------------------------------------------------------

export type PriceRow = {
  /** What staff typed on the row (major units), or undefined when untouched. */
  typed: string | undefined;
  /** The row's list price: variant, then pairing, then base. */
  listMinor: number;
};

export type JobPrice = {
  discountMinor: number | null;
  discountInvalid: boolean;
  /** Some row has a typed price (even one equal to its list). */
  linePricesTouched: boolean;
  lineInvalid: boolean;
  lineTotalMinor: number;
  /** Some row is charged at other than its list price. */
  linesRepriced: boolean;
  priceOverridden: boolean;
  overridePriceMinor: number | null;
  priceInvalid: boolean;
  effectiveTotalMinor: number;
  priceChanged: boolean;
};

/**
 * The three pricing routes (a price on a row, a whole-job total, a discount) and the
 * total they come to. They are alternatives the forms keep exclusive; when more than
 * one is present the typed total wins, then the discount, then the rows.
 */
export function jobPrice(input: {
  rolledTotalMinor: number;
  priceInput: string | null;
  discount: Discount | null;
  rows: readonly PriceRow[];
}): JobPrice {
  const { rolledTotalMinor, priceInput, discount, rows } = input;
  const lineTotalMinor = rows.reduce((sum, r) => {
    const typed = linePriceMinor(r.typed);
    return sum + (typeof typed === "number" ? typed : r.listMinor);
  }, 0);
  const linePricesTouched = rows.some((r) => r.typed !== undefined);
  const lineInvalid = rows.some((r) => linePriceMinor(r.typed) === null);
  const linesRepriced = rows.some((r) => {
    const typed = linePriceMinor(r.typed);
    return typeof typed === "number" && typed !== r.listMinor;
  });
  const discountMinor = discount ? discountOffMinor(rolledTotalMinor, discount) : null;
  const discountInvalid =
    discount !== null && discount.value.trim() !== "" && discountMinor === null;
  const priceOverridden = priceInput !== null || discountMinor !== null || linePricesTouched;
  const overridePriceMinor: number | null = (() => {
    if (priceInput !== null) {
      try {
        const minor = parseMoneyToMinor(priceInput);
        return minor >= 0 ? minor : null;
      } catch {
        return null;
      }
    }
    if (discountMinor !== null) return rolledTotalMinor - discountMinor;
    if (linePricesTouched) return lineInvalid ? null : lineTotalMinor;
    return null;
  })();
  const priceInvalid = (priceOverridden && overridePriceMinor === null) || discountInvalid;
  const effectiveTotalMinor = overridePriceMinor ?? rolledTotalMinor;
  return {
    discountMinor,
    discountInvalid,
    linePricesTouched,
    lineInvalid,
    lineTotalMinor,
    linesRepriced,
    priceOverridden,
    overridePriceMinor,
    priceInvalid,
    effectiveTotalMinor,
    priceChanged: overridePriceMinor !== null && overridePriceMinor !== rolledTotalMinor,
  };
}

export type PriceMode = "list" | "per_service" | "whole_job" | "discount";

/** Which route is in force, for the mode chip. Only one shows at a time. */
export function priceMode(
  price: Pick<JobPrice, "linesRepriced" | "discountMinor" | "priceChanged">,
): PriceMode {
  if (price.linesRepriced) return "per_service";
  if (price.discountMinor !== null && price.priceChanged) return "discount";
  if (price.priceChanged) return "whole_job";
  return "list";
}

export function priceModeLabel(mode: PriceMode, words: Pick<BookingWords, "service">): string {
  switch (mode) {
    case "list":
      return "List price";
    case "per_service":
      return `Priced per ${words.service}`;
    case "whole_job":
      return "Whole-job price";
    case "discount":
      return "Discount";
  }
}

/** The red line that replaces the price help while something won't save. */
export function priceError(
  price: Pick<JobPrice, "discountInvalid" | "lineInvalid">,
  discount: Discount | null,
  listLabel: string,
  words: Pick<BookingWords, "service">,
): string {
  if (price.discountInvalid) {
    return discount?.mode === "percent"
      ? "Enter a percentage between 0 and 100."
      : `Enter an amount up to ${listLabel}.`;
  }
  if (price.lineInvalid) {
    return `One of the ${words.service} prices isn't an amount. Fix it, or clear it to use the list price.`;
  }
  return "Enter an amount, or reset to the list price.";
}

// ---- Deposit -------------------------------------------------------------------------------

/**
 * Add booking's deposit. `input` null = follow the services' configured deposits;
 * "" = staff cleared it, i.e. no deposit. Only an amount strictly between nothing and
 * the total secures a booking.
 */
export function addDeposit(input: {
  depositInput: string | null;
  defaultDepositMinor: number | null;
  totalMinor: number;
  applies: boolean;
}): { minor: number | null; invalid: boolean; overridden: boolean } {
  const { depositInput, defaultDepositMinor, totalMinor, applies } = input;
  const overridden = depositInput !== null;
  const minor: number | null = (() => {
    if (!applies) return null;
    if (depositInput === null) return defaultDepositMinor;
    if (!depositInput.trim()) return null;
    try {
      const typed = parseMoneyToMinor(depositInput);
      return typed > 0 && typed < totalMinor ? typed : null;
    } catch {
      return null;
    }
  })();
  const invalid =
    depositInput !== null &&
    depositInput.trim() !== "" &&
    (() => {
      try {
        const typed = parseMoneyToMinor(depositInput);
        return typed < 0 || typed >= totalMinor;
      } catch {
        return true;
      }
    })();
  return { minor, invalid, overridden };
}

/**
 * Edit booking's deposit: "" = no deposit, and a literal 0 means the same. An amount
 * the clamp would throw away is a mistake to point out, not to apply silently.
 */
export function editDeposit(input: {
  depositInput: string;
  totalMinor: number;
  applies: boolean;
}): { minor: number | null; invalid: boolean } {
  const { depositInput, totalMinor, applies } = input;
  const typed: number | null = (() => {
    if (depositInput.trim() === "") return null;
    try {
      return parseMoneyToMinor(depositInput);
    } catch {
      return null;
    }
  })();
  const minor = applies ? effectiveDepositMinor(typed, totalMinor) : null;
  const invalid = applies && depositInput.trim() !== "" && minor === null && typed !== 0;
  return { minor, invalid };
}

// ---- What's still missing -------------------------------------------------------------------

/** Add booking's sections, in the order they appear. */
export const ADD_SECTIONS = {
  client: 1,
  services: 2,
  when: 3,
  price: 4,
  payment: 5,
  notes: 6,
} as const;
export type AddSection = keyof typeof ADD_SECTIONS;

export type Blocker = { label: string; section: AddSection };

/**
 * Everything still standing between Add booking and a booking, in the order the
 * sections appear. The Create button stays clickable while this is non-empty so a
 * click can say what's missing instead of silently doing nothing.
 */
export function addBookingBlockers(input: {
  words: Pick<BookingWords, "service" | "vehicle" | "staff">;
  hasClient: boolean;
  hasService: boolean;
  vehicleMissing: boolean;
  hasLocation: boolean;
  scheduling: "slot" | "custom";
  hasSlot: boolean;
  slotsAvailable: boolean;
  hasCustomStaff: boolean;
  hasCustomWindow: boolean;
  allDay: boolean;
  /** A hand-set time lands on timed work or an event: it has to move. */
  clash: boolean;
  priceInvalid: boolean;
  depositInvalid: boolean;
}): Blocker[] {
  const { words } = input;
  const out: Blocker[] = [];
  if (!input.hasClient) out.push({ label: "Choose a client", section: "client" });
  if (!input.hasService) out.push({ label: `Choose a ${words.service}`, section: "services" });
  if (input.vehicleMissing) out.push({ label: `Choose a ${words.vehicle}`, section: "client" });
  if (!input.hasLocation) out.push({ label: "Choose a location", section: "when" });
  if (input.hasService) {
    if (input.scheduling === "slot") {
      if (!input.hasSlot) {
        out.push({
          label: input.slotsAvailable ? "Pick a time slot" : "Pick a date with free times",
          section: "when",
        });
      }
    } else {
      if (!input.hasCustomStaff) out.push({ label: `Choose a ${words.staff}`, section: "when" });
      if (!input.hasCustomWindow) {
        out.push({
          label: input.allDay ? "Set the first and last day" : "Set a start and end time",
          section: "when",
        });
      } else if (input.clash) {
        out.push({ label: "Pick a free time", section: "when" });
      }
    }
    if (input.priceInvalid) out.push({ label: "Check the price", section: "price" });
    if (input.depositInvalid) out.push({ label: "Check the deposit", section: "payment" });
  }
  return out;
}

/** "1 thing still needed" / "3 things still needed". */
export function stillNeeded(count: number): string {
  return `${count} ${count === 1 ? "thing" : "things"} still needed`;
}

// ---- Would closing lose work? ------------------------------------------------------------

/**
 * Anything a person typed or picked themselves counts as work worth protecting; what the
 * form filled in on their behalf (location, staff, date, the default payment method, a
 * pre-fill from where it was opened) does not.
 */
export function addBookingDirty(input: {
  customerId: string;
  defaultCustomerId: string;
  serviceId: string;
  defaultServiceId: string;
  additionalCount: number;
  linkedRecordId: string;
  defaultLinkedRecordId: string;
  quickAddPending: boolean;
  slotPicked: boolean;
  notes: string;
  liftNeeded: boolean;
  priceInput: string | null;
  discount: Discount | null;
  linePriceCount: number;
  depositInput: string | null;
  /** Staff picked a payment method themselves. */
  paymentTouched: boolean;
}): boolean {
  return (
    input.customerId !== input.defaultCustomerId ||
    input.serviceId !== input.defaultServiceId ||
    input.additionalCount > 0 ||
    input.linkedRecordId !== input.defaultLinkedRecordId ||
    input.quickAddPending ||
    input.slotPicked ||
    input.notes.trim() !== "" ||
    input.liftNeeded ||
    input.priceInput !== null ||
    input.discount !== null ||
    input.linePriceCount > 0 ||
    input.depositInput !== null ||
    input.paymentTouched
  );
}

// ---- Footer summaries -----------------------------------------------------------------------

/**
 * The sticky footer's two lines for Add booking: what's booked so far once nothing is
 * missing, else who it's for and how many things are left.
 */
export function addFooterSummary(input: {
  blockers: number;
  clientName: string | null;
  /** "Tue 20 Oct · 10:00 to 11:15", from the When section; null while unset. */
  when: string | null;
  serviceCount: number;
  words: Pick<BookingWords, "service" | "services">;
  totalMinor: number;
  depositMinor: number | null;
  currency: string;
  credit: boolean;
}): { main: string; sub: string; attention: boolean } {
  if (input.blockers > 0 || !input.when) {
    return {
      main: input.clientName ?? "New booking",
      sub: stillNeeded(Math.max(1, input.blockers)),
      attention: true,
    };
  }
  const noun = input.serviceCount === 1 ? input.words.service : input.words.services;
  const money = input.credit
    ? ["1 credit"]
    : [
        moneyShort(input.totalMinor, input.currency),
        ...(input.depositMinor != null
          ? [`${moneyShort(input.depositMinor, input.currency)} deposit`]
          : []),
      ];
  return {
    main: input.when,
    sub: [`${input.serviceCount} ${noun}`, ...money].join(" · "),
    attention: false,
  };
}

/** The sticky footer's two lines for Edit booking. */
export function editFooterSummary(input: {
  changes: number;
  amendDirty: boolean;
  notifying: boolean;
  name: string;
}): { main: string; sub: string } {
  const main =
    input.changes === 0
      ? "No changes yet"
      : `${input.changes} ${input.changes === 1 ? "change" : "changes"}`;
  const sub =
    input.changes > 0 && !input.amendDirty
      ? "Only the diary changes"
      : input.amendDirty && input.notifying
        ? `${input.name} will be sent the new details`
        : "Nothing will be sent";
  return { main, sub };
}

// ---- The line under a picked slot ------------------------------------------------------------

/**
 * "£53 · ends 11:15 · free times every 30 minutes"; a group class adds "4 of 6 places
 * left"; a job over several days reads "Drop-off Tue 09:30 · ready Wed 17:00 · £320".
 */
export function slotSummary(input: {
  slot: {
    start: string;
    end: string;
    priceMinor: number;
    currency: string;
    remainingCapacity: number;
  };
  timeZone: string;
  multiDay: boolean;
  /** Places a group class holds, when the service is a group. */
  capacity: number | null;
  stepMinutes: number;
}): string {
  const { slot, timeZone } = input;
  const price = moneyShort(slot.priceMinor, slot.currency);
  if (input.multiDay) {
    const at = (iso: string) =>
      formatInTz(iso, timeZone, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).replace(",", "");
    return `Drop-off ${at(slot.start)} · ready ${at(slot.end)} · ${price}`;
  }
  const places =
    input.capacity !== null && input.capacity > 1
      ? `${slot.remainingCapacity} of ${input.capacity} places left`
      : slot.remainingCapacity > 1
        ? `${slot.remainingCapacity} places left`
        : null;
  return [
    price,
    `ends ${hhmm(slot.end, timeZone)}`,
    ...(places ? [places] : []),
    `free times every ${input.stepMinutes} minutes`,
  ].join(" · ");
}
