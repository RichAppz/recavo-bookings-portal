import { Link } from "@tanstack/react-router";
import { BellRing, ChevronRight } from "lucide-react";
import { useBookingFollowUps } from "@/lib/api/hooks";
import { FOLLOW_UP_STATUS_LABELS, isOpenFollowUp, relativeDueLabel } from "@/lib/follow-ups";
import { formatInTz } from "@/lib/format";

/**
 * "Next top-up due …" rows on the booking panel's Details tab: one per follow-up
 * this job spawned (a job with two follow-up services spawns two). Renders nothing
 * until the job is done and the API has scheduled them. Sits inside the details
 * `<dl>`, so it emits `dt`/`dd` pairs rather than its own container.
 */
export function BookingFollowUpDetail({
  bookingId,
  timezone,
  onNavigate,
}: {
  bookingId: string;
  timezone: string;
  /** Close the panel when staff follow the link. */
  onNavigate?: () => void;
}) {
  const followUps = useBookingFollowUps(bookingId);
  const rows = followUps.data ?? [];
  if (rows.length === 0) return null;

  return (
    <>
      {rows.map((f) => {
        const open = isOpenFollowUp(f);
        return (
          <div key={f.id} className="col-span-2">
            <dt className="text-xs text-muted-foreground">
              {open ? `Next ${f.title.toLowerCase()} due` : f.title}
            </dt>
            <dd className="font-medium">
              <Link
                to="/follow-ups"
                onClick={onNavigate}
                className="inline-flex items-center gap-1 underline-offset-4 hover:text-primary hover:underline"
              >
                <BellRing className="size-3.5 text-muted-foreground" />
                {open ? (
                  <>
                    {formatInTz(f.dueAt, timezone, { dateStyle: "medium" })}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({relativeDueLabel(f.dueAt)})
                    </span>
                  </>
                ) : (
                  FOLLOW_UP_STATUS_LABELS[f.status]
                )}
                <ChevronRight className="size-3.5 text-muted-foreground" />
              </Link>
            </dd>
            <dd className="text-xs text-muted-foreground">
              {f.status === "sent" && f.sentAt
                ? `Reminder sent ${formatInTz(f.sentAt, timezone, { dateStyle: "medium" })}`
                : f.status === "scheduled"
                  ? `Reminder goes out ${formatInTz(f.snoozedUntil && new Date(f.snoozedUntil) > new Date(f.remindAt) ? f.snoozedUntil : f.remindAt, timezone, { dateStyle: "medium" })}`
                  : f.status === "completed"
                    ? "The client booked this again."
                    : ""}
            </dd>
          </div>
        );
      })}
    </>
  );
}
