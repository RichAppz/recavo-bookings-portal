import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BottomSheet, BottomSheetContent, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsPhone } from "@/hooks/use-media-query";
import type { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { cn } from "@/lib/utils";

export interface ReminderAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}

export interface ReminderRow {
  key: string;
  icon: LucideIcon;
  title: string;
  /** One line of context: what the message says / is about. */
  description: string;
  /** Why the whole row is off; null when at least one action can go. */
  blocked: string | null;
  /** Small print under the context: channels, per-channel availability, last sent. */
  meta: string[];
  actions: ReminderAction[];
  /** Inline problem from the last tap on this row (e.g. a text refused for credits). */
  error?: ReactNode;
}

/**
 * Every message staff can send about one booking, in a drawer beside the booking
 * panel — a second right-hand sheet on a desktop, a bottom sheet on a phone so the
 * rows never clip. Closing it leaves the booking panel where it was. Rows are
 * described by the panel (it owns the mutations and the rules); this only lays them out.
 */
export function BookingRemindersDrawer({
  open,
  onOpenChange,
  customerName,
  rows,
  smsCredits,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  rows: ReminderRow[];
  smsCredits: ReturnType<typeof useSmsCreditsSummary>;
  /** Called before following a link out of the drawer (so the panel can close too). */
  onNavigate?: () => void;
}) {
  const isPhone = useIsPhone();
  const description = `Nudge ${customerName} about this booking. Each one goes by text, email or both, depending on what's on their record.`;

  const creditsLine =
    smsCredits.level === "unlimited" ? (
      "Texts are included in your plan."
    ) : smsCredits.level === "empty" ? (
      <>
        No text credits left — texts go by email instead.{" "}
        <Link
          to="/billing/sms-credits"
          onClick={onNavigate}
          className="font-medium text-primary underline underline-offset-2"
        >
          Buy texts
        </Link>
      </>
    ) : smsCredits.credits ? (
      `${smsCredits.credits.balance} text${smsCredits.credits.balance === 1 ? "" : "s"} left.`
    ) : null;

  const list = (
    <ul className="space-y-3" data-testid="reminders-drawer-rows">
      {rows.map((row) => (
        <ReminderRowItem key={row.key} row={row} />
      ))}
    </ul>
  );

  if (isPhone) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent aria-describedby={undefined} data-testid="reminders-drawer">
          <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <BottomSheetTitle className="text-base font-semibold">Reminders</BottomSheetTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
              {creditsLine ? (
                <p className="mt-1 text-xs text-muted-foreground">{creditsLine}</p>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </header>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {list}
          </div>
        </BottomSheetContent>
      </BottomSheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        data-testid="reminders-drawer"
      >
        <SheetHeader className="space-y-1 border-b px-5 py-4 pr-12 text-left">
          <SheetTitle>Reminders</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
          {creditsLine ? <p className="text-xs text-muted-foreground">{creditsLine}</p> : null}
        </SheetHeader>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{list}</div>
      </SheetContent>
    </Sheet>
  );
}

function ReminderRowItem({ row }: { row: ReminderRow }) {
  const Icon = row.icon;
  return (
    <li
      className={cn("rounded-xl border p-3", row.blocked ? "bg-secondary/30" : "bg-card")}
      data-testid={`reminder-row-${row.key}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted"
          aria-hidden
        >
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{row.title}</p>
          <p className="text-xs text-muted-foreground">{row.description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 pl-11">
        <div className="min-w-0 flex-1 basis-40 text-xs text-muted-foreground">
          {row.blocked ? <p className="font-medium text-foreground/80">{row.blocked}</p> : null}
          {row.meta.map((line, i) => (
            <p key={i} className="truncate">
              {line}
            </p>
          ))}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {row.actions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <Button
                key={action.key}
                size="sm"
                variant="outline"
                disabled={action.disabled || action.pending}
                onClick={action.onClick}
              >
                {ActionIcon ? <ActionIcon className="size-4" /> : null}
                {action.pending ? "Sending…" : action.label}
              </Button>
            );
          })}
        </div>
      </div>
      {row.error ? <div className="mt-2 pl-11 text-xs text-destructive">{row.error}</div> : null}
    </li>
  );
}
