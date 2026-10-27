import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { ACCOUNT_PALETTE } from "@/lib/account-palette";
import { useFixedTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The frame for pages a client meets before they are signed in.
 *
 * One RECAVO account spans every business a client books with, so this is the
 * neutral RECAVO look rather than a business theme: a small wordmark, one white
 * card on the warm page background, black pill buttons. It stays light whatever
 * the phone's own setting, like the account it leads to, and must never read as
 * the business login (no dark split screen, no marketing panel). On a phone the
 * card dissolves into the page and a round back button sits where the wordmark
 * was.
 */
export function CustomerAuthLayout({
  title,
  subtitle,
  children,
  footer,
  onBack,
  backTo,
  showBusinesses = false,
}: {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** The code step's way back to the email field. */
  readonly onBack?: (() => void) | undefined;
  /** "Back to {business}" when the client came here from a booking page. */
  readonly backTo?: { readonly label: string; readonly href: string } | null | undefined;
  /** The overlapping initials that say "every business you book with". */
  readonly showBusinesses?: boolean;
}) {
  useFixedTheme("light");

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-x-clip bg-[var(--account-bg)] text-[#15171c] antialiased"
      style={ACCOUNT_PALETTE}
    >
      {/* Phone: the back link takes the left and the wordmark steps aside to the
          right; with no link the wordmark is centred. Desktop: wordmark centred,
          link pinned left of it. */}
      <header className="pt-safe px-safe-5 relative flex h-[88px] shrink-0 items-center sm:h-[104px] sm:justify-center">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute top-[max(env(safe-area-inset-top),1.25rem)] left-5 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--account-line)] bg-white sm:hidden"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : backTo ? (
          <a
            href={backTo.href}
            className="-ml-1.5 flex h-12 min-w-0 flex-1 items-center gap-1 pr-3 text-[15px] font-semibold sm:absolute sm:top-1/2 sm:left-6 sm:ml-0 sm:max-w-[40%] sm:flex-none sm:-translate-y-1/2"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <span className="truncate">{backTo.label}</span>
          </a>
        ) : null}
        <span
          className={cn(
            "text-[15px] font-extrabold tracking-tight",
            backTo && !onBack ? "ml-auto sm:ml-0" : "mx-auto sm:mx-0",
          )}
        >
          RECAVO
        </span>
      </header>

      <main className="px-safe-5 flex flex-1 flex-col items-center pb-10">
        <section className="w-full max-w-[400px] sm:rounded-[28px] sm:border sm:border-[var(--account-line)] sm:bg-white sm:p-8 sm:shadow-[0_8px_30px_rgba(21,23,28,0.05)]">
          {showBusinesses ? <BusinessInitials /> : null}
          <h1 className="text-[32px] leading-[1.1] font-bold tracking-tight sm:text-[26px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-3 text-[17px] leading-relaxed text-[var(--account-muted)] sm:text-[15px]">
              {subtitle}
            </p>
          ) : null}
          <div className="mt-8">{children}</div>
        </section>
        {footer ? (
          <div className="mt-8 text-center text-[14px] text-[var(--account-muted)]">{footer}</div>
        ) : null}
      </main>
    </div>
  );
}

/** Illustrative only: not the client's real businesses, which are unknown before sign-in. */
const SAMPLE_BUSINESSES = [
  { initials: "NS", bg: "#dcfce7", fg: "#166534" },
  { initials: "PP", bg: "#e0e7ff", fg: "#3730a3" },
  { initials: "LB", bg: "#fef3c7", fg: "#92400e" },
  { initials: "CD", bg: "#fce7f3", fg: "#9d174d" },
];

function BusinessInitials() {
  return (
    <div className="mb-7 flex items-center" aria-hidden>
      {SAMPLE_BUSINESSES.map((b, i) => (
        <span
          key={b.initials}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-bold ring-[3px] ring-[var(--account-bg)] sm:ring-white"
          style={{ background: b.bg, color: b.fg, marginLeft: i === 0 ? 0 : -10 }}
        >
          {b.initials}
        </span>
      ))}
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[var(--account-line)] bg-white text-[12px] font-bold text-[var(--account-muted)] ring-[3px] ring-[var(--account-bg)] sm:ring-white"
        style={{ marginLeft: -10 }}
      >
        +
      </span>
    </div>
  );
}
