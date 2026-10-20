import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, Plus } from "lucide-react";
import { FollowUpActions } from "@/components/FollowUpActions";
import { Button } from "@/components/ui/button";
import { SectionCard, StatusBadge } from "@/components/ui-bits";
import { useCustomerFollowUps } from "@/lib/api/hooks";
import type { ServiceFollowUp } from "@/lib/api/types";
import {
  FOLLOW_UP_STATUS_LABELS,
  followUpBucket,
  isOpenFollowUp,
  relativeDueLabel,
} from "@/lib/follow-ups";
import { formatInTz } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

/**
 * "Follow-ups" on a client's profile: what they are due back for and when — the
 * ceramic top-up in 2028, the re-treatment next spring. Open ones first; closed ones
 * (dismissed, booked again, cancelled) are listed under them so the story reads.
 * Hidden when the client has none and nobody can set one; with `onRemind` the card
 * stays so staff can set a reminder for a client who has never had a job here.
 */
export function CustomerFollowUpsCard({
  customerId,
  onBook,
  onRemind,
  highlight,
}: {
  customerId: string;
  /** Scrolls to and flashes this reminder; a new object each time it is asked for. */
  highlight?: { id: string } | null;
  /** Opens the booking form prefilled for this follow-up. */
  onBook?: (followUp: ServiceFollowUp) => void;
  /** Opens "Remind a client" prefilled for this client. */
  onRemind?: () => void;
}) {
  const tenant = useTenant();
  const canAct = tenant.can(PERMISSIONS.BOOKING_CREATE);
  const timezone = tenant.business?.defaultTimezone || "Europe/London";
  const followUps = useCustomerFollowUps(customerId);
  const rows = followUps.data ?? [];
  const canRemind = Boolean(onRemind) && canAct;
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlight) return;
    // Waits a frame so the dialog that asked has let go of focus and scroll.
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`client-follow-up-${highlight.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashId(highlight.id);
    });
    const timer = window.setTimeout(() => setFlashId(null), 2500);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [highlight]);
  if (followUps.isLoading || (rows.length === 0 && !canRemind)) return null;

  const open = rows.filter(isOpenFollowUp);
  const closed = rows.filter((f) => !isOpenFollowUp(f));

  return (
    <SectionCard
      title="Reminders"
      description="When this client is due back — scheduled from each finished job whose service has a follow-up reminder, or set by you."
      action={
        <div className="flex items-center gap-3">
          <Link to="/follow-ups" className="text-xs font-medium text-primary hover:underline">
            All reminders
          </Link>
          {canRemind ? (
            <Button type="button" variant="outline" size="sm" onClick={onRemind}>
              <Plus className="size-4" />
              Set a reminder
            </Button>
          ) : null}
        </div>
      }
      bodyClassName="p-0"
    >
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          No reminders yet. Set one to have this client (and you) told when they are due back.
        </p>
      ) : null}
      <ul className="divide-y **:min-w-0">
        {[...open, ...closed].map((f) => {
          const bucket = followUpBucket(f);
          return (
            <li
              key={f.id}
              id={`client-follow-up-${f.id}`}
              className={cn(
                "flex scroll-mt-20 flex-col gap-2 px-5 py-3 transition-colors duration-700 sm:flex-row sm:items-start",
                flashId === f.id && "bg-primary-soft",
              )}
            >
              <div className="grid min-w-0 flex-1 gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                    <BellRing className="size-3.5 text-muted-foreground" />
                    {f.title}
                  </span>
                  {f.linkedRecord ? (
                    <span className="text-xs text-muted-foreground">· {f.linkedRecord.label}</span>
                  ) : null}
                  <StatusBadge status={f.status} />
                </div>
                <p
                  className={cn(
                    "text-xs",
                    bucket === "overdue"
                      ? "text-destructive"
                      : bucket === "due_soon"
                        ? "text-warning-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {isOpenFollowUp(f)
                    ? `Due ${formatInTz(f.dueAt, timezone, { dateStyle: "medium" })} (${relativeDueLabel(f.dueAt)})`
                    : FOLLOW_UP_STATUS_LABELS[f.status]}
                  <span className="text-muted-foreground">
                    {" "}
                    · {f.source === "manual" ? "set by you · last done" : "last done"}{" "}
                    {formatInTz(f.lastDoneAt, timezone, { dateStyle: "medium" })}
                  </span>
                </p>
              </div>
              {canAct ? (
                <div className="shrink-0 self-end sm:self-start">
                  <FollowUpActions followUp={f} onBook={onBook} compact />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
