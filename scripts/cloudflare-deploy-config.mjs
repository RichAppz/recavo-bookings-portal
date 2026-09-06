/**
 * Names the Worker and claims its hostnames, for the deploy about to run.
 *
 * Nitro regenerates .output/server/wrangler.json on every build and derives the
 * Worker name from the repo folder, so neither the name nor the custom domains
 * survive a build. Rather than passing flags at the call site — where a wrong
 * one silently deploys staging over production — both environments are declared
 * here and selected by argument.
 *
 *   node scripts/cloudflare-deploy-config.mjs staging
 *   node scripts/cloudflare-deploy-config.mjs production
 *
 * `custom_domain: true` is what makes Cloudflare create and manage the DNS
 * record itself. These hostnames must match `src/lib/hosts.ts` — a wrong pair
 * here steals DNS from the live staging/production names.
 *
 * Hostnames (do not invent dash-separated aliases):
 *   Staging staff     staging.bookings.recavo.app
 *   Staging booking   staging.book.recavo.app
 *   Production staff  bookings.recavo.app
 *   Production booking book.recavo.app
 *
 * Production Auth/API is lcciokzqvatsrckmirdm / booking-api.recavo.app
 * (see .env.production). Never point this target at staging's Supabase project.
 * dashboard.recavo.app stays on the holding page (see holding/).
 */
import { readFileSync, writeFileSync } from "node:fs";

const TARGETS = {
  staging: {
    name: "recavo-portal-staging",
    domains: ["staging.bookings.recavo.app", "staging.book.recavo.app"],
  },
  production: {
    name: "recavo-portal",
    domains: ["bookings.recavo.app", "book.recavo.app"],
  },
};

const target = TARGETS[process.argv[2]];
if (!target) {
  console.error(`Usage: cloudflare-deploy-config.mjs <${Object.keys(TARGETS).join("|")}>`);
  process.exit(1);
}

const path = ".output/server/wrangler.json";
const config = JSON.parse(readFileSync(path, "utf8"));
config.name = target.name;
config.routes = target.domains.map((pattern) => ({ pattern, custom_domain: true }));
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);

console.log(`${target.name} → ${target.domains.join(", ")}`);
