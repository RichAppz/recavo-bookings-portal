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

| Script                      | Purpose                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`               | Local Vite/TanStack Start server                                              |
| `npm run build`             | Production build                                                              |
| `npm run deploy:staging`    | Build and deploy to `staging.bookings.recavo.app` + `staging.book.recavo.app` |
| `npm run deploy:production` | Build and deploy to `bookings.recavo.app` + `book.recavo.app`                 |
| `npm run gen:api`           | Regenerates API types from `openapi.json`                                     |
| `npm test`                  | Unit tests (API client / problem+json)                                        |
| `npm run lint`              | ESLint                                                                        |

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

## Push notifications

Staff and clients can turn on push for the device they are using (Settings → Notifications, or
the account Profile page; the bell menu nudges once). Code lives in `src/lib/push`, the switch in
`src/components/PushNotificationsSetting.tsx`, launch sync and tap handling in
`src/components/PushBootstrap.tsx`, and the web `push` / `notificationclick` handlers in `src/sw.ts`.
The API decides which platforms are live (`GET /api/v1/push/config`); the switch is hidden elsewhere.

- **iOS app** — APNs via `@capacitor/push-notifications`. `ios/App/App/App.entitlements` carries
  `aps-environment` (Xcode flips it to `production` on an App Store export) and `AppDelegate.swift`
  forwards the token to the plugin. One-off: tick **Push Notifications** on the `com.richappz.recavo`
  App ID in the Apple developer portal.
- **Android app** — FCM via the same plugin. Drop the Firebase project's `google-services.json` into
  `android/app/` (the gradle files already apply the plugin when it is present).
- **Web** — standard Web Push with the API's VAPID key. Nothing to configure here; Safari on iPhone
  only offers it once the site is on the Home Screen, which the card explains.

Server-side set-up (APNs key, Firebase service account, VAPID pair) is documented in the API repo at
`documents/push-notifications.md`.

## Lovable

This project is connected to [Lovable](https://lovable.dev). Avoid rewriting published git history on the connected branch.
