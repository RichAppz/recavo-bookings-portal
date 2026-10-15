import { useEffect, useMemo, type ReactNode } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { BottomSheet, BottomSheetContent, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils";
import {
  CLIENT_FONTS_HREF,
  clientThemeStyle,
  initials,
  type BookingPageContent,
} from "@/lib/client-theme";

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

/** Centred column: full-bleed on a phone, a comfortable reading width on desktop. */
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
    <div className={cn("mx-auto w-full px-4 sm:px-6", wide ? "max-w-6xl" : "max-w-2xl", className)}>
      {children}
    </div>
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
    <div className="flex items-center gap-3 pt-3 pb-4 sm:pt-6">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-border transition hover:bg-muted"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      {/* The desktop top bar carries the stepper, so only the back button stays there. */}
      <div className="min-w-0 flex-1 sm:hidden">
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

/** The fixed action bar on phones; inline at the end of the column on desktop. */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      {/* Spacer so the last content is not hidden under the bar on phones. */}
      <div className="h-28 sm:hidden" aria-hidden />
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:static sm:border-0 sm:bg-transparent sm:backdrop-blur-none",
          className,
        )}
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-0 sm:py-6">
          {children}
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
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4">
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
        <div className="flex min-w-[80px] justify-end">{trailing}</div>
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
