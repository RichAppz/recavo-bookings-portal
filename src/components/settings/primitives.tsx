import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Lock, OctagonAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useMemberships } from "@/lib/api/hooks";
import { userDisplayName } from "@/lib/api/types";
import { holdsBusinessOwnerRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/*
 * The building blocks every Settings page is made of (settings redesign spec §2–§3):
 * one page shape, one section shape, one switch row, one saved tick, one gated row,
 * one pill, one banner. Pages compose these and nothing else, so the look stays the
 * same from Profile to Activity log.
 */

/** Page title (22px/800), one-line description, then sections. Phone gets a back button. */
export function SettingsPage({
  title,
  description,
  banner,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  /** Page-level warning, rendered between the header and the first section. */
  banner?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Link
        to="/settings"
        className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground lg:hidden"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Settings
      </Link>
      <header className="mb-2">
        <h2 className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {banner ? <div className="mt-4">{banner}</div> : null}
      <div className="mt-4 divide-y divide-border">{children}</div>
    </div>
  );
}

/**
 * Title and help on the left (230px from `md` up), fields on the right, a thin
 * line between neighbours. On a phone the two stack. `aside` sits under the help
 * text — for a status pill or a small secondary action that describes the section.
 */
export function SettingsSection({
  id,
  title,
  help,
  aside,
  children,
  className,
}: {
  id?: string;
  title: string;
  help?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "grid scroll-mt-24 gap-4 py-7 first:pt-0 last:pb-0 md:grid-cols-[230px_minmax(0,1fr)] md:gap-x-10",
        className,
      )}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <div className="min-w-0">
        <h3 id={id ? `${id}-title` : undefined} className="text-[15.5px] leading-snug font-bold">
          {title}
        </h3>
        {help ? (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{help}</p>
        ) : null}
        {aside ? <div className="mt-3">{aside}</div> : null}
      </div>
      <div className="grid min-w-0 content-start gap-4">{children}</div>
    </section>
  );
}

/** Lists and grouped controls: one rounded block, subtle fill, 1px line, rows divided. */
export function GroupedBlock({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ul";
}) {
  return (
    <Tag
      className={cn(
        "divide-y divide-border overflow-hidden rounded-[14px] border bg-secondary/40 dark:bg-secondary/20",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** One row inside a GroupedBlock: label and one-line explanation left, a control right. */
export function SettingsRow({
  label,
  hint,
  htmlFor,
  children,
  className,
  as: Tag = "div",
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
  className?: string;
  as?: "div" | "li";
}) {
  const text = (
    <>
      <span className="block text-sm font-medium">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{hint}</span>
      ) : null}
    </>
  );
  return (
    <Tag className={cn("flex min-h-11 items-center justify-between gap-4 px-4 py-3", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="min-w-0 flex-1 cursor-pointer">
          {text}
        </label>
      ) : (
        <div className="min-w-0 flex-1">{text}</div>
      )}
      {children ? <div className="flex shrink-0 items-center gap-3">{children}</div> : null}
    </Tag>
  );
}

/** "✓ Saved" beside a control after an instant save; fades two seconds later. */
export function SavedTick({ show, className }: { show: boolean; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold text-success transition-opacity duration-500 dark:text-mint",
        show ? "opacity-100" : "pointer-events-none opacity-0",
        className,
      )}
    >
      {show ? (
        <>
          <Check className="size-3.5" aria-hidden /> Saved
        </>
      ) : null}
    </span>
  );
}

/** `[visible, flash]` — call `flash()` after a save succeeds. */
export function useSavedTick(ms = 2000): [boolean, () => void] {
  const [show, setShow] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const flash = useCallback(() => {
    setShow(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), ms);
  }, [ms]);
  return [show, flash];
}

/**
 * An on/off setting that saves straight away. `reason` is why it cannot be turned
 * on yet ("Set up a way to get paid first"); it greys the switch and sits beside it.
 */
export function SwitchRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  reason,
  saved = false,
  trailing,
  className,
  as,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  reason?: ReactNode;
  /** From `useSavedTick`. */
  saved?: boolean;
  /** Something before the switch — a pill, a button. */
  trailing?: ReactNode;
  className?: string;
  as?: "div" | "li";
}) {
  const locked = Boolean(reason) && !checked;
  return (
    <SettingsRow
      label={label}
      hint={
        <>
          {hint}
          {locked ? (
            <span className="block text-warning-foreground dark:text-amber sm:hidden">
              {reason}
            </span>
          ) : null}
        </>
      }
      htmlFor={id}
      className={className}
      as={as}
    >
      {locked ? (
        <span className="hidden max-w-[220px] text-right text-xs text-muted-foreground sm:block">
          {reason}
        </span>
      ) : null}
      {trailing}
      <SavedTick show={saved} />
      <Switch
        id={id}
        checked={checked}
        disabled={disabled || locked}
        onCheckedChange={onCheckedChange}
        aria-label={typeof label === "string" ? label : undefined}
      />
    </SettingsRow>
  );
}

export type PillTone = "grey" | "mint" | "amber" | "red";

/** State words. Grey: Off, Default, Add-on. Mint: Active, Customised. Amber: Running low. */
export function StatusPill({
  tone = "grey",
  children,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone === "grey" && "bg-secondary text-secondary-foreground",
        tone === "mint" && "bg-primary-soft text-success-foreground dark:text-mint",
        tone === "amber" && "bg-warning-soft text-warning-foreground",
        tone === "red" && "bg-destructive-soft text-destructive",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Mint dot marking a customised item in a list. Always paired with a word somewhere. */
export function CustomisedDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full bg-success dark:bg-mint",
        className,
      )}
    />
  );
}

/**
 * Slim page-level warning: one bold line plus one sentence. Amber for things the
 * business should do; red only for platform holds and Stripe rejections.
 */
export function SettingsBanner({
  tone = "amber",
  title,
  children,
  action,
  className,
}: {
  tone?: "amber" | "red";
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "red" ? OctagonAlert : AlertTriangle;
  return (
    <div
      role={tone === "red" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border px-4 py-3 text-sm",
        tone === "amber" &&
          "border-amber-300/70 bg-warning-soft text-warning-foreground dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100",
        tone === "red" &&
          "border-destructive/40 bg-destructive-soft text-destructive dark:bg-destructive/15",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children ? <p className="text-[13px] opacity-90">{children}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Lists with nothing in them: title, one sentence, one action. No dashed boxes. */
export function SettingsEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-secondary/40 px-5 py-8 text-center dark:bg-secondary/20",
        className,
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** The business owner's name for "Ask {owner}" copy; falls back to a role when unknown. */
export function useOwnerName(): string {
  const memberships = useMemberships();
  const owner = (memberships.data ?? []).find((m) => holdsBusinessOwnerRole(m.roleKeys));
  const name = owner ? userDisplayName(owner.user, "") : "";
  return name || "the business owner";
}

/** One grey line at the top of a read-only page. Replaces every "Requires business.update". */
export function ReadOnlyNotice({ className }: { className?: string }) {
  const owner = useOwnerName();
  return (
    <p className={cn("text-sm text-muted-foreground", className)} role="status">
      Only an admin can change this. Ask {owner}.
    </p>
  );
}

/**
 * Anything not on the plan: dashed border, lock pill, price line, one button.
 * Viewers who can't buy get "Ask {owner} to add this" in the button's place.
 */
export function PlanGatedRow({
  title,
  hint,
  lock = "Business plan",
  priceLine,
  action,
  canBuy = true,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  lock?: "Business plan" | "Add-on" | (string & {});
  priceLine?: ReactNode;
  /** The one button (Add for £8/month, See plans). */
  action?: ReactNode;
  canBuy?: boolean;
  className?: string;
}) {
  const owner = useOwnerName();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[14px] border border-dashed px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {title}
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            <Lock className="size-3" aria-hidden /> {lock}
          </span>
        </p>
        {hint ? <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p> : null}
        {priceLine ? <p className="mt-1 text-[13px] font-medium">{priceLine}</p> : null}
      </div>
      <div className="shrink-0">
        {canBuy ? action : <p className="text-xs text-muted-foreground">Ask {owner} to add this</p>}
      </div>
    </div>
  );
}

/** Fixed `book.recavo.app/` prefix with the slug typed after it; a status line beneath. */
export function PrefixField({
  id,
  prefix,
  value,
  onChange,
  placeholder,
  disabled,
  status,
  statusTone = "muted",
  trailing,
}: {
  id: string;
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  status?: ReactNode;
  statusTone?: "muted" | "warning" | "error";
  trailing?: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className="flex min-w-0 gap-2">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-md border border-input bg-field focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <span
            title={prefix}
            className="flex min-w-0 max-w-[60%] items-center border-r bg-secondary px-3 text-sm text-muted-foreground select-none"
          >
            <span className="truncate">{prefix}</span>
          </span>
          <input
            id={id}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-base outline-none disabled:opacity-60 md:text-sm"
            aria-describedby={status ? `${id}-status` : undefined}
          />
        </div>
        {trailing}
      </div>
      {status ? (
        <p
          id={`${id}-status`}
          className={cn(
            "text-xs [overflow-wrap:anywhere]",
            statusTone === "muted" && "text-muted-foreground",
            statusTone === "warning" && "text-warning-foreground dark:text-amber",
            statusTone === "error" && "text-destructive",
          )}
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
