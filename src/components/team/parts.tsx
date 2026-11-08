import type { ReactNode } from "react";
import { TonePill } from "@/components/client-profile/parts";
import { hm, initials } from "@/lib/locations";
import type { FeedKind, StatusTone } from "@/lib/team";
import { KIND_CHIP } from "@/lib/team";
import { cn } from "@/lib/utils";

/** Photo or initials inside a 2px ring in the person's colour, with a 2px gap. */
export function TeamAvatar({
  name,
  photoUrl,
  colour,
  size = 38,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  colour?: string | null;
  size?: 38 | 48 | 56 | 32;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 rounded-full p-[2px]", className)}
      style={{
        width: size + 8,
        height: size + 8,
        boxShadow: `inset 0 0 0 2px ${colour || "var(--border)"}`,
      }}
    >
      <span
        className="m-[2px] flex size-full items-center justify-center overflow-hidden rounded-full bg-secondary font-extrabold text-secondary-foreground"
        style={{ fontSize: size >= 48 ? 16 : 12.5 }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          initials(name)
        )}
      </span>
    </span>
  );
}

export function BookablePill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <TonePill tone={tone}>{children}</TonePill>;
}

const DOT: Record<StatusTone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  grey: "bg-muted-foreground/50",
};

export function StatusDot({ tone }: { tone: StatusTone }) {
  return <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", DOT[tone])} />;
}

const KIND_TONE: Record<FeedKind, string> = {
  holiday: "bg-[#e8edfd] text-[#3651b8] dark:bg-[rgba(99,135,255,0.16)] dark:text-[#b4c4ff]",
  block: "bg-secondary text-secondary-foreground",
  training: "bg-secondary text-secondary-foreground",
  event: "bg-[#f3e8fd] text-[#6b3fa0] dark:bg-[rgba(168,120,255,0.16)] dark:text-[#d6c0ff]",
  closure: "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]",
};

export function KindChip({ kind }: { kind: FeedKind }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] w-[78px] shrink-0 items-center justify-center rounded-md text-xs font-bold",
        KIND_TONE[kind],
      )}
    >
      {KIND_CHIP[kind]}
    </span>
  );
}

/** Two or more option cards as one radio group ("Can clients book Ben?"). */
export function OptionCards<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; title: string; help: string }[];
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2">
      <span className="text-sm font-bold">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={cn(
                "grid min-h-11 cursor-pointer gap-0.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                on ? "border-primary bg-primary/5" : "hover:bg-secondary/50",
              )}
            >
              <span className="text-sm font-bold">{o.title}</span>
              <span className="text-xs text-muted-foreground">{o.help}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A vertical radio list with a title and help line per option. */
export function RadioList<T extends string>({
  label,
  value,
  onChange,
  options,
  hideLabel,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; title: string; help?: string }[];
  hideLabel?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2">
      {hideLabel ? null : <span className="text-sm font-bold">{label}</span>}
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors",
              on && "border-primary bg-primary/5",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                on && "border-primary",
              )}
            >
              {on ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            <span className="grid gap-0.5">
              <span className="text-sm font-bold">{o.title}</span>
              {o.help ? <span className="text-xs text-muted-foreground">{o.help}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Bars on a 06:00 to 22:00 track, one row a day; decorative, the times are in text beside it. */
export function WeekTrack({
  rules,
  locationName,
}: {
  rules: { dayOfWeek: number; startMinute: number; endMinute: number; locationId: string | null }[];
  locationName?: (id: string | null) => string | null;
}) {
  const START = 6 * 60;
  const END = 22 * 60;
  const pct = (m: number) =>
    `${((Math.min(END, Math.max(START, m)) - START) / (END - START)) * 100}%`;
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <ul className="grid gap-1.5 text-sm">
      {names.map((name, i) => {
        const day = i + 1;
        const slots = rules
          .filter((r) => r.dayOfWeek === day)
          .sort((a, b) => a.startMinute - b.startMinute);
        const text = slots
          .map((s) => {
            const where = locationName?.(s.locationId);
            const time = `${hm(s.startMinute)} to ${hm(s.endMinute)}`;
            return where ? `${time} (${where})` : time;
          })
          .join(", ");
        return (
          <li
            key={name}
            className="grid grid-cols-[36px_1fr] items-center gap-3 sm:grid-cols-[36px_120px_1fr]"
          >
            <span className={cn("font-bold", slots.length === 0 && "text-muted-foreground")}>
              {name}
            </span>
            <span aria-hidden className="relative hidden h-2 rounded-full bg-secondary sm:block">
              {slots.map((s) => (
                <span
                  key={`${s.startMinute}-${s.endMinute}`}
                  className="absolute inset-y-0 rounded-full bg-primary"
                  style={{
                    left: pct(s.startMinute),
                    width: `calc(${pct(s.endMinute)} - ${pct(s.startMinute)})`,
                  }}
                />
              ))}
            </span>
            <span
              className={cn(
                "truncate tabular-nums text-[13px]",
                slots.length === 0 && "text-muted-foreground",
              )}
            >
              {text || "Off"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function PanelSection({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="text-[15px] font-extrabold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
