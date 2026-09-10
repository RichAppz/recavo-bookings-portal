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
 * With `preflight` as a second argument it only runs the shell-environment
 * checks, so `deploy:*` can refuse before spending a build:
 *
 *   node scripts/cloudflare-deploy-config.mjs staging preflight
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
const preflightOnly = process.argv[3] === "preflight";
if (!target || (process.argv[3] && !preflightOnly)) {
  console.error(
    `Usage: cloudflare-deploy-config.mjs <${Object.keys(TARGETS).join("|")}> [preflight]`,
  );
  process.exit(1);
}

/**
 * The build must point at this target's Supabase project and API, and the only
 * place those may come from is the target's `.env.<mode>` file.
 *
 * Vite lets a real environment variable override `.env.<mode>`, so a stray
 * `VITE_SUPABASE_URL` left in the shell (e.g. from `source .env.staging` while
 * testing) silently produces a staging-wired bundle from `build:production`.
 * That happened once and took the production login down for an afternoon:
 * every customer's password was "wrong" because the site was asking the wrong
 * project. A second time, `source .env` for a local dev server left
 * `VITE_API_BASE_URL=http://127.0.0.1:4000` in a long-lived shell and staging
 * shipped a bundle that could not reach any API at all. So: refuse to build
 * while any `VITE_*` is set in the shell, then read the bundle back and refuse
 * to ship it if it disagrees with the env file anyway.
 */
function readEnvValue(file, key) {
  const match = readFileSync(file, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : null;
}

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function assertShellHasNoViteVars() {
  const leaked = Object.keys(process.env)
    .filter((k) => k.startsWith("VITE_"))
    .sort();
  if (leaked.length === 0) return;
  fail([
    `Refusing to build ${targetName}: VITE_* variables are set in this shell.`,
    `  ${leaked.map((k) => `${k}=${process.env[k]}`).join("\n  ")}`,
    `  Vite lets shell variables override ${target.envFile}, so the bundle would be`,
    `  wired to whatever this shell last sourced (a local .env, another environment…)`,
    `  rather than to the ${targetName} API and Supabase project.`,
    `  Deploys must take VITE_* only from ${target.envFile} (vite build --mode ${targetName}).`,
    `  Run: unset ${leaked.join(" ")}  — then re-run npm run deploy:${targetName}.`,
  ]);
}

function assertEnvFileComplete() {
  const expectedSupabase = readEnvValue(target.envFile, "VITE_SUPABASE_URL");
  const expectedApi = readEnvValue(target.envFile, "VITE_API_BASE_URL");
  if (!expectedSupabase || !expectedApi) {
    fail([`${target.envFile} must define VITE_SUPABASE_URL and VITE_API_BASE_URL`]);
  }
  return { expectedSupabase, expectedApi };
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
  const { expectedSupabase, expectedApi } = assertEnvFileComplete();

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

  // The allow-list for each target is exactly its env file's API. An empty set
  // is as wrong as a foreign host: `import.meta.env.VITE_API_BASE_URL` is
  // inlined at build time, so a bundle built against a localhost API simply
  // contains no recognisable API host at all.
  const wrongSupabase = [...supabaseRefs].filter((url) => url !== expectedSupabase);
  const wrongApi = [...apiHosts].filter((url) => url !== expectedApi);
  const problems = [];
  if (supabaseRefs.size === 0) problems.push("no Supabase project URL found in the bundle");
  if (wrongSupabase.length > 0) problems.push(`foreign Supabase URL: ${wrongSupabase.join(", ")}`);
  if (apiHosts.size === 0) {
    problems.push(
      "no API host found in the bundle (built with VITE_API_BASE_URL pointing at localhost or unset?)",
    );
  }
  if (!apiHosts.has(expectedApi)) problems.push(`bundle never names ${expectedApi}`);
  if (wrongApi.length > 0)
    problems.push(`API host not allowed for ${targetName}: ${wrongApi.join(", ")}`);

  if (problems.length > 0) {
    fail([
      `Refusing to deploy ${targetName}: the built bundle does not match ${target.envFile}.`,
      ...problems.map((p) => `  - ${p}`),
      `  expected Supabase ${expectedSupabase}, found ${[...supabaseRefs].join(", ") || "none"}`,
      `  expected API      ${expectedApi}, found ${[...apiHosts].join(", ") || "none"}`,
      `  Rebuild with a clean shell (no VITE_* set): npm run deploy:${targetName}`,
    ]);
  }
  console.log(`bundle targets ${expectedSupabase} and ${expectedApi} ✓`);
}

// Order matters: a leaked VITE_* is the usual cause, so name it before the
// bundle comparison produces a more confusing symptom.
assertShellHasNoViteVars();
assertEnvFileComplete();
if (preflightOnly) {
  console.log(`preflight ${targetName} ✓ (shell clean, ${target.envFile} complete)`);
  process.exit(0);
}
assertBundleMatchesTarget();

const path = ".output/server/wrangler.json";
const config = JSON.parse(readFileSync(path, "utf8"));
config.name = target.name;
config.routes = target.domains.map((pattern) => ({ pattern, custom_domain: true }));
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);

console.log(`${target.name} → ${target.domains.join(", ")}`);
