import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  avatarTintIndex,
  clientPill,
  clientStatsById,
  clientSubline,
  clientsSummary,
  defaultReminderChannel,
  EMPTY_STATS,
  findDuplicateClient,
  inView,
  isLapsed,
  matchesClientSearch,
  relativeVisitLabel,
  reminderChannelHint,
  sortClients,
  viewCounts,
  type ClientStats,
} from "./clients-list.ts";

const TZ = "Europe/London";
const NOW = new Date("2026-10-20T12:00:00Z");
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAfter = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

type B = Parameters<typeof clientStatsById>[0][number];
const booking = (over: Partial<B>): B => ({
  id: Math.random().toString(36).slice(2),
  leadCustomerId: "c1",
  attendees: [],
  start: daysBefore(3),
  allDay: false,
  status: "completed",
  attendanceStatus: "unknown",
  paymentMethod: "none",
  priceMinor: 4500,
  paidMinor: 4500,
  serviceSnapshot: { name: "Full valet" } as B["serviceSnapshot"],
  ...over,
});

const customer = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  firstName: "Harriet",
  lastName: "Cole",
  nickname: null as string | null,
  emailDisplay: "harriet@example.com" as string | null,
  emailNormalised: "harriet@example.com" as string | null,
  phoneDisplay: "07700 900123" as string | null,
  phoneNormalised: "+447700900123" as string | null,
  status: "active" as "active" | "archived" | "anonymised",
  createdAt: "2026-01-05T10:00:00Z",
  ...over,
});

describe("clientStatsById", () => {
  it("takes the latest attended past visit and the soonest live future booking", () => {
    const stats = clientStatsById(
      [
        booking({
          start: daysBefore(20),
          serviceSnapshot: { name: "Old" } as B["serviceSnapshot"],
        }),
        booking({
          start: daysBefore(2),
          serviceSnapshot: { name: "Recent" } as B["serviceSnapshot"],
        }),
        booking({ start: daysBefore(1), status: "no_show" }),
        booking({ start: daysAfter(9), status: "confirmed", paidMinor: 0 }),
        booking({
          start: daysAfter(2),
          status: "confirmed",
          paidMinor: 0,
          serviceSnapshot: { name: "Soon" } as B["serviceSnapshot"],
        }),
        booking({ start: daysAfter(1), status: "cancelled_by_customer" }),
      ],
      [],
      NOW,
    ).get("c1")!;
    assert.equal(stats.lastVisit?.service, "Recent");
    assert.equal(stats.nextBooking?.service, "Soon");
    assert.equal(stats.sessions, 2);
  });

  it("counts an attended booking for named attendees, but money only for the lead", () => {
    const stats = clientStatsById(
      [
        booking({
          attendees: [
            { id: "a1", name: "Harriet", isLead: true, customerId: "c1" },
            { id: "a2", name: "Sam", isLead: false, customerId: "c2" },
          ],
          paidMinor: 1000,
        }),
      ],
      [],
      NOW,
    );
    assert.equal(stats.get("c2")!.sessions, 1);
    assert.equal(stats.get("c2")!.owedMinor, 0);
    assert.equal(stats.get("c1")!.owedMinor, 3500);
  });

  it("only owes on past, chargeable jobs not paid by credit", () => {
    const stats = clientStatsById(
      [
        booking({ paidMinor: 2000 }),
        booking({ paidMinor: 0, paymentMethod: "credit" }),
        booking({ paidMinor: 0, status: "cancelled_by_business" }),
        booking({ paidMinor: 0, start: daysAfter(3), status: "confirmed" }),
        booking({ paidMinor: 0, priceMinor: 0 }),
      ],
      [],
      NOW,
    ).get("c1")!;
    assert.equal(stats.owedMinor, 2500);
  });

  it("adds package payments and takes refunds off the spend", () => {
    const stats = clientStatsById(
      [booking({ paidMinor: 4500 })],
      [
        {
          customerId: "c1",
          bookingId: null,
          amountMinor: 10000,
          amountRefundedMinor: 0,
          state: "succeeded",
        },
        {
          customerId: "c1",
          bookingId: "x",
          amountMinor: 4500,
          amountRefundedMinor: 500,
          state: "partially_refunded",
        },
        {
          customerId: "c1",
          bookingId: null,
          amountMinor: 999,
          amountRefundedMinor: 0,
          state: "failed",
        },
      ],
      NOW,
    ).get("c1")!;
    assert.equal(stats.spentMinor, 4500 + 10000 - 500);
  });
});

describe("relativeVisitLabel", () => {
  it("reads like a person would say it", () => {
    assert.equal(relativeVisitLabel(daysBefore(0), NOW, TZ), "Today");
    assert.equal(relativeVisitLabel(daysBefore(1), NOW, TZ), "Yesterday");
    assert.equal(relativeVisitLabel(daysBefore(3), NOW, TZ), "3 days ago");
    assert.equal(relativeVisitLabel(daysBefore(8), NOW, TZ), "1 week ago");
    assert.equal(relativeVisitLabel(daysBefore(15), NOW, TZ), "2 weeks ago");
    assert.equal(relativeVisitLabel(daysBefore(65), NOW, TZ), "2 months ago");
    assert.equal(relativeVisitLabel(daysBefore(400), NOW, TZ), "1 year ago");
  });
});

describe("tabs", () => {
  const stats = (over: Partial<ClientStats> = {}): ClientStats => ({ ...EMPTY_STATS, ...over });
  const lapsed = stats({ lastVisit: { at: daysBefore(70), allDay: false, service: "Valet" } });

  it("lapsed means seen 60+ days ago with nothing booked", () => {
    assert.equal(isLapsed(lapsed, NOW, TZ), true);
    assert.equal(
      isLapsed(
        { ...lapsed, nextBooking: { at: daysAfter(2), allDay: false, service: "x" } },
        NOW,
        TZ,
      ),
      false,
    );
    assert.equal(isLapsed(stats(), NOW, TZ), false);
  });

  it("keeps archived and anonymised clients out of every tab but Archived", () => {
    const archived = {
      customer: customer({ status: "archived", createdAt: daysBefore(1) }),
      stats: lapsed,
      credits: 3,
    };
    assert.equal(inView("all", archived, NOW, TZ), false);
    assert.equal(inView("new", archived, NOW, TZ), false);
    assert.equal(inView("lapsed", archived, NOW, TZ), false);
    assert.equal(inView("package", archived, NOW, TZ), false);
    assert.equal(inView("archived", archived, NOW, TZ), true);
    assert.equal(
      inView("archived", { ...archived, customer: customer({ status: "anonymised" }) }, NOW, TZ),
      true,
    );
  });

  it("counts each tab and builds the summary line", () => {
    const counts = viewCounts(
      [
        { customer: customer({ createdAt: "2026-10-02T09:00:00Z" }), stats: stats(), credits: 0 },
        { customer: customer(), stats: lapsed, credits: 2 },
        { customer: customer({ status: "archived" }), stats: stats(), credits: 0 },
      ],
      NOW,
      TZ,
    );
    assert.deepEqual(counts, { all: 2, new: 1, lapsed: 1, package: 1, archived: 1 });
    assert.equal(
      clientsSummary(counts),
      "2 clients · 1 new this month · 1 hasn't been back in 60 days",
    );
    assert.equal(clientsSummary({ all: 1, new: 0, lapsed: 0 }), "1 client");
  });
});

describe("pill and the line under the name", () => {
  const fmt = { money: (m: number) => `£${m / 100}`, date: () => "5 Oct" };

  it("shows one pill: Owes, then Package, then New, then Archived", () => {
    const base = {
      customer: customer({ createdAt: daysBefore(5) }),
      stats: EMPTY_STATS,
      credits: 0,
    };
    assert.equal(
      clientPill({ ...base, stats: { ...EMPTY_STATS, owedMinor: 100 }, credits: 2 }, NOW),
      "owes",
    );
    assert.equal(clientPill({ ...base, credits: 2 }, NOW), "package");
    assert.equal(clientPill(base, NOW), "new");
    assert.equal(clientPill({ ...base, stats: { ...EMPTY_STATS, sessions: 1 } }, NOW), null);
    assert.equal(
      clientPill({ ...base, customer: customer({ status: "archived" }) }, NOW),
      "archived",
    );
  });

  it("prefers known as, then the pill's detail, then sessions", () => {
    const row = {
      customer: customer(),
      stats: { ...EMPTY_STATS, owedMinor: 4500, sessions: 3 },
      credits: 0,
    };
    assert.equal(
      clientSubline({ ...row, customer: customer({ nickname: "red Audi" }) }, "owes", fmt),
      "Known as red Audi",
    );
    assert.equal(clientSubline(row, "owes", fmt), "£45 due");
    assert.equal(clientSubline(row, "owes", { ...fmt, money: null }), "3 sessions");
    assert.equal(clientSubline({ ...row, credits: 2 }, "package", fmt), "2 credits left");
    assert.equal(clientSubline(row, "new", fmt), "Added 5 Oct");
    assert.equal(clientSubline({ ...row, stats: EMPTY_STATS }, null, fmt), "No sessions yet");
  });
});

describe("matchesClientSearch", () => {
  it("matches names, known as, email and phone in either national or international form", () => {
    const c = customer({ nickname: "red Audi" });
    assert.equal(matchesClientSearch(c, "harriet cole"), true);
    assert.equal(matchesClientSearch(c, "audi"), true);
    assert.equal(matchesClientSearch(c, "@example"), true);
    assert.equal(matchesClientSearch(c, "07700 900"), true);
    assert.equal(matchesClientSearch(c, "+44 7700"), true);
    assert.equal(matchesClientSearch(c, "Sam"), false);
    assert.equal(matchesClientSearch(c, "12"), false);
  });
});

describe("sortClients", () => {
  const row = (name: string, s: Partial<ClientStats>, createdAt = "2026-01-01T00:00:00Z") => ({
    customer: { firstName: name, lastName: null, createdAt },
    stats: { ...EMPTY_STATS, ...s },
  });
  const a = row("Amy", {
    lastVisit: { at: daysBefore(10), allDay: false, service: "" },
    spentMinor: 100,
  });
  const b = row("Ben", {
    lastVisit: { at: daysBefore(2), allDay: false, service: "" },
    spentMinor: 900,
  });
  const c = row("Cat", {});

  it("puts the most recent visit first and never-seen clients last either way", () => {
    assert.deepEqual(
      sortClients([a, c, b], "last-visit", "desc").map((r) => r.customer.firstName),
      ["Ben", "Amy", "Cat"],
    );
    assert.deepEqual(
      sortClients([a, c, b], "last-visit", "asc").map((r) => r.customer.firstName),
      ["Amy", "Ben", "Cat"],
    );
  });

  it("sorts by name and by spend", () => {
    assert.deepEqual(
      sortClients([c, b, a], "name", "asc").map((r) => r.customer.firstName),
      ["Amy", "Ben", "Cat"],
    );
    assert.deepEqual(
      sortClients([a, b, c], "spent", "desc").map((r) => r.customer.firstName),
      ["Ben", "Amy", "Cat"],
    );
  });
});

describe("avatarTintIndex", () => {
  it("is stable and within the six tints", () => {
    const i = avatarTintIndex("8f6c5f0e-1b2a-4c3d-9e8f-0a1b2c3d4e5f");
    assert.equal(i, avatarTintIndex("8f6c5f0e-1b2a-4c3d-9e8f-0a1b2c3d4e5f"));
    assert.ok(i >= 0 && i < 6);
  });
});

describe("findDuplicateClient", () => {
  const existing = [
    customer(),
    customer({ id: "c9", status: "anonymised", emailNormalised: "gone@example.com" }),
  ];
  const draft = { email: "", phoneE164: null, firstName: "", lastName: "" };

  it("matches on email, then mobile, then full name", () => {
    assert.equal(
      findDuplicateClient(existing, { ...draft, email: " Harriet@Example.com " })?.reason,
      "email",
    );
    assert.equal(
      findDuplicateClient(existing, { ...draft, phoneE164: "+447700900123" })?.reason,
      "mobile",
    );
    assert.equal(
      findDuplicateClient(existing, { ...draft, firstName: "harriet", lastName: "COLE" })?.reason,
      "name",
    );
    assert.equal(findDuplicateClient(existing, { ...draft, firstName: "Harriet" }), null);
  });

  it("ignores anonymised records", () => {
    assert.equal(findDuplicateClient(existing, { ...draft, email: "gone@example.com" }), null);
  });
});

describe("reminder channel", () => {
  const sms = { canText: true, unlimited: false, balance: 42 };

  it("defaults to text only when a text would go and there's a mobile", () => {
    assert.equal(defaultReminderChannel(true, true), "sms");
    assert.equal(defaultReminderChannel(true, false), "email");
    assert.equal(defaultReminderChannel(false, true), "email");
  });

  it("warns when text is picked without a mobile or credits", () => {
    assert.deepEqual(reminderChannelHint("sms", sms, false).warn, true);
    assert.match(
      reminderChannelHint("sms", { ...sms, canText: false }, true).text,
      /out of text credits/,
    );
    assert.match(reminderChannelHint("sms", sms, true).text, /You have 42 text credits/);
    assert.equal(reminderChannelHint("email", sms, false).text, "Reminders go by email.");
  });
});
