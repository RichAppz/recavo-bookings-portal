import { MapPin, Truck } from "lucide-react";
import { TonePill } from "@/components/client-profile/parts";
import type { LocationKind, TodayState } from "@/lib/locations";
import { initials, KIND_LABEL } from "@/lib/locations";
import { cn } from "@/lib/utils";

/** Pin for places clients visit, van for "We go to the client". */
export function PinTile({ kind, size = 44 }: { kind: LocationKind; size?: 34 | 44 | 56 }) {
  const Icon = kind === "mobile" ? Truck : MapPin;
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
    >
      <Icon className={size === 34 ? "size-4" : "size-5"} />
    </span>
  );
}

export function TypeChip({ kind }: { kind: LocationKind }) {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-secondary px-2 text-xs font-bold whitespace-nowrap text-muted-foreground">
      {KIND_LABEL[kind]}
    </span>
  );
}

export function TodayPill({ state }: { state: Pick<TodayState, "tone" | "pill"> }) {
  return <TonePill tone={state.tone}>{state.pill}</TonePill>;
}

export function HiddenPill() {
  return <TonePill tone="grey">Not on booking page</TonePill>;
}

/** Up to three overlapping initials. */
export function TeamAvatars({ names, className }: { names: string[]; className?: string }) {
  if (names.length === 0) return null;
  return (
    <span aria-hidden className={cn("flex -space-x-2", className)}>
      {names.slice(0, 3).map((name) => (
        <span
          key={name}
          className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-[11px] font-extrabold text-muted-foreground"
        >
          {initials(name)}
        </span>
      ))}
    </span>
  );
}

export function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[15px] font-extrabold">{children}</h3>
      {action}
    </div>
  );
}
