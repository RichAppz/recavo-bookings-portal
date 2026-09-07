/**
 * `filename="INV-0001.pdf"` (quoted), `filename=INV-0001.pdf` (bare) or the
 * RFC 5987 `filename*=UTF-8''…` form → the filename, or null when absent.
 *
 * Dependency-free so the Node test runner can import it without an alias resolver.
 */
export function filenameFromDisposition(disposition: string | null | undefined): string | null {
  if (!disposition) return null;
  const quoted = /filename\*?=(?:UTF-8'')?"([^"]+)"/i.exec(disposition);
  if (quoted?.[1]) return safeDecode(quoted[1]);
  const bare = /filename\*?=(?:UTF-8'')?([^;\s]+)/i.exec(disposition);
  if (bare?.[1]) return safeDecode(bare[1]);
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
