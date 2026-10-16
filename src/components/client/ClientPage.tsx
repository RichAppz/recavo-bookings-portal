import { useEffect, useMemo, type ReactNode } from "react";
import { Check, ChevronLeft, Timer } from "lucide-react";
import { BottomSheet, BottomSheetContent, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils";
import {
  CLIENT_FONTS_HREF,
  THEME_SPECS,
  clientThemeStyle,
  initials,
  type BookingPageContent,
} from "@/lib/client-theme";
import { useFixedTheme } from "@/lib/theme";

/**
 * The themed frame around every screen of a studio's booking page.
 *
 * The theme is written onto `<html>` rather than a wrapper so that anything that
 * portals out (bottom sheets, toasts, Stripe's prompts) picks the same tokens up.
 * It is removed again on unmount, so leaving for the sign-in page restores the
 * portal's own look.
 */
export function ClientTheme({
  page,
  children,
  scope = "document",
}: {
  page: Pick<BookingPageContent, "theme" | "accentColour">;
  children: ReactNode;
  /** `element` keeps the theme inside the wrapper (used by the editor's preview). */
  scope?: "document" | "element";
}) {
  const style = useMemo(
    () => clientThemeStyle({ theme: page.theme, accentColour: page.accentColour }),
    [page.theme, page.accentColour],
  );
  // The page's own theme decides light or dark, never the visitor's OS setting.
  useFixedTheme(scope === "document" ? (THEME_SPECS[page.theme].dark ? "dark" : "light") : null);

  useEffect(() => {
    if (scope !== "document") return;
    const root = document.documentElement;
    const entries = Object.entries(style as Record<string, string>);
    for (const [key, value] of entries) {
      if (key.startsWith("--")) root.style.setProperty(key, value);
    }
    root.style.colorScheme = (style as { colorScheme?: string }).colorScheme ?? "";
    root.dataset.clientTheme = page.theme;
    return () => {
      for (const [key] of entries) {
        if (key.startsWith("--")) root.style.removeProperty(key);
      }
      root.style.colorScheme = "";
      delete root.dataset.clientTheme;
    };
  }, [style, page.theme, scope]);

  useEffect(() => {
    if (scope !== "document") return;
    if (document.querySelector(`link[href="${CLIENT_FONTS_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CLIENT_FONTS_HREF;
    document.head.appendChild(link);
  }, [scope]);

  return (
    <div
      className="client-page min-h-full bg-background text-foreground antialiased"
      style={scope === "element" ? style : undefined}
      data-client-theme={page.theme}
    >
      {children}
    </div>
  );
}

/** The studio's mark: its logo, or two letters on a card. */
export function StudioMark({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims =
    size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-card font-semibold text-foreground ring-1 ring-black/5",
        dims,
        className,
      )}
      aria-hidden
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span style={{ color: "var(--client-accent)" }}>{initials(name)}</span>
      )}
    </div>
  );
}

/**
 * Where the client pages leave the phone layout (spec: below ~600px). Between here
 * and the `desk:` variant (900px) the desktop screens run as one column with the
 * card under the content.
 */
export const CLIENT_DESKTOP_QUERY = "(min-width: 640px)";

/**
 * Centred column. Phone: full-bleed with 16px sides. Desktop: the spec's page
 * container, 1160px wide with 24px side padding; `wide` opts a screen into it,
 * the others keep a reading width.
 */
export function ClientColumn({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6",
        wide ? "max-w-[1160px]" : "max-w-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** "Sessions", "Trainers": a muted 13px label on a phone, a 22px title on desktop. */
export function SectionHeading({
  children,
  trailing,
  className,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-end justify-between gap-4 desk:mb-3", className)}>
      <h2
        className="text-[13px] font-semibold text-muted-foreground desk:text-[22px] desk:text-foreground"
        style={{ fontFamily: "var(--client-font-display)" }}
      >
        {children}
      </h2>
      {trailing}
    </div>
  );
}

/** Desktop footer: the venue on the left, the RECAVO credit on the right. */
export function ClientFooter({ venue }: { venue: string | null }) {
  return (
    <footer className="mt-12 flex items-center justify-between border-t border-border py-6 text-[13px] text-muted-foreground">
      <span>{venue ?? ""}</span>
      <span>
        Bookings by{" "}
        <a href="https://recavo.app" className="font-semibold text-foreground/80 hover:underline">
          RECAVO
        </a>
      </span>
    </footer>
  );
}

/** "When … Fri 16 Oct, 09:00": one label/value line of the desktop summary card. */
export function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-[14px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold">{value}</span>
    </div>
  );
}

/** The hold countdown pill: "We're holding this time for you · 9:41". */
export function HoldPill({ msLeft, className }: { msLeft: number; className?: string }) {
  const minutes = Math.floor(msLeft / 60_000);
  const seconds = Math.floor((msLeft % 60_000) / 1000);
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-[10px] bg-primary-soft px-3 py-2 text-[13px]",
        msLeft < 60_000 && "bg-destructive-soft text-destructive",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <Timer className="h-3.5 w-3.5" />
        We're holding this time for you
      </span>
      <span className="font-semibold tabular-nums">
        {minutes}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}

/** An underlined text link for secondary actions ("Back", "Edit", "My bookings"). */
export function TextLink({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("text-[15px] font-semibold underline underline-offset-4", className)}
    >
      {children}
    </button>
  );
}

/** Back + "Step 1 of 3 · Choose" + the three-segment progress bar. */
export function StepHeader({
  step,
  total,
  label,
  onBack,
  trailing,
}: {
  step: number;
  total: number;
  label: string;
  onBack: () => void;
  trailing?: ReactNode;
}) {
  return (
    // Desktop has the stepper in the top bar and a Back link by the primary button.
    <div className="flex items-center gap-3 pt-3 pb-4 desk:hidden">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-border transition hover:bg-muted"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-[13px] text-muted-foreground">
            Step {step} of {total} · {label}
          </p>
          {trailing}
        </div>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i < step ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The fixed action bar on phones; inline at the end of the content on desktop,
 * where `back` renders as a text link on the left (the spec's "Back link and
 * Continue to review").
 */
export function BottomBar({
  children,
  className,
  back,
  inline = false,
}: {
  children: ReactNode;
  className?: string;
  back?: { label?: string; onClick: () => void } | undefined;
  /** Desktop: sit in the flow of the left column rather than spanning the page. */
  inline?: boolean;
}) {
  return (
    <>
      {/* Spacer so the last content is not hidden under the bar on phones. */}
      <div className="h-28 desk:hidden" aria-hidden />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 desk:static desk:border-0 desk:bg-transparent desk:backdrop-blur-none",
          className,
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full items-center justify-between gap-4 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] desk:px-0 desk:py-8",
            inline ? "max-w-none" : "max-w-2xl",
          )}
        >
          {back ? (
            <>
              <TextLink onClick={back.onClick} className="hidden desk:inline">
                {back.label ?? "Back"}
              </TextLink>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-4 desk:flex-none desk:justify-end">
                {children}
              </div>
            </>
          ) : (
            children
          )}
        </div>
      </div>
    </>
  );
}

/** One line of caption + bold value, used on the left of the bottom bar. */
export function BarSummary({ caption, value }: { caption: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] text-muted-foreground">{caption}</p>
      <p className="truncate text-[17px] font-semibold leading-tight">{value}</p>
    </div>
  );
}

/** The accent-coloured pill button that carries each screen's one primary action. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className,
  full = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  full?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-[52px] shrink-0 items-center justify-center rounded-full bg-primary px-7 text-[16px] font-semibold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50",
        full && "w-full",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A pill in the theme's dark ink, for secondary actions like "Keep my booking". */
export function InkButton({
  children,
  onClick,
  disabled,
  className,
  full = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--client-dark-button)",
        color: "var(--client-dark-button-foreground)",
      }}
      className={cn(
        "inline-flex h-[52px] shrink-0 items-center justify-center rounded-full px-7 text-[16px] font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
        full && "w-full",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function OutlineButton({
  children,
  onClick,
  disabled,
  className,
  full = false,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  full?: boolean;
  href?: string;
}) {
  const cls = cn(
    "inline-flex h-[52px] shrink-0 items-center justify-center rounded-full border border-foreground/70 bg-transparent px-7 text-[16px] font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
    full && "w-full",
    className,
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/** Card with the theme radius and thin dividers between rows. */
export function ClientCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius)] border border-border bg-card text-card-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <p className="text-[13px] font-semibold text-muted-foreground">{children}</p>
      {trailing}
    </div>
  );
}

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn("text-[28px] font-bold leading-tight tracking-tight sm:text-[40px]", className)}
      style={{ fontFamily: "var(--client-font-display)", fontWeight: 650 }}
    >
      {children}
    </h1>
  );
}

/**
 * A sheet that slides up on phones and sits as a centred card on wider screens. The
 * theme's tokens apply because `ClientTheme` writes them onto `<html>`.
 */
export function ClientSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        aria-describedby={undefined}
        className={cn(
          "client-page rounded-t-[28px] border-border bg-card text-card-foreground sm:mx-auto sm:mb-10 sm:max-w-md sm:rounded-[28px] sm:border",
          className,
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-border sm:hidden" aria-hidden />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">
          <BottomSheetTitle
            className="text-[22px] font-bold leading-tight tracking-tight"
            style={{ fontFamily: "var(--client-font-display)", fontWeight: 650 }}
          >
            {title}
          </BottomSheetTitle>
          {description ? (
            <p className="mt-1 text-[15px] text-muted-foreground">{description}</p>
          ) : null}
          <div className="mt-4">{children}</div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

/** Desktop-only top bar: the studio's mark and name, the three steps, and a trailing badge. */
export function DesktopTopBar({
  name,
  logoUrl,
  step,
  onHome,
  trailing,
}: {
  name: string;
  logoUrl: string | null | undefined;
  /** 1–3 for the booking steps; 0 hides the stepper (landing, confirmation). */
  step: number;
  onHome: () => void;
  trailing?: ReactNode;
}) {
  const labels = ["Choose", "Details", "Review"];
  return (
    <div className="hidden sm:block">
      <div className="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-6 px-6 py-4">
        <button
          type="button"
          onClick={onHome}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <StudioMark name={name} logoUrl={logoUrl} size="sm" />
          <span className="truncate text-[15px] font-semibold">{name}</span>
        </button>
        {step > 0 ? (
          <ol className="flex items-center gap-3" aria-label="Booking steps">
            {labels.map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const current = n === step;
              return (
                <li key={label} className="flex items-center gap-3">
                  <span className="flex items-center gap-2 text-[14px]">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold",
                        done
                          ? "bg-primary text-primary-foreground"
                          : current
                            ? "border-2 border-foreground"
                            : "border border-border text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
                    </span>
                    <span className={cn(current ? "font-semibold" : "text-muted-foreground")}>
                      {label}
                    </span>
                  </span>
                  {i < labels.length - 1 ? (
                    <span className="h-px w-8 bg-border" aria-hidden />
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
        <div className="flex min-w-[80px] items-center justify-end gap-3">{trailing}</div>
      </div>
    </div>
  );
}

export function PoweredBy() {
  return (
    <p className="py-8 text-center text-[12px] text-muted-foreground">
      Powered by{" "}
      <a href="https://recavo.app" className="font-semibold text-foreground/80 hover:underline">
        RECAVO
      </a>
    </p>
  );
}
