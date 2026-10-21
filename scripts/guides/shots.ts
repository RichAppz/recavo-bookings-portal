/**
 * Declarative list of the screenshots behind the support guides. Each entry maps
 * one guide step image (`guide` slug + `step` image name from src/content/guides)
 * to a route and the clicks needed to get the screen into the right state.
 *
 * `capture.mts` runs this list as each fictional business at both viewports and
 * reports any image the content model expects that has no shot here (and vice
 * versa), so adding a step image to a guide without a matching shot fails loudly.
 */
import type { Locator, Page } from "playwright";
import type { Vertical } from "./lib.mts";

export type Viewport = "desktop" | "mobile";

export type ShotContext = {
  page: Page;
  vertical: Vertical;
  viewport: Viewport;
  isMobile: boolean;
  /** Navigate to an app path and wait for the screen to settle. */
  go: (path: string) => Promise<void>;
  /** Wait for loading skeletons and animations to finish. */
  settle: (ms?: number) => Promise<void>;
  /** Open the sidebar / navigation drawer on mobile (no-op on desktop). */
  openNav: () => Promise<void>;
  /** The first calendar event whose visible text contains `text`. */
  calendarEvent: (text: string | RegExp) => Locator;
  /** A calendar chip picked by accessible label, visible text and position among matches. */
  calendarChip: (spec: ChipSpec) => Locator;
  /** Make the team business or the one-person business (both seeded) the active one. */
  useBusiness: (which: BusinessKind) => Promise<void>;
};

/** The seed gives each account a team business and a one-person (Solo) business. */
export type BusinessKind = "team" | "solo";

/**
 * How to find one booking chip on the week calendar. Labels read like
 * "Coaching · Personal training session, Hannah Reid, Thursday 22 October 07:00 to 08:00,
 * Unpaid · £45.00 due" (automotive ones start with the registration, all-day ones with
 * "All day:"); `text` narrows by the visible start
 * time and `nth` picks among identical chips in day order.
 */
export type ChipSpec = { label: RegExp; text?: RegExp; nth?: number };

export type Shot = {
  guide: string;
  step: string;
  /** Verticals this shot applies to. Defaults to every vertical the guide names. */
  verticals?: Vertical[];
  /** Which of the account's businesses to shoot as. Defaults to the team. */
  business?: BusinessKind;
  route: string;
  prepare?: (ctx: ShotContext) => Promise<void>;
  /** Capture the whole scrollable page rather than the viewport. */
  fullPage?: boolean;
  /** Capture just this element (with a little padding). */
  clip?: (ctx: ShotContext) => Locator;
  /** Render with the OS dark colour scheme. */
  dark?: boolean;
  /** Cut the network after the page has loaded, so the offline strip shows. */
  offline?: boolean;
};

const PT: Vertical = "personal_training";
const AUTO: Vertical = "car_detailing";

// Fixed names from scripts/guides/seed.mts, so shots can find things by label.
export const NAMES = {
  [PT]: {
    client: "Hannah Reid",
    clientFirst: "Hannah",
    secondClient: "Marcus Bell",
    staff: "Sam Okafor",
    secondStaff: "Priya Nair",
    service: "Personal training session",
    groupService: "Group HIIT class",
    location: "Peak Studio, Leeds",
    packageName: "10-session block",
    event: "Level 3 CPD workshop",
    business: "Peak Performance PT",
    soloBusiness: "Okafor Coaching",
  },
  [AUTO]: {
    client: "Oliver Grant",
    clientFirst: "Oliver",
    secondClient: "Sophie Marsh",
    staff: "Jordan Blake",
    secondStaff: "Taylor Morgan",
    service: "Full valet",
    groupService: "Paint correction",
    location: "Unit 4, Riverside Trading Estate",
    packageName: "",
    event: "Van MOT",
    business: "Prestige Auto Care",
    soloBusiness: "Blake Mobile Valeting",
  },
} as const satisfies Record<Vertical, Record<string, string>>;

/** Click a button by its visible name and wait for a dialog to appear. */
async function openDialog(ctx: ShotContext, name: string | RegExp): Promise<void> {
  await ctx.page.getByRole("button", { name }).first().click();
  await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
  await ctx.settle(400);
}

/** Scroll an open dialog so the section headed `label` sits at the top of the frame. */
async function scrollDialogTo(ctx: ShotContext, label: string): Promise<void> {
  const heading = ctx.page.getByRole("dialog").getByText(label, { exact: true }).first();
  await heading.waitFor({ timeout: 10_000 });
  await heading.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await ctx.settle(300);
}

/** Open a booking's side panel by clicking its chip on the calendar (matched by label). */
async function openBooking(ctx: ShotContext, chip: ChipSpec): Promise<void> {
  await ctx.calendarChip(chip).click();
  await bookingPanel(ctx).waitFor({ timeout: 10_000 });
  await ctx.settle(700);
}

/** The open booking panel (the page has other, hidden, asides). */
function bookingPanel(ctx: ShotContext): Locator {
  return ctx.page
    .locator("aside")
    .filter({ has: ctx.page.getByRole("tab", { name: /^Details/ }) })
    .first();
}

/** Pick an item from the booking panel's "More actions" menu. */
async function moreActions(ctx: ShotContext, item: RegExp): Promise<void> {
  await ctx.page.getByRole("button", { name: "More actions" }).first().click();
  await ctx.page.getByRole("menuitem", { name: item }).first().click();
  await ctx.settle(600);
}

/** Switch tab inside the booking panel. */
async function panelTab(ctx: ShotContext, name: RegExp): Promise<void> {
  await bookingPanel(ctx).getByRole("tab", { name }).first().click();
  await ctx.settle(600);
}

/** Open the Add booking sheet from the calendar's own button. */
async function openAddBooking(ctx: ShotContext): Promise<void> {
  await openFromCalendar(ctx, /^Add (session|job|booking)$/i, /Add booking/i);
}

/** A calendar toolbar button, or (on phones, where the toolbar hides it) the same item on the New booking menu. */
async function openFromCalendar(ctx: ShotContext, button: RegExp, menuItem: RegExp): Promise<void> {
  const direct = ctx.page.getByRole("button", { name: button }).first();
  if (await direct.isVisible().catch(() => false)) {
    await openDialog(ctx, button);
    return;
  }
  await ctx.page
    .getByRole("button", { name: /^New booking$/ })
    .first()
    .click();
  await ctx.page.getByRole("menuitem", { name: menuItem }).first().click();
  await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
  await ctx.settle(400);
}

/** Choose a client in the Add booking / waitlist / invoice forms. */
async function pickClient(ctx: ShotContext, name: string): Promise<void> {
  await ctx.page
    .getByRole("combobox")
    .filter({ hasText: /Choose or search for a client/i })
    .first()
    .click();
  await ctx.page.getByPlaceholder(/Search clients/i).fill(name.split(" ")[0]!);
  await ctx.page
    .getByRole("option", { name: new RegExp(name) })
    .first()
    .click();
  await ctx.settle(500);
}

/** Tick one service in the Add booking form's multi-picker and close it. */
async function pickService(ctx: ShotContext, name: string): Promise<void> {
  await ctx.page
    .getByRole("combobox")
    .filter({ hasText: /Choose services/i })
    .first()
    .click();
  await ctx.page.getByPlaceholder(/Search services/i).fill(name);
  await ctx.page
    .getByRole("option", { name: new RegExp(name) })
    .first()
    .click();
  await ctx.page
    .getByRole("button", { name: /^Done$/ })
    .first()
    .click();
  await ctx.settle(500);
}

/** Open a client's profile from the Clients list. */
async function openClient(ctx: ShotContext, name: string): Promise<void> {
  await ctx.page.locator("main a, main button").filter({ hasText: name }).first().click();
  await ctx.page
    .getByRole("tab", { name: /Overview/i })
    .first()
    .waitFor({ timeout: 10_000 });
  await ctx.settle(700);
}

async function clientTab(ctx: ShotContext, name: RegExp): Promise<void> {
  await ctx.page.getByRole("tab", { name }).first().click();
  await ctx.settle(700);
}

// Bookings from scripts/guides/seed.mts, relative to the seed day (a Tuesday in the shots).
/** Tomorrow's paid booking — the tidy "just made" example. */
const PAID: Record<Vertical, ChipSpec> = {
  [PT]: { label: /Personal training session, .*Paid in full/, text: /^07:00/, nth: 1 },
  [AUTO]: { label: /RJ18 WSA.*Full valet.*Paid in full/ },
};
/** A future booking with money outstanding, for payment shots. */
const UNPAID: Record<Vertical, ChipSpec> = {
  [PT]: { label: /Personal training session, .*Unpaid/, text: /^07:00/, nth: 1 },
  [AUTO]: { label: /LT21 KDX.*Maintenance wash.*Unpaid/ },
};
/** A booking waiting on a bank transfer. */
const BANK: Record<Vertical, ChipSpec> = {
  [PT]: { label: /Personal training session, .*Unpaid/, text: /^13:00/ },
  [AUTO]: { label: /All day:.*Ceramic coating/ },
};
/** A booking earlier today, so attendance can be marked. */
const EARLIER_TODAY: Record<Vertical, ChipSpec> = {
  [PT]: { label: /Personal training session, .*Unpaid/, text: /^07:00/, nth: 0 },
  [AUTO]: { label: /YE19 PQR.*Wheels-off detail.*Unpaid/ },
};
/** The automotive two-day job with a client lift. */
const MULTI_DAY: ChipSpec = { label: /All day:.*Paint correction/ };
const GROUP_CLASS: ChipSpec = { label: /Group HIIT/ };

/** Replace the dev origin in visible text so links read like production. */
async function maskLocalhost(ctx: ShotContext): Promise<void> {
  await ctx.page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      if (node.nodeValue?.includes("localhost:8080")) {
        node.nodeValue = node.nodeValue.replace(
          /https?:\/\/localhost:8080|localhost:8080/g,
          "book.recavo.app",
        );
      }
    }
    for (const input of Array.from(document.querySelectorAll<HTMLInputElement>("input"))) {
      if (input.value.includes("localhost:8080"))
        input.value = input.value.replace(/localhost:8080/g, "book.recavo.app");
    }
  });
}

/** A card/section on the page containing the given text. */
function card(ctx: ShotContext, text: string | RegExp): Locator {
  // Document order puts ancestors first, so the last match is the innermost card.
  return ctx.page
    .locator("main section, main [data-slot=card], main .rounded-xl, main .rounded-2xl")
    .filter({ hasText: text })
    .last();
}

/** A settings page section, by its exact heading. */
function settingsSection(ctx: ShotContext, title: string): Locator {
  return ctx.page
    .locator("main section")
    .filter({ has: ctx.page.locator("h3", { hasText: new RegExp(`^${title}$`) }) })
    .last();
}

const SETUP: Shot[] = [
  { guide: "add-your-location", step: "locations", route: "/locations" },
  {
    guide: "add-your-location",
    step: "location-form",
    route: "/locations",
    prepare: (ctx) => openDialog(ctx, /^Edit location$/i),
  },
  { guide: "add-staff-and-hours", step: "staff", route: "/staff" },
  {
    guide: "add-staff-and-hours",
    step: "staff-form",
    route: "/staff",
    prepare: (ctx) => openDialog(ctx, /Add staff/i),
  },
  {
    guide: "add-staff-and-hours",
    step: "staff-hours",
    route: "/staff",
    prepare: async (ctx) => {
      await ctx.page.getByRole("button", { name: NAMES[ctx.vertical].secondStaff }).first().click();
      await ctx.settle(500);
    },
    clip: (ctx) => card(ctx, /Weekly availability/i),
  },
  {
    guide: "add-staff-and-hours",
    step: "solo-availability",
    business: "solo",
    route: "/services",
    prepare: async (ctx) => {
      await openDialog(ctx, /^Edit (session|service)$/i);
      await scrollDialogTo(ctx, "Your availability");
    },
  },
  { guide: "create-your-services", step: "services", route: "/services" },
  {
    guide: "create-your-services",
    step: "service-form",
    route: "/services",
    prepare: (ctx) => openDialog(ctx, /Create session|Create service/i),
  },
  {
    guide: "create-your-services",
    step: "service-availability",
    business: "solo",
    route: "/services",
    prepare: async (ctx) => {
      await openDialog(ctx, /Create session|Create service/i);
      await scrollDialogTo(ctx, "Your availability");
    },
  },
  {
    guide: "share-your-booking-page",
    step: "booking-link",
    route: "/settings/business",
    prepare: async (ctx) => {
      await maskLocalhost(ctx);
      // Phones stack the sections, leaving Booking link below the fold.
      if (ctx.isMobile) {
        await ctx.page
          .locator("main h3", { hasText: /^Booking link$/ })
          .first()
          .evaluate((el) => el.scrollIntoView({ block: "center" }));
        await ctx.settle(300);
      }
    },
  },
  {
    guide: "share-your-booking-page",
    step: "booking-page",
    route: "/peak-performance-pt",
    verticals: [PT],
    prepare: (ctx) => ctx.settle(1200),
  },
  {
    guide: "share-your-booking-page",
    step: "booking-page",
    route: "/prestige-auto-care",
    verticals: [AUTO],
    prepare: (ctx) => ctx.settle(1200),
  },
  {
    guide: "connect-stripe",
    step: "payout-account",
    route: "/payments",
    prepare: async (ctx) => {
      await card(ctx, /Payout account/i).scrollIntoViewIfNeeded();
      await ctx.settle(300);
    },
  },
  { guide: "connect-stripe", step: "payments-settings", route: "/settings/get-paid" },
  {
    guide: "connect-stripe",
    step: "bank-transfer",
    route: "/settings/get-paid",
    clip: (ctx) => settingsSection(ctx, "Bank transfer"),
  },
  { guide: "publish-cancellation-terms", step: "policies", route: "/settings/policies" },
  { guide: "choose-your-plan", step: "billing", route: "/billing" },
];

const BOOKINGS: Shot[] = [
  {
    guide: "add-a-booking",
    step: "add-booking",
    route: "/calendar",
    prepare: async (ctx) => {
      await openAddBooking(ctx);
      await pickClient(ctx, NAMES[ctx.vertical].client);
      await pickService(ctx, NAMES[ctx.vertical].service);
    },
  },
  {
    guide: "add-a-booking",
    step: "create-menu",
    route: "/calendar",
    prepare: async (ctx) => {
      await ctx.page
        .getByRole("button", { name: /^(Create|New booking)$/ })
        .first()
        .click();
      await ctx.page.getByRole("menuitem", { name: /Add booking/i }).waitFor({ timeout: 5_000 });
      await ctx.settle(300);
    },
  },
  {
    guide: "add-a-booking",
    step: "booking-panel",
    route: "/calendar",
    prepare: (ctx) => openBooking(ctx, PAID[ctx.vertical]),
  },
  {
    guide: "all-day-and-multi-day-jobs",
    step: "all-day-form",
    route: "/calendar",
    verticals: [AUTO],
    prepare: async (ctx) => {
      await openAddBooking(ctx);
      await pickClient(ctx, NAMES[AUTO].secondClient);
      await pickService(ctx, NAMES[AUTO].groupService);
      await ctx.page.getByRole("dialog").getByText("All day", { exact: true }).first().click();
      // A set time needs a named staff member; pick one so the form shows no warning.
      await ctx.page
        .getByRole("combobox")
        .filter({ hasText: /Choose a staff member/i })
        .first()
        .click();
      await ctx.page.getByRole("option", { name: NAMES[AUTO].secondStaff }).click();
      await ctx.settle(500);
    },
  },
  {
    guide: "all-day-and-multi-day-jobs",
    step: "multi-day-calendar",
    route: "/calendar",
    verticals: [AUTO],
  },
  {
    guide: "all-day-and-multi-day-jobs",
    step: "multi-day-panel",
    route: "/calendar",
    verticals: [AUTO],
    prepare: (ctx) => openBooking(ctx, MULTI_DAY),
  },
  {
    guide: "reschedule-a-booking",
    step: "edit-booking",
    route: "/calendar",
    prepare: async (ctx) => {
      await openBooking(ctx, UNPAID[ctx.vertical]);
      await moreActions(ctx, /Edit booking/i);
      await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
    },
  },
  {
    guide: "reschedule-a-booking",
    step: "reschedule-dialog",
    route: "/calendar",
    prepare: async (ctx) => {
      await openBooking(ctx, UNPAID[ctx.vertical]);
      await moreActions(ctx, /Edit booking/i);
      await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
      await ctx.page
        .getByRole("button", { name: /^Reschedule/i })
        .first()
        .click();
      await ctx.page
        .getByRole("dialog")
        .filter({ hasText: /Reschedule booking/i })
        .first()
        .waitFor({ timeout: 10_000 });
      await ctx.settle(600);
    },
  },
  {
    guide: "edit-a-booking",
    step: "booking-menu",
    route: "/calendar",
    prepare: async (ctx) => {
      await openBooking(ctx, PAID[ctx.vertical]);
      await ctx.page.getByRole("button", { name: "More actions" }).first().click();
      await ctx.page.getByRole("menuitem", { name: /Edit booking/i }).waitFor({ timeout: 5_000 });
      await ctx.settle(300);
    },
  },
  {
    guide: "edit-a-booking",
    step: "edit-form",
    route: "/calendar",
    prepare: async (ctx) => {
      await openBooking(ctx, PAID[ctx.vertical]);
      await moreActions(ctx, /Edit booking/i);
      await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
    },
  },
  {
    guide: "cancel-no-show-and-refunds",
    step: "cancel-dialog",
    route: "/calendar",
    prepare: async (ctx) => {
      await openBooking(ctx, UNPAID[ctx.vertical]);
      await moreActions(ctx, /Cancel booking/i);
      await ctx.page.getByRole("alertdialog").first().waitFor({ timeout: 10_000 });
    },
  },
  {
    guide: "cancel-no-show-and-refunds",
    step: "attendance",
    route: "/calendar",
    prepare: (ctx) => openBooking(ctx, EARLIER_TODAY[ctx.vertical]),
  },
  { guide: "cancel-no-show-and-refunds", step: "refunds", route: "/payments" },
  { guide: "waitlist", step: "waitlist", route: "/waitlist" },
  {
    guide: "waitlist",
    step: "add-to-waitlist",
    route: "/waitlist",
    prepare: async (ctx) => {
      await openDialog(ctx, /^Add to waitlist$/i);
      await ctx.page
        .getByRole("dialog")
        .getByRole("combobox")
        .filter({ hasText: /Search for a client/i })
        .first()
        .click();
      const name = NAMES[ctx.vertical].secondClient;
      await ctx.page.getByPlaceholder(/Search clients by name/i).fill(name.split(" ")[0]!);
      await ctx.page
        .getByRole("option", { name: new RegExp(name) })
        .first()
        .click();
      await ctx.settle(600);
    },
  },
  {
    guide: "waitlist",
    step: "entry",
    route: "/waitlist",
    prepare: async (ctx) => {
      // A table row on desktop, a card button on phone.
      const name = /^[A-Z][a-z]+ [A-Z][a-z]+, high priority, /;
      const row = ctx.page.locator("main").getByRole("row", { name });
      const card = ctx.page.locator("main").getByRole("button", { name });
      await row.or(card).first().click();
      await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
      await ctx.settle(1200);
    },
  },
  {
    guide: "events-and-blocking-time",
    step: "add-event",
    route: "/calendar",
    prepare: (ctx) => openFromCalendar(ctx, /^Add event$/i, /Add event/i),
  },
  { guide: "events-and-blocking-time", step: "events", route: "/events" },
  {
    guide: "events-and-blocking-time",
    step: "time-off",
    route: "/staff",
    prepare: async (ctx) => {
      await ctx.page.getByRole("button", { name: NAMES[ctx.vertical].secondStaff }).first().click();
      await ctx.settle(500);
    },
    clip: (ctx) => card(ctx, /Time off/i),
  },
  {
    guide: "group-sessions",
    step: "group-booking",
    route: "/calendar",
    verticals: [PT],
    prepare: (ctx) => openBooking(ctx, GROUP_CLASS),
  },
  {
    guide: "group-sessions",
    step: "create-group-session",
    route: "/calendar",
    verticals: [PT],
    prepare: async (ctx) => {
      await ctx.page
        .getByRole("button", { name: /^(Create|New booking)$/ })
        .first()
        .click();
      await ctx.page.getByRole("menuitem", { name: /Create group session/i }).click();
      await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
      await ctx.settle(500);
    },
  },
];

const CLIENTS: Shot[] = [
  { guide: "add-and-import-clients", step: "clients", route: "/clients" },
  {
    guide: "add-and-import-clients",
    step: "add-client",
    route: "/clients",
    prepare: (ctx) => openDialog(ctx, /Add client/i),
  },
  { guide: "add-and-import-clients", step: "import", route: "/clients/import" },
  {
    guide: "client-profile-and-history",
    step: "client-profile",
    route: "/clients",
    prepare: (ctx) => openClient(ctx, NAMES[ctx.vertical].client),
  },
  {
    guide: "client-profile-and-history",
    step: "client-bookings",
    route: "/clients",
    prepare: async (ctx) => {
      await openClient(ctx, NAMES[ctx.vertical].client);
      await clientTab(ctx, /^Bookings/i);
    },
  },
  {
    guide: "client-profile-and-history",
    step: "client-notes",
    route: "/clients",
    prepare: async (ctx) => {
      await openClient(ctx, NAMES[ctx.vertical].client);
      await clientTab(ctx, /^Notes/i);
    },
  },
  { guide: "packages-and-credits", step: "packages", route: "/packages", verticals: [PT] },
  {
    guide: "packages-and-credits",
    step: "sell-package",
    route: "/packages",
    verticals: [PT],
    prepare: async (ctx) => {
      await openDialog(ctx, /Sell package/i);
      await pickClient(ctx, NAMES[PT].client).catch(() => {});
    },
  },
  {
    guide: "packages-and-credits",
    step: "client-packages",
    route: "/clients",
    verticals: [PT],
    prepare: async (ctx) => {
      await openClient(ctx, NAMES[PT].client);
      await clientTab(ctx, /^Money/i);
    },
    // The card sits below Payments, out of frame on both viewports.
    clip: (ctx) =>
      ctx.page
        .locator("main section")
        .filter({ has: ctx.page.locator("h2", { hasText: /^Packages and credits$/ }) })
        .last(),
  },
  { guide: "vehicles-and-follow-ups", step: "vehicles", route: "/vehicles", verticals: [AUTO] },
  {
    guide: "vehicles-and-follow-ups",
    step: "client-vehicles",
    route: "/clients",
    verticals: [AUTO],
    prepare: async (ctx) => {
      await openClient(ctx, NAMES[AUTO].client);
      await clientTab(ctx, /^Vehicles/i);
    },
  },
  {
    guide: "vehicles-and-follow-ups",
    step: "vehicle-panel",
    route: "/vehicles",
    verticals: [AUTO],
    prepare: async (ctx) => {
      // A table row on desktop, a card button on the phone.
      await ctx.page
        .locator("main tbody tr, main button")
        .filter({ hasText: "LT21 KDX" })
        .first()
        .click();
      await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
      await ctx.settle(800);
    },
  },
  { guide: "reminders", step: "follow-ups", route: "/follow-ups", verticals: [AUTO] },
  {
    guide: "reminders",
    step: "reminder-menu",
    route: "/follow-ups",
    verticals: [AUTO],
    prepare: async (ctx) => {
      // On the phone the menu sits in the reminder's detail sheet.
      if (ctx.isMobile) {
        await ctx.page.locator("main").getByText("Noah Brennan").first().click();
        await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
        await ctx.settle(400);
      }
      await ctx.page
        .getByRole(ctx.isMobile ? "dialog" : "main")
        .getByRole("button", { name: /^More actions for Noah's Interior refresh/ })
        .first()
        .click();
      await ctx.page.getByRole("menu").first().waitFor({ timeout: 10_000 });
      await ctx.settle(400);
    },
  },
  {
    guide: "reminders",
    step: "reminder-drawer",
    route: "/follow-ups",
    verticals: [AUTO],
    prepare: (ctx) => openDialog(ctx, /Add reminder/i),
  },
  {
    guide: "reminders",
    step: "reminder-one-client",
    route: "/follow-ups",
    verticals: [AUTO],
    prepare: async (ctx) => {
      await openDialog(ctx, /Add reminder/i);
      await ctx.page.getByRole("dialog").getByText("One client", { exact: true }).first().click();
      await ctx.settle(400);
    },
  },
  {
    guide: "reminders",
    step: "reminders-booked-again",
    route: "/follow-ups?tab=booked",
    verticals: [AUTO],
  },
  {
    guide: "reminders",
    step: "reminder-rule",
    route: "/follow-ups",
    verticals: [AUTO],
    prepare: async (ctx) => {
      // The rules live in a sheet on the phone.
      if (ctx.isMobile) {
        await ctx.page
          .locator("main")
          .getByRole("button", { name: /^Repeat reminders/ })
          .click();
        await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
        await ctx.settle(400);
      }
      await ctx.page
        .getByRole("button", { name: /^Edit .* reminder on Full valet$/ })
        .first()
        .click();
      await ctx.page
        .getByRole("dialog")
        .getByRole("button", { name: /^Delete/ })
        .first()
        .waitFor({ timeout: 10_000 });
      await ctx.settle(500);
    },
  },
  {
    guide: "client-lifts",
    step: "lift-fields",
    route: "/calendar",
    verticals: [AUTO],
    prepare: async (ctx) => {
      await openAddBooking(ctx);
      await pickClient(ctx, NAMES[AUTO].client);
      const dialog = ctx.page.getByRole("dialog").first();
      await dialog.getByRole("checkbox", { name: /Client needs a lift/i }).click();
      await dialog.getByPlaceholder(/12 Elm Rd/).fill("Leeds station");
      await dialog.getByPlaceholder(/Back at 5pm/).fill("Back at 5pm to collect");
      await ctx.settle(400);
    },
  },
  {
    guide: "client-lifts",
    step: "lift-on-booking",
    route: "/calendar",
    verticals: [AUTO],
    prepare: (ctx) => openBooking(ctx, MULTI_DAY),
  },
];

const MONEY: Shot[] = [
  {
    guide: "record-a-payment",
    step: "payments-tab",
    route: "/calendar",
    prepare: async (ctx) => {
      await openBooking(ctx, UNPAID[ctx.vertical]);
      await panelTab(ctx, /Payments/i);
    },
  },
  {
    guide: "record-a-payment",
    step: "record-payment",
    route: "/calendar",
    prepare: async (ctx) => {
      await openBooking(ctx, UNPAID[ctx.vertical]);
      await panelTab(ctx, /Payments/i);
      await bookingPanel(ctx)
        .getByRole("button", { name: /^Record payment$/i })
        .first()
        .click();
      await ctx.page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
      await ctx.settle(500);
    },
  },
  {
    guide: "take-a-card-payment",
    step: "take-card",
    route: "/calendar",
    prepare: async (ctx) => {
      await openBooking(ctx, UNPAID[ctx.vertical]);
      await panelTab(ctx, /Payments/i);
    },
    clip: (ctx) =>
      bookingPanel(ctx)
        .locator(".rounded-xl.border")
        .filter({ hasText: /Take card payment/i })
        .first(),
  },
  {
    guide: "take-a-card-payment",
    step: "bank-transfer-pending",
    route: "/calendar",
    prepare: async (ctx) => {
      await openBooking(ctx, BANK[ctx.vertical]);
      await panelTab(ctx, /Payments/i);
    },
  },
  { guide: "take-a-card-payment", step: "payments-page", route: "/payments" },
  { guide: "invoices", step: "invoices", route: "/invoices" },
  {
    guide: "invoices",
    step: "invoice-detail",
    route: "/invoices",
    prepare: async (ctx) => {
      await ctx.page.locator("main a[href*='/invoices/']").first().click();
      await ctx.page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 10_000 });
      await ctx.settle(900);
    },
  },
  {
    guide: "invoices",
    step: "invoicing-settings",
    route: "/settings/get-paid",
    clip: (ctx) => settingsSection(ctx, "Invoicing"),
  },
  { guide: "reports-and-exports", step: "reports", route: "/reports" },
  { guide: "reports-and-exports", step: "reports-detail", route: "/reports", fullPage: true },
  { guide: "sms-credits", step: "sms-credits", route: "/billing/sms-credits" },
];

const CONFIRMATION_TEMPLATE = /^(Session|Job|Booking) confirmation$/;

const MESSAGES: Shot[] = [
  {
    guide: "confirmations-and-reminders",
    step: "reminder-settings",
    route: "/settings/client-messages",
  },
  {
    guide: "confirmations-and-reminders",
    step: "booking-reminders",
    route: "/calendar",
    prepare: async (ctx) => {
      await openBooking(ctx, PAID[ctx.vertical]);
      await moreActions(ctx, /Reminders/i);
    },
  },
  {
    guide: "send-a-message",
    step: "messages",
    route: "/messages",
    prepare: async (ctx) => {
      await ctx.page
        .locator("main button, main a")
        .filter({ hasText: NAMES[ctx.vertical].client })
        .first()
        .click();
      await ctx.settle(900);
    },
  },
  {
    guide: "send-a-message",
    step: "announcement",
    route: "/messages",
    prepare: (ctx) => openDialog(ctx, /Send announcement/i),
  },
  {
    guide: "send-a-message",
    step: "client-message",
    route: "/clients",
    prepare: async (ctx) => {
      await openClient(ctx, NAMES[ctx.vertical].client);
      await ctx.page
        .getByRole("button", { name: /^Message$/i })
        .first()
        .click();
      await ctx.page.getByPlaceholder(/Write a reply/i).waitFor({ timeout: 10_000 });
      await ctx.settle(700);
    },
  },
  {
    guide: "notification-preferences",
    step: "message-templates",
    route: "/settings/client-messages",
    // Phones show the list first; picking a template opens its editor in place.
    prepare: async (ctx) => {
      await ctx.page.getByRole("button", { name: CONFIRMATION_TEMPLATE }).first().click();
      await ctx.settle(600);
    },
    // One template's editor rather than the whole, very tall, section.
    clip: (ctx) =>
      ctx.page
        .locator("main h3", { hasText: CONFIRMATION_TEMPLATE })
        .first()
        .locator("xpath=ancestor::div[contains(@class,'content-start')][1]"),
  },
];

const ACCOUNT: Shot[] = [
  { guide: "working-offline", step: "offline-strip", route: "/calendar", offline: true },
  {
    guide: "dark-mode-and-calendar-colours",
    step: "dark-calendar",
    route: "/calendar",
    dark: true,
  },
  {
    guide: "dark-mode-and-calendar-colours",
    step: "calendar-colours",
    route: "/settings/calendar",
    clip: (ctx) => settingsSection(ctx, "Booking colours"),
  },
  { guide: "two-factor-authentication", step: "security", route: "/settings/security" },
  { guide: "whats-new-and-support", step: "whats-new", route: "/whats-new" },
  { guide: "whats-new-and-support", step: "support", route: "/support" },
  {
    guide: "whats-new-and-support",
    step: "contact-support",
    route: "/support",
    prepare: (ctx) => openDialog(ctx, /New request/i),
  },
  { guide: "whats-new-and-support", step: "guides", route: "/support/guides" },
  { guide: "referrals", step: "referrals", route: "/referrals" },
  {
    guide: "referrals",
    step: "referral-terms",
    route: "/referrals",
    prepare: async (ctx) => {
      if (ctx.isMobile) {
        await ctx.page.getByRole("button", { name: /^How it works/ }).click();
        await ctx.settle(300);
      }
      await openDialog(ctx, /^Terms$/i);
    },
  },
  {
    guide: "referrals",
    step: "referrals-list",
    route: "/referrals",
    clip: (ctx) =>
      ctx.page
        .locator("main section")
        .filter({ has: ctx.page.locator("h2", { hasText: /^Businesses you've referred$/ }) })
        .last(),
  },
];

export const SHOTS: Shot[] = [...SETUP, ...BOOKINGS, ...CLIENTS, ...MONEY, ...MESSAGES, ...ACCOUNT];

export function shotsFor(vertical: Vertical): Shot[] {
  return SHOTS.filter((s) => !s.verticals || s.verticals.includes(vertical));
}
