import type { CSSProperties } from "react";

/**
 * The client account and its sign-in share one neutral RECAVO look: warm
 * neutrals carried over from the Studio booking page, and the console's teal
 * primary re-pointed to near-black so every shadcn button becomes the design's
 * dark pill without touching each call site. One account spans every business
 * a client books with, so no business theme applies here.
 */
export const ACCOUNT_PALETTE: CSSProperties = {
  "--account-bg": "#f5f4f1",
  "--account-line": "#e6e4df",
  "--account-muted": "#5f656e",
  "--background": "#f5f4f1",
  "--foreground": "#15171c",
  "--card": "#ffffff",
  "--card-foreground": "#15171c",
  "--popover": "#ffffff",
  "--popover-foreground": "#15171c",
  "--border": "#e6e4df",
  "--input": "#d9d6d0",
  "--muted-foreground": "#5f656e",
  "--primary": "#15171c",
  "--primary-foreground": "#ffffff",
  "--ring": "#15171c",
} as CSSProperties;
