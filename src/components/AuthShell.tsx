import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const HIGHLIGHTS = [
  "Sessions, payments and clients in one console",
  "Built for personal trainers and small studios",
  "Mobile-ready for gym floor and travelling PTs",
];

const STATS = [
  { value: "12k+", label: "Sessions a month" },
  { value: "98%", label: "Show-up rate" },
  { value: "4.9", label: "Average rating" },
];

/** RECAVO wordmark using the brand logo asset; text colour adapts to the panel. */
function BrandMark({ tone }: { tone: "light" | "dark" }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/recavo-logo.jpg" alt="RECAVO" className="size-10 rounded-lg object-cover" />
      <span
        className={
          tone === "dark"
            ? "text-[19px] font-semibold tracking-tight text-sidebar-foreground"
            : "text-[19px] font-semibold tracking-tight text-foreground"
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
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
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
            Built for personal trainers
          </p>
          <h2 className="mt-6 text-4xl leading-[1.1] font-semibold tracking-tight text-sidebar-foreground">
            Run your PT business in one place.
          </h2>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
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
          {STATS.map((stat) => (
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
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="lg:invisible">
            <BrandMark tone="light" />
          </Link>
          <ThemeToggle />
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

export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">or continue with email</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
