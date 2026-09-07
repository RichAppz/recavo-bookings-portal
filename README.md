# RECAVO Portal

Staff console, public booking flow, and customer portal for [RECAVO](https://linear.app/richappz/project/recavo-web-console-booking-and-portal-ec7494ce56b9), built on TanStack Start and wired to the RECAVO API.

## Stack

- TanStack Start + React 19 + TypeScript
- TanStack Router (file-based) + TanStack Query
- Tailwind CSS v4 + shadcn/ui
- Supabase Auth (JWT bearer to the API)
- OpenAPI-generated types (`npm run gen:api`)

## Setup

```sh
npm i
cp .env.example .env
# fill VITE_API_BASE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run gen:api   # regenerates src/lib/api/schema.d.ts from ./openapi.json
npm run dev
```

Point `VITE_API_BASE_URL` at a running RECAVO API (default `http://localhost:3000`). The committed `openapi.json` is a snapshot of `recavo-api/documents/openapi.json`.

## Scripts

| Script               | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Local Vite/TanStack Start server           |
| `npm run build`      | Production build                           |
| `npm run gen:api`    | Regenerate API types from `openapi.json`   |
| `npm run lint`       | ESLint                                     |
| `npm run typecheck`  | `tsc --noEmit`                             |
| `npm test`           | Unit and component tests                   |
| `npm run test:e2e`   | Browser journeys against a mocked API      |
| `npm run test:smoke` | Browser journeys against a real local API  |

## Testing

Three layers, in the order you will usually reach for them.

### Unit and component tests — `npm test`

Vitest, in two projects: `unit` runs the pure logic in `src/lib` under Node, and
`component` renders React under jsdom. `npm run test:watch` for a loop, and
`npm run test:unit` or `npm run test:component` to run one project.

Component tests use `tests/support/render.tsx`, which supplies a query client, a
memory router and stub auth and tenant contexts, so a component can be rendered
without standing up the whole app.

### Browser journeys — `npm run test:e2e`

Playwright, and the suite that matters most: it drives the real app through
every staff and customer journey. It is completely hermetic. Every `/api/v1/*`
call is answered by `tests/e2e/support/api-mock.ts`, Supabase is stubbed and the
session injected directly, `window.Stripe` is replaced with
`tests/e2e/support/stripe.ts`, and Chromium's resolver is pointed away from the
network — so an unmocked request fails at once instead of hanging. No API, no
database, no secrets, nothing to set up.

There are two browser projects, because the portal serves two hostnames from one
Worker and behaves differently on each:

- `staff` on `dashboard.recavo.test`, running `tests/e2e/staff/**`
- `customer` on `book.recavo.test`, running `tests/e2e/customer/**`

Both names are mapped to loopback inside the browser, so no `/etc/hosts` entry
and no sudo. `npm run test:e2e:ui` opens the Playwright UI;
`npm run test:e2e:report` opens the last HTML report.

All of it runs against one dataset — Demo Strength Co, in
`tests/e2e/fixtures/demo.ts` — with an owner, reception, restricted staff and
finance persona, two trainers, four services, a package, six customers and a
spread of bookings, credits and payments. Sign in as any of them with
`signIn("owner")` from the harness fixture, and override any endpoint per test
for error and empty states.

### Real-stack smoke suite — `npm run test:smoke`

Opt-in and manual. Its only job is to catch the mocks drifting from the real
API, so it covers three things and stops: the console renders real data, the
public booking page reaches Review on real availability, and the calendar shows
a seeded session. The card step is skipped, because FakeStripe's client secrets
cannot drive Stripe.js.

Run `recavo-api` locally, in a second checkout:

```sh
cd ../recavo-api
HTTP_PORT=3000 \
PERSISTENCE=memory \
SUPABASE_JWT_SECRET=local-test-secret \
SAAS_BILLING_REQUIRE_SUBSCRIPTION=false \
SAAS_BILLING_CHECKOUT_ENABLED=true \
CORS_ORIGINS='*' \
npm run dev
```

`PERSISTENCE=memory` avoids needing Postgres; use `docker compose up -d && npm
run migrate` instead if you want data to survive a restart. Leave `SUPABASE_URL`
unset, which turns off the issuer check so locally minted tokens are accepted,
and leave `STRIPE_SECRET_KEY` unset so the fake gateway is used.

Then seed a studio and run the suite:

```sh
cd -
SUPABASE_JWT_SECRET=local-test-secret npm run seed:demo
SUPABASE_JWT_SECRET=local-test-secret npm run test:smoke
```

`seed:demo` mints an owner JWT with that shared secret, provisions the user by
calling `GET /api/v1/me`, and builds the tenant over HTTP the way the portal
would. It writes the ids to `.smoke-seed.json`, which the specs read. Point both
at a different port with `SMOKE_API_URL`.

Two things to expect. Seeded bookings are all in the future, because the API
refuses a booking inside its notice window, so a studio's history cannot be
created over HTTP. And the console specs skip unless the seed managed to put the
business on a trial: the portal locks the console until a subscription exists,
the subscription only appears when Stripe reports one, and on a local FakeStripe
run that projection does not currently complete. The seed records what happened
in `.smoke-seed.json` and the skip message says so.

### CI

`.github/workflows/ci.yml` runs lint and typecheck, the unit and component
tests, and the mocked browser journeys, in three parallel jobs. The smoke suite
stays local, since it needs an API.

## Surfaces

- **Staff console** (`/`, `/calendar`, `/bookings`, …) — authenticated, business + location scoped
- **Billing** (`/billing`) — Recavo SaaS plans, 14-day trial via Stripe Checkout, return URLs `/billing/success` and `/billing/cancel`
- **Public booking** (`/book?businessId=…`) — unauthenticated `/api/v1/public/…`
- **Customer portal** (`/portal?businessId=…`) — authenticated `/api/v1/portal/…`

The staff console is locked until the business has access `trial`, `entitled`, or `grace`. New businesses go to `/billing` after create.

### API flags (required for Checkout and server-side gates)

On the RECAVO API the portal proxies to (`VITE_API_BASE_URL`):

```
SAAS_BILLING_CHECKOUT_ENABLED=true
SAAS_BILLING_REQUIRE_SUBSCRIPTION=true
PUBLIC_APP_URL=http://localhost:8080
```

Or set `BILLING_SUCCESS_URL` / `BILLING_CANCEL_URL` to `http://localhost:8080/billing/success` and `…/billing/cancel`. Staging/production should use the real portal origin. Without these, Checkout returns 403 and unpaid businesses stay unrestricted on the API (the portal still gates the UI).

## Lovable

This project is connected to [Lovable](https://lovable.dev). Avoid rewriting published git history on the connected branch.
