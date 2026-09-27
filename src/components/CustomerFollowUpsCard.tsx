import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { FollowUpActions } from "@/components/FollowUpActions";
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
 * Hidden entirely when the client has never had a follow-up service.
 */
export function CustomerFollowUpsCard({
  customerId,
  onBook,
}: {
  customerId: string;
  /** Opens the booking form prefilled for this follow-up. */
  onBook?: (followUp: ServiceFollowUp) => void;
}) {
  const tenant = useTenant();
  const canAct = tenant.can(PERMISSIONS.BOOKING_CREATE);
  const timezone = tenant.business?.defaultTimezone || "Europe/London";
  const followUps = useCustomerFollowUps(customerId);
  const rows = followUps.data ?? [];
  if (followUps.isLoading || rows.length === 0) return null;

  const open = rows.filter(isOpenFollowUp);
  const closed = rows.filter((f) => !isOpenFollowUp(f));

  return (
    <SectionCard
      title="Follow-ups"
      description="When this client is due back — scheduled from each finished job whose service has a follow-up reminder."
      action={
        <Link to="/follow-ups" className="text-xs font-medium text-primary hover:underline">
          All follow-ups
        </Link>
      }
      bodyClassName="p-0"
    >
      <ul className="divide-y **:min-w-0">
        {[...open, ...closed].map((f) => {
          const bucket = followUpBucket(f);
          return (
            <li key={f.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start">
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
                    · last done {formatInTz(f.lastDoneAt, timezone, { dateStyle: "medium" })}
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
