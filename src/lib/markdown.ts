const HTML_COMMENT = /<!--([\s\S]*?)-->/g;

/**
 * Drops the seed's leading `# PLACEHOLDER — not counsel-approved` section, which
 * says in prose what the review badge already says, and repeats identically in
 * every seeded document. Kept if no later heading follows, so a document that is
 * nothing but the banner still renders something.
 */
function stripCounselBanner(body: string): string {
  if (!/^#\s+PLACEHOLDER\b/.test(body)) return body;
  const afterFirstLine = body.indexOf("\n");
  if (afterFirstLine === -1) return body;
  const rest = body.slice(afterFirstLine + 1);
  const nextHeading = rest.search(/^#\s/m);
  return nextHeading === -1 ? body : rest.slice(nextHeading);
}

/**
 * Seeded policy documents carry their review state as an HTML comment
 * (`<!-- STATUS: PENDING_COUNSEL_REVIEW -->`). Lift it out as data so the UI can
 * badge it, and drop every comment from the body: react-markdown escapes raw
 * HTML rather than ignoring it, so a comment left in place renders verbatim.
 */
export function parsePolicyContent(content: string | null | undefined): {
  reviewStatus: string | null;
  body: string;
} {
  if (!content) return { reviewStatus: null, body: "" };
  const found: string[] = [];
  const stripped = content
    .replace(HTML_COMMENT, (_match, inner: string) => {
      const status = /^\s*STATUS:\s*(\S+)\s*$/i.exec(inner);
      if (status?.[1]) found.push(status[1].toLowerCase());
      return "";
    })
    .trim();
  const reviewStatus = found[0] ?? null;
  return {
    reviewStatus,
    body: reviewStatus ? stripCounselBanner(stripped).trim() : stripped,
  };
}

/**
 * Flattens markdown to a single line for list previews and summaries.
 * Not a parser — it strips the syntax a reader shouldn't see, including the
 * HTML comments the seeded policy documents carry (`<!-- STATUS: … -->`).
 */
export function markdownToPlainText(markdown: string | null | undefined): string {
  if (!markdown) return "";
  return markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-+*]\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
