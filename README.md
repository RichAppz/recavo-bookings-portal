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

## Hostnames

One Worker serves the staff console and the public booking page. The names are
`bookings.` / `book.` with an optional `staging.` prefix — never dash-separated
aliases (`staging-dashboard`, `staging-book`). `npm run deploy:staging` and
`npm run deploy:production` write these routes; a wrong list overwrites DNS.

| Environment | Staff console                       | Public booking                  |
| ----------- | ----------------------------------- | ------------------------------- |
| Local       | http://localhost:8080               | same origin                     |
| Staging     | https://staging.bookings.recavo.app | https://staging.book.recavo.app |
| Production  | https://bookings.recavo.app         | https://book.recavo.app         |

`dashboard.recavo.app` is the holding page (`holding/`), not the console.

## Scripts

| Script                      | Purpose                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`               | Local Vite/TanStack Start server                                                |
| `npm run build`             | Production build                                                                |
| `npm run deploy:staging`    | Build and deploy to `staging.bookings.recavo.app` + `staging.book.recavo.app`   |
| `npm run deploy:production` | Build and deploy to `bookings.recavo.app` + `book.recavo.app`                   |
| `npm run gen:api`           | Regenerates API types from `openapi.json`                                       |
| `npm test`                  | Unit tests (API client / problem+json)                                          |
| `npm run lint`              | ESLint                                                                          |
| `npm run guides:seed`       | Builds the two fictional businesses the guide screenshots come from (local API) |
| `npm run guides:shots`      | Re-takes the `/support/guides` screenshots; see `scripts/guides/README.md`      |

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

## Desktop app (macOS)

`src-tauri/` is a [Tauri v2](https://v2.tauri.app) shell around the hosted portal: the window loads
`staging.bookings.recavo.app` (or production for release builds) and ships no web bundle of its own,
so it picks up every web deploy without an app update. It is the desktop twin of the Capacitor
shell (`capacitor.config.ts`): the WebView stays on our origin and Stripe, anything else opens in the
default browser, and Google/Apple sign-in runs in the browser and returns through the
`com.richappz.recavo://` URL scheme (see `src-tauri/src/lib.rs`).

Needs Rust (`curl https://sh.rustup.rs -sSf | sh`) and Xcode command line tools.

| Script                             | Purpose                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `npm run desktop:dev`              | Run the shell against staging (sign-in deep links only work in a bundled `.app`) |
| `npm run desktop:dev:local`        | Run the shell against the local dev server on `localhost:8080`                   |
| `npm run desktop:build`            | Build `RECAVO.app` + `.dmg` against staging → `src-tauri/target/release/bundle/` |
| `npm run desktop:build:production` | Same, against production (`src-tauri/tauri.production.conf.json`)                |
| `npm run desktop:test`             | Rust unit tests for the navigation / deep-link rules                             |

Builds are only ad-hoc signed unless a Developer ID certificate is available. To ship a `.dmg` people
can open without Gatekeeper warnings, set `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`
(app-specific) and `APPLE_TEAM_ID` before `desktop:build:production`; Tauri signs and notarises as
part of the build. Bump `version` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` per
release.

## Lovable

This project is connected to [Lovable](https://lovable.dev). Avoid rewriting published git history on the connected branch.
