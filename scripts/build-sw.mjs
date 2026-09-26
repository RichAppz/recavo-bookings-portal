/**
 * Bundles src/sw.ts into .output/public/sw.js and injects the precache manifest.
 *
 * Runs after `vite build` (see the deploy:* scripts). Everything under
 * .output/public that the app needs to boot is listed with a content hash, plus
 * the SSR'd offline shell page, which is revisioned by the build so a new deploy
 * always refreshes it.
 *
 *   node scripts/build-sw.mjs
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { injectManifest } from "workbox-build";

const PUBLIC_DIR = ".output/public";
const SW_SRC = "src/sw.ts";
const SW_TMP = ".output/sw.tmp.js";
const SW_DEST = join(PUBLIC_DIR, "sw.js");

if (!existsSync(PUBLIC_DIR)) {
  console.error(`build-sw: ${PUBLIC_DIR} not found — run the app build first.`);
  process.exit(1);
}

// The shell's revision is a hash of the client bundle: when any asset changes the
// shell's <script>/<link> tags change with it, so this is exactly when it must be
// re-fetched. Hashing the file list (names carry content hashes) is enough.
const bundleRevision = createHash("sha1")
  .update(listFiles(join(PUBLIC_DIR, "assets")).sort().join("\n"))
  .digest("hex")
  .slice(0, 16);

mkdirSync(".output", { recursive: true });
await build({
  entryPoints: [SW_SRC],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: SW_TMP,
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
});

const { count, size, warnings } = await injectManifest({
  swSrc: SW_TMP,
  swDest: SW_DEST,
  globDirectory: PUBLIC_DIR,
  globPatterns: ["assets/**/*.{js,css,woff,woff2}", "favicon.ico", "apple-touch-icon.png"],
  globIgnores: ["**/*.map"],
  maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
  additionalManifestEntries: [{ url: "/app-shell", revision: bundleRevision }],
});
rmSync(SW_TMP, { force: true });

// The worker file itself must never be served from a long-lived cache, or the
// browser keeps checking an old manifest and never sees the new deploy.
const headersPath = join(PUBLIC_DIR, "_headers");
const existing = existsSync(headersPath) ? readFileSync(headersPath, "utf8") : "";
if (!existing.includes("/sw.js")) {
  writeFileSync(headersPath, `${existing.trimEnd()}\n\n/sw.js\n  cache-control: no-cache\n`);
}

for (const w of warnings) console.warn(`build-sw: ${w}`);
console.log(
  `build-sw: ${SW_DEST} precaches ${count} files (${(size / 1024 / 1024).toFixed(1)} MB), shell rev ${bundleRevision}`,
);

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}
