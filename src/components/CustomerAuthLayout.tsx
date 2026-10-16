import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { ACCOUNT_PALETTE } from "@/lib/account-palette";
import { useFixedTheme } from "@/lib/theme";

/**
 * The frame for pages a customer meets before they are signed in.
 *
 * One RECAVO account spans every business a client books with, so this is the
 * neutral RECAVO look rather than a business theme: the wordmark, one white
 * card on the warm page background, black buttons. It stays light whatever the
 * phone's own setting, like the account it leads to. On a phone the card
 * dissolves into the page and a round back button sits where the wordmark was.
 */
export function CustomerAuthLayout({
  title,
  subtitle,
  children,
  footer,
  onBack,
}: {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** The code step's way back to the email field. */
  readonly onBack?: (() => void) | undefined;
}) {
  useFixedTheme("light");

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-x-clip bg-[var(--account-bg)] text-[#15171c] antialiased"
      style={ACCOUNT_PALETTE}
    >
      <header className="pt-safe px-safe-5 flex h-[88px] shrink-0 items-center justify-center sm:h-[104px]">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute top-[max(env(safe-area-inset-top),1.25rem)] left-5 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--account-line)] bg-white sm:hidden"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        <span className="text-[17px] font-extrabold tracking-tight">RECAVO</span>
      </header>

      <main className="px-safe-5 flex flex-1 flex-col items-center pb-10">
        <section className="w-full max-w-[400px] sm:rounded-[28px] sm:border sm:border-[var(--account-line)] sm:bg-white sm:p-7 sm:shadow-[0_8px_30px_rgba(21,23,28,0.05)]">
          <h1 className="text-[32px] leading-[1.1] font-bold tracking-tight sm:text-[26px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-[17px] text-[var(--account-muted)] sm:text-[14px]">
              {subtitle}
            </p>
          ) : null}
          <div className="mt-6">{children}</div>
        </section>
        {footer ? (
          <div className="mt-6 text-center text-[14px] text-[var(--account-muted)]">{footer}</div>
        ) : null}
      </main>
    </div>
  );
}
