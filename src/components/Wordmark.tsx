import { CalendarDays } from "lucide-react";

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
        <CalendarDays className="size-4.5" strokeWidth={2.4} />
      </span>
      {!compact ? (
        <span className="text-[19px] font-semibold tracking-tight text-sidebar-accent-foreground">
          RECAVO
        </span>
      ) : null}
    </span>
  );
}
