import { useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { CalendarDays, Check, Lock } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  dayLabel,
  dayStrip,
  moneyInputValue,
  type ChannelTicks,
  type ContactBlocks,
  type NotifyChannel,
} from "@/lib/booking-form";
import { isoDate, parseIso, parseMoneyToMinor } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Inputs in both booking forms: 42px high, 10px radius, with the field fill. */
export const FIELD = "h-[42px] rounded-[10px] bg-field";

export type SectionState = "idle" | "attention" | "complete";

const STATE_WORDS: Record<SectionState, string> = {
  idle: "",
  attention: "needs attention",
  complete: "complete",
};

/**
 * A numbered section of a booking form. The number turns amber while something in it
 * blocks saving and becomes a tick once it's complete; the change is announced.
 */
export function FormSection({
  id,
  number,
  title,
  state,
  aside,
  children,
  className,
}: {
  id: string;
  number?: number;
  title: ReactNode;
  state: SectionState;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const titleText = typeof title === "string" ? title : undefined;
  return (
    <section
      id={id}
      aria-label={number && titleText ? `Section ${number}, ${titleText}` : titleText}
      className={cn("grid min-w-0 scroll-mt-4 gap-3", className)}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2.5 text-[15px] font-extrabold">
          {number ? (
            <span
              aria-hidden
              className={cn(
                "flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-extrabold transition-colors",
                state === "complete"
                  ? "bg-primary-soft text-primary"
                  : state === "attention"
                    ? "bg-warning-soft text-warning-foreground ring-1 ring-warning/60"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {state === "complete" ? <Check className="size-3.5" strokeWidth={3} /> : number}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{title}</span>
        </h3>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {STATE_WORDS[state]}
      </span>
      {children}
    </section>
  );
}

/** What a section is waiting for, before it can be used. */
export function WaitingLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** A `box` surface: the card every list and summary in the forms sits in. */
export function Box({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-[14px] border bg-secondary/40 p-3", className)}>{children}</div>
  );
}

/**
 * Amber means "you can still do it", red "must change", blue "you chose this, Undo".
 * Amber and red are live so a screen reader hears them appear.
 */
export function Strip({
  tone,
  children,
  action,
  id,
}: {
  tone: "amber" | "red" | "blue";
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      role={tone === "blue" ? undefined : "status"}
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 text-[13px]",
        tone === "amber" && "bg-warning-soft text-warning-foreground",
        tone === "red" && "bg-destructive-soft text-destructive",
        tone === "blue" && "bg-info-soft text-info",
      )}
    >
      <span className="min-w-0 flex-1 basis-48">{children}</span>
      {action ? <span className="flex shrink-0 flex-wrap gap-2">{action}</span> : null}
    </div>
  );
}

/** A quiet text button for Undo / reset inside strips and section heads. */
export function LinkButton({
  onClick,
  children,
  className,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer text-xs font-medium text-primary underline-offset-4 hover:underline",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The 20px mint pill naming the pricing route in force. */
export function ModeChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-primary-soft px-2 text-[11px] font-bold text-primary">
      {children}
    </span>
  );
}

function moveFocus(e: KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
  if (!keys.includes(e.key)) return;
  const radios = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([disabled])'),
  );
  const at = radios.indexOf(document.activeElement as HTMLButtonElement);
  if (at === -1 || radios.length === 0) return;
  e.preventDefault();
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
  const next = radios[(at + step + radios.length) % radios.length]!;
  next.focus();
  next.click();
}

/** Arrow keys move between the options of a radio group and pick as they go. */
export const radioGroupKeys = { onKeyDown: moveFocus };

/** A segmented control: one choice of a few, as a radio group. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      {...radioGroupKeys}
      className={cn("inline-flex rounded-lg bg-muted p-[3px] text-xs font-semibold", className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 whitespace-nowrap transition-colors",
              on
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A money input with the currency symbol inside. Typing is left as typed; leaving the
 * field writes a valid amount back with two decimals ("40" becomes "40.00").
 */
export function MoneyInput({
  symbol,
  value,
  onValueChange,
  className,
  onBlur,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  symbol: string;
  value: string;
  onValueChange: (next: string) => void;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
      >
        {symbol}
      </span>
      <Input
        inputMode="decimal"
        {...props}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onBlur={(e) => {
          onBlur?.(e);
          const raw = e.target.value.trim();
          if (!raw) return;
          try {
            const minor = parseMoneyToMinor(raw);
            const tidy = moneyInputValue(minor);
            if (minor >= 0 && tidy !== raw) onValueChange(tidy);
          } catch {
            // Left as typed; the form says what's wrong with it.
          }
        }}
        className={cn(FIELD, "pl-7 tabular-nums aria-invalid:border-destructive")}
      />
    </div>
  );
}

/**
 * The When section's date: the next few days as chips, plus a calendar for any other
 * date. Today is the business's today.
 */
export function DayStrip({
  value,
  onChange,
  todayIsoDate,
  days = 6,
  label = "Date",
}: {
  value: string;
  onChange: (isoDate: string) => void;
  todayIsoDate: string;
  days?: number;
  label?: string;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const chips = dayStrip(todayIsoDate, days);
  const inStrip = chips.some((c) => c.isoDate === value);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const groupRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="flex min-w-0 items-stretch gap-1.5">
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={label}
        {...radioGroupKeys}
        className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto"
      >
        {chips.map((c) => {
          const on = c.isoDate === value;
          return (
            <button
              key={c.isoDate}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={dayLabel(c.isoDate)}
              tabIndex={on || (!inStrip && c === chips[0]) ? 0 : -1}
              onClick={() => onChange(c.isoDate)}
              className={cn(
                "flex min-w-11 flex-1 cursor-pointer flex-col items-center justify-center rounded-[10px] border px-1.5 py-1.5 text-xs leading-tight transition-colors",
                on ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-secondary",
              )}
            >
              <span className="font-medium">{c.weekday}</span>
              <span className="text-sm font-bold tabular-nums">{c.day}</span>
            </button>
          );
        })}
      </div>
      <Popover modal open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={
              valid && !inStrip ? `Another date, ${dayLabel(value)} chosen` : "Pick another date"
            }
            className={cn(
              "flex min-w-11 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[10px] border px-2 py-1.5 text-xs transition-colors",
              valid && !inStrip
                ? "border-primary bg-primary-soft text-primary"
                : "bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            <CalendarDays className="size-4" />
            {valid && !inStrip ? (
              <span className="font-bold whitespace-nowrap">{dayLabel(value)}</span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={valid ? parseIso(value) : undefined}
            defaultMonth={valid ? parseIso(value) : parseIso(todayIsoDate)}
            onSelect={(d) => {
              if (!d) return;
              onChange(isoDate(d));
              setCalendarOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  line: string;
  disabled?: boolean;
};

/** Option cards as a radio group: a radio, a label and a line under it. */
export function ChoiceCards<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly ChoiceOption<T>[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      {...radioGroupKeys}
      className="grid gap-2 sm:grid-cols-2"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[12px] border bg-card px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              on ? "border-primary ring-1 ring-primary" : "hover:bg-secondary",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                on ? "border-primary" : "border-input",
              )}
            >
              {on ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{o.line}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A lock, what's fixed, and why. */
export function LockedRow({ title, reason }: { title: ReactNode; reason: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[12px] border px-3 py-2.5 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{reason}</p>
      </div>
    </div>
  );
}

/**
 * Email and Text message boxes for telling the client, shared by both forms. A box
 * that can't reach them is disabled and unticked; the hint says why.
 */
export function ChannelBoxes({
  title,
  ticks,
  blocks,
  onChange,
  disabled,
  hint,
  hintTone = "muted",
  attention,
  ariaPrefix,
}: {
  title: string;
  ticks: ChannelTicks;
  blocks: ContactBlocks;
  onChange: (channel: NotifyChannel, on: boolean) => void;
  disabled?: boolean;
  hint: string;
  hintTone?: "muted" | "destructive";
  /** Red border: the client can't be reached at all. */
  attention?: boolean;
  /** "Send confirmation" / "Send the updated details", for the boxes' labels. */
  ariaPrefix: string;
}) {
  const box = (channel: NotifyChannel, label: string, words: string) => {
    const off = disabled || Boolean(blocks[channel]);
    return (
      <label
        className={cn(
          "flex min-h-11 items-center gap-2 text-sm sm:min-h-0",
          off ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer",
        )}
      >
        <Checkbox
          checked={ticks[channel] && !blocks[channel] && !disabled}
          disabled={off}
          onCheckedChange={(checked) => onChange(channel, checked === true)}
          aria-label={`${ariaPrefix} by ${words}`}
        />
        {label}
      </label>
    );
  };
  return (
    <fieldset
      className={cn(
        "grid gap-2 rounded-[14px] border p-3",
        attention ? "border-destructive/50" : undefined,
      )}
    >
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {box("email", "Email", "email")}
        {box("sms", "Text message", "text message")}
      </div>
      <p
        className={cn(
          "text-xs",
          hintTone === "destructive" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {hint}
      </p>
    </fieldset>
  );
}

/** The sticky footer's two summary lines. */
export function FooterSummary({
  main,
  sub,
  attention,
}: {
  main: string;
  sub: string;
  attention?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 sm:mr-auto" aria-live="polite">
      <p className="truncate text-[15px] font-extrabold">{main}</p>
      <p
        className={cn(
          "truncate text-[12.5px]",
          attention ? "font-medium text-warning-foreground" : "text-muted-foreground",
        )}
      >
        {sub}
      </p>
    </div>
  );
}
