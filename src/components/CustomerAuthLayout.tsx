import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, Check, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/AuthShell";
import { ThemeToggle } from "@/components/ThemeToggle";

const HIGHLIGHTS = [
  "Every studio you train at, under one login",
  "See what you've booked and what you've already paid for",
  "Buy more sessions and keep your receipts",
];

const STEPS = [
  { step: "1", label: "Give us your email" },
  { step: "2", label: "We send a code" },
  { step: "3", label: "You're in" },
];

/**
 * The frame for pages a customer meets before they are signed in.
 *
 * Same two-panel shape as {@link AuthShell} so the two front doors of the
 * product feel like one product, but the left panel sells something different.
 * A studio owner arriving at the staff login is being asked to buy software; a
 * customer here has already paid for sessions and is trying to reach them, so
 * the panel reassures rather than pitches, and spends its lower half explaining
 * the passwordless sign-in — which is the one thing on this page likely to be
 * unfamiliar.
 */
export function CustomerAuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 size-[26rem] rounded-full bg-sidebar-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 -bottom-40 size-[24rem] rounded-full bg-sidebar-primary/10 blur-3xl"
        />

        <Link to="/" className="relative">
          <BrandMark tone="dark" />
        </Link>

        <div className="relative max-w-md">
          <p className="inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent px-3 py-1 text-xs font-medium text-sidebar-accent-foreground">
            <CalendarCheck className="size-3.5 text-sidebar-primary" />
            Your training account
          </p>
          <h2 className="mt-6 text-4xl leading-[1.1] font-semibold tracking-tight text-sidebar-foreground">
            Your sessions, wherever you train.
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

        <div className="relative border-t border-sidebar-border pt-6">
          <p className="text-xs font-semibold tracking-[0.14em] text-sidebar-foreground/50 uppercase">
            No password needed
          </p>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {STEPS.map((item) => (
              <div key={item.step}>
                <span className="flex size-7 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-semibold text-sidebar-primary">
                  {item.step}
                </span>
                <p className="mt-2 text-xs text-sidebar-foreground/70">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="lg:invisible">
            <BrandMark tone="light" />
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[26rem]">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
            {footer ? <div className="mt-8 text-sm text-muted-foreground">{footer}</div> : null}
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
