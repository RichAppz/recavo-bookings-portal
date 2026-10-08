# Guide screenshots

The in-app guides (`/support/guides`) are written in `src/content/guides/*.ts` and
illustrated with WebP screenshots in `public/guides/`. The screenshots are taken from
two fictional businesses running against a **local** API and portal, so nothing in
them is a real customer and they can be re-taken whenever the UI changes.

```
public/guides/<vertical>/<guide-slug>/<step>.desktop.webp
public/guides/<vertical>/<guide-slug>/<step>.mobile.webp
public/guides/shared/<guide-slug>/<step>.<viewport>.webp   # guides with sharedImages: true
```

`<vertical>` is `personal_training` or `car_detailing`. The page picks the desktop or
mobile file to match the reader's screen, and the vertical to match their business.

## One-off setup

1. Run the RECAVO API locally on `:4000` against a local Postgres
   (`PERSISTENCE=postgres`), and the portal on `:8080` (`npm run dev`) pointed at it.
2. Create two Supabase auth users to own the fictional businesses, e.g.
   `guides-pt@recavo.app` and `guides-auto@recavo.app`, sharing one password.
3. Put the connection details in `~/.recavo-guides.env` (or set `GUIDES_ENV_FILE`):

   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_ANON_KEY=...
   GUIDES_PASSWORD=...
   GUIDES_PT_EMAIL=guides-pt@recavo.app
   GUIDES_AUTO_EMAIL=guides-auto@recavo.app
   API_BASE_URL=http://localhost:4000
   PORTAL_BASE_URL=http://localhost:8080
   GUIDES_DATABASE_URL=postgres://<owner>@localhost:5432/<local api db>   # optional
   ```

   `GUIDES_DATABASE_URL` lets the seed grant the two businesses a subscription so the
   portal doesn't park them on `/billing`. It is ignored unless it points at localhost.

4. `npx playwright install chromium`

## Seed the businesses

```
npm run guides:seed                    # both verticals
npm run guides:seed -- car_detailing   # one
```

Creates "Peak Performance PT" (trainers, sessions, packages, a group class) and
"Prestige Auto Care" (staff, jobs, vehicles, lifts, all-day and two-day jobs), each
with clients, a week of bookings either side of today, recorded payments, a waitlist
entry and a bank-transfer booking. Re-running is safe: everything is looked up by name
first, and bookings are only laid down once.

Each account also gets a small **one-person business on the Solo plan** — "Okafor
Coaching" and "Blake Mobile Valeting" — for the guide steps that show how Solo differs
(no Staff page; availability set from the session form). A shot opts into it with
`business: "solo"`; everything else is taken as the team business.

The bookings are placed relative to the day you seed, and `scripts/guides/shots.ts`
expects them where the seed put them (e.g. tomorrow 07:00 is the paid example). If the
seed day is long past, re-seed into a fresh local database before capturing.

## Capture

```
npm run guides:shots                                   # everything, both verticals, both viewports
npm run guides:shots -- --guide=add-a-booking          # one guide
npm run guides:shots -- --category=bookings            # one category
npm run guides:shots -- --vertical=car_detailing --viewport=mobile
npm run guides:shots -- --step=calendar                # that step of every guide
npm run guides:shots -- --check                        # compare guides with disk, capture nothing
npm run guides:shots -- --headed                       # watch the browser
```

Each shot in `shots.ts` names a guide slug and step, a route, and optionally a
`prepare` function (open a dialog, pick a booking chip, switch a tab) and a `clip`
locator to crop to one card. The browser clock is pinned to 10:30 today so the
calendar always shows the same week. Output is WebP under 150 KB; a full unfiltered run
finishes with a report of any image a guide expects but no shot produces, or vice
versa. `npm test` also fails if a guide references an image that isn't on disk.

## Adding a guide

1. Add the guide to the right file in `src/content/guides/` (copy is `string` or
   `{ personal_training, car_detailing }`; `{service}`, `{booking}`, `{client}`… are
   swapped for the business's own words).
2. Add one entry per step image to `scripts/guides/shots.ts`.
3. `npm run guides:shots -- --guide=<slug>`, then `npm run guides:shots -- --check`.
