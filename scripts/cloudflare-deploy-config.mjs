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
 * After the build it reads the bundle back and refuses to deploy one that is
 * wired to the wrong Supabase/API (leaked VITE_*) or compiled with React's
 * development JSX transform (inherited NODE_ENV≠production) — both produce a
 * clean-looking `vite build` and a dead site.
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

/**
 * A `NODE_ENV=development` left in the shell is just as destructive as a leaked
 * `VITE_*`, and quieter: `vite build --mode production` keeps whatever NODE_ENV
 * it inherits, so @vitejs/plugin-react emits the *development* JSX transform
 * (`jsxDEV` from react/jsx-dev-runtime). The build exits 0, the Supabase/API
 * checks below pass, and production React has no `jsxDEV` — every SSR render
 * throws "jsxDEV is not a function" and every page is a 500. That took
 * production down on 2026-09-19 (version cfb58db0). `deploy:*` now pins
 * NODE_ENV=production for the build; this is the read-back that refuses to ship
 * a dev-transformed bundle produced by any other route.
 */
function assertBundleIsProductionTransform(devRuntimeFiles) {
  if (devRuntimeFiles.length === 0) return;
  fail([
    `Refusing to deploy ${targetName}: the bundle was built with React's development JSX transform.`,
    `  ${devRuntimeFiles.length} file(s) import react/jsx-dev-runtime, e.g.`,
    ...devRuntimeFiles.slice(0, 5).map((f) => `    ${f}`),
    `  Production React does not export jsxDEV, so every server render would throw and`,
    `  every page would be a 500. This happens when NODE_ENV is set to anything other`,
    `  than "production" in the shell that runs vite build (NODE_ENV=${process.env.NODE_ENV ?? "unset"} here).`,
    `  Rebuild with: NODE_ENV=production npm run deploy:${targetName}`,
  ]);
}

function assertBundleMatchesTarget() {
  const { expectedSupabase, expectedApi } = assertEnvFileComplete();

  const supabaseRefs = new Set();
  const apiHosts = new Set();
  const devRuntimeFiles = [];
  for (const file of walk(".output")) {
    const source = readFileSync(file, "utf8");
    // The dev transform imports "react/jsx-dev-runtime" (bundled as
    // `import_jsx_dev_runtime.jsxDEV`). A production bundle never names that
    // module; the only `jsxDEV` a good build contains is the string inside
    // hast-util-to-jsx-runtime's own option handling, which is not an import.
    if (/jsx-dev-runtime/.test(source)) devRuntimeFiles.push(file);
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

  // Checked first: a dev-transformed bundle is broken regardless of which
  // backend it points at, and its cause (NODE_ENV) is distinct from the
  // VITE_* leak the host comparison below is about.
  assertBundleIsProductionTransform(devRuntimeFiles);

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

/**
 * Nitro stamps `compatibility_date` with "today" in the *local* timezone, but
 * Cloudflare validates it against UTC and rejects any date in the future. So a
 * deploy from a BST/CEST shell between 23:00 UTC and local midnight fails with
 * "Can't set compatibility date in the future". `deploy:*` runs the build under
 * `TZ=UTC` to avoid that; this clamp is the backstop for any other build route.
 */
function clampCompatibilityDateToUtcToday(config) {
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (!config.compatibility_date || config.compatibility_date <= todayUtc) return;
  console.warn(
    `compatibility_date ${config.compatibility_date} is in the future (UTC today is ${todayUtc}); ` +
      "clamping so Cloudflare accepts the deploy",
  );
  config.compatibility_date = todayUtc;
}

const path = ".output/server/wrangler.json";
const config = JSON.parse(readFileSync(path, "utf8"));
config.name = target.name;
config.routes = target.domains.map((pattern) => ({ pattern, custom_domain: true }));
clampCompatibilityDateToUtcToday(config);
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);

console.log(
  `${target.name} → ${target.domains.join(", ")} (compatibility_date ${config.compatibility_date})`,
);
