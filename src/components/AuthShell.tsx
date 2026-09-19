import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { GENERIC_BRAND, type VerticalBrand } from "@/lib/verticals";

/** RECAVO wordmark using the brand logo asset; text colour adapts to the panel. */
export function BrandMark({ tone }: { tone: "light" | "dark" }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/recavo-logo.jpg" alt="RECAVO" className="size-10 rounded-[22%] object-cover" />
      <span
        className={
          tone === "dark"
            ? "text-[19px] font-extrabold tracking-tight text-sidebar-foreground"
            : "text-[19px] font-extrabold tracking-tight text-foreground"
        }
      >
        RECAVO
      </span>
    </span>
  );
}

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  brand = GENERIC_BRAND,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  /** Drives the brand panel copy; defaults to a generic multi-vertical pitch. */
  brand?: VerticalBrand;
}) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-sidebar px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 size-[26rem] rounded-full bg-sidebar-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 right-0 size-[24rem] rounded-full bg-sidebar-primary/10 blur-3xl"
        />

        <Link to="/" className="relative">
          <BrandMark tone="dark" />
        </Link>

        <div className="relative max-w-md">
          <p className="inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent px-3 py-1 text-xs font-medium text-sidebar-accent-foreground">
            <Sparkles className="size-3.5 text-sidebar-primary" />
            {brand.chip}
          </p>
          <h2 className="mt-6 text-4xl leading-[1.1] font-semibold tracking-tight text-sidebar-foreground">
            {brand.headline}
          </h2>
          <ul className="mt-8 space-y-3">
            {brand.highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-sidebar-foreground/80">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-sidebar-primary">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative grid grid-cols-3 gap-4 border-t border-sidebar-border pt-6">
          {brand.stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-semibold tracking-tight text-sidebar-foreground">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-sidebar-foreground/60">{stat.label}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* Form panel */}
      <main className="pt-safe-8 pb-safe-8 px-safe-5 sm:px-safe-10 flex flex-col">
        <div className="flex items-center">
          <Link to="/" className="lg:invisible">
            <BrandMark tone="light" />
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[26rem]">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>

            <div className="mt-8">{children}</div>

            <div className="mt-8 text-sm text-muted-foreground">{footer}</div>
          </div>
        </div>

        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Protected by RECAVO — your connection is encrypted end to end.
        </p>
      </main>
    </div>
  );
}

export function GoogleButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
    >
      <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.58-5.05-3.71H.92v2.34A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.95H.92a9 9 0 0 0 0 8.1l3.03-2.34Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.57-2.57C13.46.89 11.43 0 9 0A9 9 0 0 0 .92 4.95l3.03 2.34C4.66 5.16 6.65 3.58 9 3.58Z"
        />
      </svg>
      {label}
    </button>
  );
}

/**
 * Sign in with Apple, styled to Apple's button guidelines (black, white mark,
 * same height as the neighbouring social button so neither is more prominent).
 */
export function AppleButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl bg-black text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
    >
      <svg viewBox="0 0 814 1000" className="size-4 fill-current" aria-hidden>
        <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
      </svg>
      {label}
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">or continue with email</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
