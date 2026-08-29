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
 *
 * `custom_domain: true` is what makes Cloudflare create and manage the DNS
 * record itself, which is why none of these hostnames are in the zone by hand.
 *
 * There is deliberately no `production` target. Production does not exist yet —
 * no Supabase project, no API, and live Stripe keys nowhere — so the only thing
 * a production deploy could serve is staging's database on a public hostname.
 * dashboard./book.recavo.app are held by the holding page instead (see
 * holding/). Add the target back at launch, alongside a real .env.production.
 */
import { readFileSync, writeFileSync } from "node:fs";

const TARGETS = {
  staging: {
    name: "recavo-portal-staging",
    domains: ["staging-dashboard.recavo.app", "staging-book.recavo.app"],
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
