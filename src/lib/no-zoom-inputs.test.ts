import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * iOS Safari zooms the whole page when a focused field's text is under 16px, and the
 * zoom often sticks. The `Input` / `Textarea` primitives render 16px on phones for
 * that reason, so a caller passing `text-xs` / `text-sm` / `text-[13px]` unprefixed
 * undoes it. Compact text on a desktop is fine behind `md:`.
 */
const SRC = join(import.meta.dirname, "..");
const SMALL = /(^|\s)(text-xs|text-sm|text-\[(?:[0-9]|1[0-5])(?:\.\d+)?px\])(\s|$)/;
const FIELD = /<(Input|Textarea|input|textarea|select)\b[^>]*?className="([^"]*)"/gs;
const NON_TEXT = /type="(checkbox|radio|file|range|hidden|color|submit|button)"/;

function* tsxFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "ui") continue; // the primitives themselves set the 16px base
      yield* tsxFiles(path);
    } else if (name.endsWith(".tsx")) yield path;
  }
}

test("no text field shrinks below 16px on phones (iOS focus zoom)", () => {
  const offenders: string[] = [];
  for (const file of tsxFiles(SRC)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(FIELD)) {
      const [tag, , className] = match;
      if (NON_TEXT.test(tag)) continue;
      if (SMALL.test(className ?? "")) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${file.slice(SRC.length + 1)}:${line} → ${className}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
