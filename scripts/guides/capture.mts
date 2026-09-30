/**
 * Captures the guide screenshots from the LOCAL portal (see scripts/guides/README.md).
 *
 *   npm run guides:shots                       # everything
 *   npm run guides:shots -- --guide=add-a-booking
 *   npm run guides:shots -- --category=bookings
 *   npm run guides:shots -- --vertical=car_detailing --viewport=mobile
 *   npm run guides:shots -- --step=calendar     # one step image of every guide
 *   npm run guides:shots -- --check             # report only, capture nothing
 *
 * Signs in as each fictional business, walks scripts/guides/shots.ts at a desktop
 * and a phone viewport, and writes WebP files to
 * public/guides/<vertical|shared>/<slug>/<step>.<viewport>.webp. Finishes with a
 * report comparing what the guides in src/content/guides expect with what exists.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import sharp from "sharp";
import { GUIDES } from "../../src/content/guides/index.ts";
import { expectedImagePaths } from "../../src/lib/guides.ts";
import { Api, emailFor, loadEnv, signIn as apiSignIn, type Vertical } from "./lib.mts";
import {
  NAMES,
  SHOTS,
  type BusinessKind,
  type ChipSpec,
  type Shot,
  type ShotContext,
  type Viewport,
} from "./shots.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const PUBLIC = join(ROOT, "public");
const MAX_BYTES = 150 * 1024;
const VERTICALS: Vertical[] = ["personal_training", "car_detailing"];
/** Shared (vertical-agnostic) images are captured once, from this account. */
const SHARED_FROM: Vertical = "personal_training";

const VIEWPORTS: Record<
  Viewport,
  { width: number; height: number; scale: number; mobile: boolean }
> = {
  desktop: { width: 1280, height: 800, scale: 1, mobile: false },
  mobile: { width: 390, height: 844, scale: 2, mobile: true },
};

type Args = {
  guide?: string;
  category?: string;
  step?: string;
  vertical?: Vertical;
  viewport?: Viewport;
  check: boolean;
  headed: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { check: false, headed: false };
  for (const arg of argv) {
    const [k, v] = arg.replace(/^--/, "").split("=") as [string, string | undefined];
    if (k === "guide") args.guide = v;
    else if (k === "category") args.category = v;
    else if (k === "step") args.step = v;
    else if (k === "vertical") args.vertical = v as Vertical;
    else if (k === "viewport") args.viewport = v as Viewport;
    else if (k === "check") args.check = true;
    else if (k === "headed") args.headed = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return args;
}

const env = loadEnv();
const args = parseArgs(process.argv.slice(2));

// ---- Content model ↔ shot list -------------------------------------------------

const guideBySlug = new Map(GUIDES.map((g) => [g.slug, g]));

/** Folder (vertical or "shared") the image for this shot belongs in. */
function folderFor(shot: Shot, vertical: Vertical): string {
  return guideBySlug.get(shot.guide)?.sharedImages ? "shared" : vertical;
}

function fileFor(folder: string, slug: string, step: string, viewport: Viewport): string {
  return join(PUBLIC, "guides", folder, slug, `${step}.${viewport}.webp`);
}

/** Which (vertical) accounts a shot should be taken from. */
function accountsFor(shot: Shot): Vertical[] {
  const guide = guideBySlug.get(shot.guide);
  if (!guide) return [];
  if (guide.sharedImages) return [SHARED_FROM];
  return guide.verticals.filter((v) => !shot.verticals || shot.verticals.includes(v));
}

function report(): boolean {
  const expected = new Set<string>();
  for (const guide of GUIDES) for (const p of expectedImagePaths(guide)) expected.add(p);

  const planned = new Set<string>();
  const unknownGuides: string[] = [];
  for (const shot of SHOTS) {
    if (!guideBySlug.has(shot.guide)) {
      unknownGuides.push(`${shot.guide}/${shot.step}`);
      continue;
    }
    for (const account of accountsFor(shot)) {
      const folder = folderFor(shot, account);
      for (const viewport of Object.keys(VIEWPORTS) as Viewport[]) {
        planned.add(`/guides/${folder}/${shot.guide}/${shot.step}.${viewport}.webp`);
      }
    }
  }

  const noShot = [...expected].filter((p) => !planned.has(p)).sort();
  const noContent = [...planned].filter((p) => !expected.has(p)).sort();
  const missingOnDisk = [...expected].filter((p) => !existsSync(join(PUBLIC, p))).sort();

  const onDisk: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".webp")) onDisk.push("/" + full.slice(PUBLIC.length + 1));
    }
  };
  walk(join(PUBLIC, "guides"));
  const stale = onDisk.filter((p) => !expected.has(p)).sort();
  const oversized = onDisk.filter((p) => statSync(join(PUBLIC, p)).size > MAX_BYTES);

  const section = (title: string, items: string[]) => {
    if (items.length === 0) return;
    console.log(`\n${title} (${items.length})`);
    for (const item of items) console.log(`  ${item}`);
  };
  console.log(
    `\nGuides: ${GUIDES.length} · expected images: ${expected.size} · on disk: ${onDisk.length}`,
  );
  section("Shots referencing a guide that does not exist", unknownGuides);
  section("Step images with no shot defined", noShot);
  section("Shots whose image no guide references", noContent);
  section("Expected images missing on disk", missingOnDisk);
  section("Stale files on disk (no guide references them)", stale);
  section(`Files over ${MAX_BYTES / 1024} KB`, oversized);
  const ok =
    noShot.length === 0 &&
    noContent.length === 0 &&
    missingOnDisk.length === 0 &&
    unknownGuides.length === 0;
  console.log(
    ok ? "\n✓ Guides and screenshots are in sync" : "\n✗ Guides and screenshots are out of sync",
  );
  return ok;
}

// ---- Browser plumbing ------------------------------------------------------------

/** Hide things that make shots noisy: dev overlays, toasts, focus rings. */
const CAPTURE_CSS = `
  .tsqd-parent-container, .TanStackRouterDevtools, [data-sonner-toaster], #vite-error-overlay { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; transition-duration: 0s !important; animation-duration: 0s !important; }
`;

async function signIn(page: Page, vertical: Vertical): Promise<void> {
  // Four sign-ins in quick succession can trip the auth rate limit; back off and retry.
  for (let attempt = 1; ; attempt++) {
    await page.goto(`${env.PORTAL_BASE_URL}/login`);
    await page.getByPlaceholder("you@recavo.co.uk").fill(emailFor(env, vertical));
    await page.getByPlaceholder("••••••••").fill(env.GUIDES_PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
      return;
    } catch (err) {
      if (attempt >= 3) throw err;
      console.log(`  sign-in did not complete (attempt ${attempt}); retrying…`);
      await page.waitForTimeout(6_000);
    }
  }
}

/** The account's team and one-person business ids, by the trading names the seed uses. */
async function businessIds(vertical: Vertical): Promise<Record<BusinessKind, string>> {
  const session = await apiSignIn(env, emailFor(env, vertical));
  const api = new Api(env.API_BASE_URL, session.accessToken);
  const mine = await api.get<{ businesses: { id: string; tradingName: string }[] }>(
    "/api/v1/me/businesses",
  );
  const find = (name: string) => {
    const hit = mine.businesses.find((b) => b.tradingName === name);
    if (!hit) throw new Error(`${name} is not seeded for ${vertical} — run npm run guides:seed`);
    return hit.id;
  };
  return { team: find(NAMES[vertical].business), solo: find(NAMES[vertical].soloBusiness) };
}

function makeContext(
  page: Page,
  vertical: Vertical,
  viewport: Viewport,
  businesses: Record<BusinessKind, string>,
): ShotContext {
  const isMobile = VIEWPORTS[viewport].mobile;
  const settle = async (ms = 400) => {
    // Loading skeletons use animate-pulse; wait until none are visible (bounded).
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const pulsing = await page.locator(".animate-pulse:visible").count();
      if (pulsing === 0) break;
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(ms);
  };
  const go = async (path: string) => {
    await page.goto(`${env.PORTAL_BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
    await page.locator("main, [role=main]").first().waitFor({ timeout: 20_000 });
    await settle(600);
  };
  const openNav = async () => {
    if (!isMobile) return;
    const button = page.getByRole("button", { name: /open menu|menu|navigation/i }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      await settle(300);
    }
  };
  // Calendar chips are plain <button aria-label="…"> elements inside the grid.
  const calendarEvent = (text: string | RegExp) =>
    page.locator("main button[aria-label]").filter({ hasText: text }).first();
  const calendarChip = (spec: ChipSpec) => {
    let chips = page.locator("main").getByRole("button", { name: spec.label });
    if (spec.text) chips = chips.filter({ hasText: spec.text });
    return chips.nth(spec.nth ?? 0);
  };
  // The portal remembers the active business in localStorage and re-reads it on a
  // full navigation, which every shot's `go` performs. The location filter is reset
  // too, since it would otherwise point at the other business's location.
  const useBusiness = async (which: BusinessKind) => {
    await page.evaluate(
      ([id, locationKey]) => {
        localStorage.setItem("recavo.activeBusinessId", id);
        localStorage.setItem(locationKey, "all");
      },
      [businesses[which], "recavo.activeLocationId"] as const,
    );
  };
  return {
    page,
    vertical,
    viewport,
    isMobile,
    go,
    settle,
    openNav,
    calendarEvent,
    calendarChip,
    useBusiness,
  };
}

async function toWebp(png: Buffer, dest: string): Promise<number> {
  let quality = 82;
  let out = await sharp(png).webp({ quality, effort: 5 }).toBuffer();
  while (out.byteLength > MAX_BYTES && quality > 50) {
    quality -= 8;
    out = await sharp(png).webp({ quality, effort: 5 }).toBuffer();
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out);
  return out.byteLength;
}

async function captureShot(ctx: ShotContext, shot: Shot, dest: string): Promise<void> {
  const { page } = ctx;
  await page.emulateMedia({ colorScheme: shot.dark ? "dark" : "light" });
  await ctx.useBusiness(shot.business ?? "team");
  await ctx.go(shot.route);
  if (shot.prepare) await shot.prepare(ctx);
  if (shot.offline) {
    await page.context().setOffline(true);
    await page.waitForTimeout(1_500);
  }
  await ctx.settle(250);
  // Blur whatever we last clicked so focus rings do not land in the picture.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  try {
    await screenshotShot(ctx, shot, dest);
  } finally {
    if (shot.offline) await page.context().setOffline(false);
    if (shot.dark) await page.emulateMedia({ colorScheme: "light" });
  }
}

async function screenshotShot(ctx: ShotContext, shot: Shot, dest: string): Promise<void> {
  const { page } = ctx;
  let png: Buffer;
  if (shot.clip) {
    const target: Locator = shot.clip(ctx);
    await target.scrollIntoViewIfNeeded();
    // Full-page captures keep the current scroll position, which leaves the sticky
    // header painted wherever the page happened to be scrolled. Park at the top so
    // it sits at document y=0 and the bounding box is already in document space.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const box = await target.boundingBox();
    if (!box) throw new Error(`clip target not visible for ${shot.guide}/${shot.step}`);
    const pad = 12;
    const vp = page.viewportSize()!;
    // Clip in document coordinates on a full-page capture, so a card taller than the
    // viewport (settings sections) comes out whole instead of cut at the fold.
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    png = await page.screenshot({
      fullPage: true,
      clip: {
        x,
        y,
        width: Math.min(vp.width - Math.max(0, box.x - pad), box.width + pad * 2),
        height: box.height + pad * 2,
      },
    });
  } else {
    png = await page.screenshot({ fullPage: shot.fullPage ?? false });
  }
  const bytes = await toWebp(png, dest);
  console.log(`  ${dest.slice(PUBLIC.length + 1)}  ${(bytes / 1024).toFixed(0)} KB`);
}

async function runAccount(
  browser: Browser,
  vertical: Vertical,
  viewport: Viewport,
  shots: Shot[],
): Promise<number> {
  const vp = VIEWPORTS[viewport];
  const context: BrowserContext = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    colorScheme: "light",
    locale: "en-GB",
    timezoneId: "Europe/London",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  // Same wall-clock for every shot: today at 10:30 in the business timezone.
  const fixed = new Date();
  fixed.setHours(10, 30, 0, 0);
  await page.clock.setFixedTime(fixed);
  await page.addStyleTag({ content: CAPTURE_CSS }).catch(() => {});
  await context.addInitScript((css: string) => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
    });
  }, CAPTURE_CSS);

  console.log(`\n${vertical} · ${viewport}`);
  await signIn(page, vertical);
  const ctx = makeContext(page, vertical, viewport, await businessIds(vertical));
  let failures = 0;
  for (const shot of shots) {
    const dest = fileFor(folderFor(shot, vertical), shot.guide, shot.step, viewport);
    try {
      await captureShot(ctx, shot, dest);
    } catch (err) {
      failures++;
      console.error(`  ✗ ${shot.guide}/${shot.step}: ${(err as Error).message.split("\n")[0]}`);
      if (args.headed) await page.pause();
    }
  }
  await context.close();
  return failures;
}

async function main(): Promise<void> {
  if (args.check) {
    process.exit(report() ? 0 : 1);
  }

  const selected = SHOTS.filter(
    (s) =>
      (!args.guide || s.guide === args.guide) &&
      (!args.category || guideBySlug.get(s.guide)?.category === args.category) &&
      (!args.step || s.step === args.step) &&
      guideBySlug.has(s.guide),
  );
  if (selected.length === 0) {
    console.error("No shots match the given filters.");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: !args.headed });
  let failures = 0;
  try {
    for (const vertical of VERTICALS) {
      if (args.vertical && vertical !== args.vertical) continue;
      const shots = selected.filter((s) => accountsFor(s).includes(vertical));
      if (shots.length === 0) continue;
      for (const viewport of Object.keys(VIEWPORTS) as Viewport[]) {
        if (args.viewport && viewport !== args.viewport) continue;
        failures += await runAccount(browser, vertical, viewport, shots);
      }
    }
  } finally {
    await browser.close();
  }

  const filtered = args.guide || args.category || args.step || args.vertical || args.viewport;
  // A filtered run is a work-in-progress run; the full sync report only makes sense unfiltered.
  const inSync = filtered ? true : report();
  if (failures > 0) {
    console.error(`\n${failures} shot(s) failed`);
    process.exit(1);
  }
  if (!inSync) process.exit(1);
}

await main();
