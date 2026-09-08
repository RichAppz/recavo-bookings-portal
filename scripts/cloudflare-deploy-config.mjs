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
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGETS = {
  staging: {
    name: "recavo-portal-staging",
    domains: ["staging.bookings.recavo.app", "staging.book.recavo.app"],
    envFile: ".env.staging",
  },
  production: {
    name: "recavo-portal",
    domains: ["bookings.recavo.app", "book.recavo.app"],
    envFile: ".env.production",
  },
};

const targetName = process.argv[2];
const target = TARGETS[targetName];
if (!target) {
  console.error(`Usage: cloudflare-deploy-config.mjs <${Object.keys(TARGETS).join("|")}>`);
  process.exit(1);
}

/**
 * The build that just ran must point at this target's Supabase project and API.
 *
 * Vite lets a real environment variable override `.env.<mode>`, so a stray
 * `VITE_SUPABASE_URL` left in the shell (e.g. from `source .env.staging` while
 * testing) silently produces a staging-wired bundle from `build:production`.
 * That happened once and took the production login down for an afternoon:
 * every customer's password was "wrong" because the site was asking the wrong
 * project. Read the bundle back and refuse to ship it if it disagrees.
 */
function readEnvValue(file, key) {
  const match = readFileSync(file, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(m?js)$/.test(entry)) out.push(full);
  }
  return out;
}

function assertBundleMatchesTarget() {
  const expectedSupabase = readEnvValue(target.envFile, "VITE_SUPABASE_URL");
  const expectedApi = readEnvValue(target.envFile, "VITE_API_BASE_URL");
  if (!expectedSupabase || !expectedApi) {
    console.error(`${target.envFile} must define VITE_SUPABASE_URL and VITE_API_BASE_URL`);
    process.exit(1);
  }

  const supabaseRefs = new Set();
  const apiHosts = new Set();
  for (const file of walk(".output")) {
    const source = readFileSync(file, "utf8");
    // Real project refs are 20 lowercase letters; this skips library placeholders
    // such as https://xyzcompany.supabase.co.
    for (const m of source.matchAll(/https:\/\/[a-z]{20}\.supabase\.co/g)) supabaseRefs.add(m[0]);
    // API hosts only — the bundle legitimately names bookings./book.recavo.app too.
    for (const m of source.matchAll(
      /https:\/\/(?:booking-api|recavo-api)[a-z0-9.-]*\.(?:recavo\.app|fly\.dev)/g,
    )) {
      apiHosts.add(m[0]);
    }
  }

  const wrongSupabase = [...supabaseRefs].filter((url) => url !== expectedSupabase);
  const wrongApi = [...apiHosts].filter((url) => url !== expectedApi);
  if (supabaseRefs.size === 0 || wrongSupabase.length > 0 || wrongApi.length > 0) {
    console.error(
      `Refusing to deploy ${targetName}: the built bundle does not match ${target.envFile}.`,
    );
    console.error(
      `  expected Supabase ${expectedSupabase}, found ${[...supabaseRefs].join(", ") || "none"}`,
    );
    console.error(
      `  expected API      ${expectedApi}, found ${[...apiHosts].join(", ") || "none"}`,
    );
    const leaked = Object.keys(process.env).filter((k) => k.startsWith("VITE_"));
    if (leaked.length > 0) {
      console.error(
        `  VITE_* variables are set in this shell and override .env files: ${leaked.join(", ")}`,
      );
      console.error(`  Run: unset ${leaked.join(" ")}  — then rebuild.`);
    }
    process.exit(1);
  }
  console.log(`bundle targets ${expectedSupabase} and ${expectedApi} ✓`);
}

assertBundleMatchesTarget();

const path = ".output/server/wrangler.json";
const config = JSON.parse(readFileSync(path, "utf8"));
config.name = target.name;
config.routes = target.domains.map((pattern) => ({ pattern, custom_domain: true }));
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);

console.log(`${target.name} → ${target.domains.join(", ")}`);
