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

| Script            | Purpose                                  |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | Local Vite/TanStack Start server         |
| `npm run build`   | Production build                         |
| `npm run gen:api` | Regenerate API types from `openapi.json` |
| `npm test`        | Unit tests (API client / problem+json)   |
| `npm run lint`    | ESLint                                   |

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
