import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, Plus } from "lucide-react";
import { IconTile, ProfileCard, rowClass, TonePill } from "@/components/client-profile/parts";
import { FollowUpActions } from "@/components/FollowUpActions";
import { Button } from "@/components/ui/button";
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
 * "Due back" on a client's profile: what they are due back for and when — the
 * ceramic top-up in 2028, the re-treatment next spring. Open ones first; closed ones
 * (dismissed, booked again, cancelled) are listed under them, faded, so the story reads.
 * Hidden when the client has none and nobody can set one; with `onRemind` the card
 * stays so staff can set a reminder for a client who has never had a job here.
 */
export function CustomerFollowUpsCard({
  customerId,
  firstName,
  onBook,
  onRemind,
  highlight,
}: {
  customerId: string;
  firstName?: string;
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
  // A reminder saved a moment ago only arrives with the refetch.
  const highlightLoaded = Boolean(highlight && rows.some((r) => r.id === highlight.id));
  useEffect(() => {
    if (!highlight || !highlightLoaded) return;
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
  }, [highlight, highlightLoaded]);
  if (followUps.isLoading || (rows.length === 0 && !canRemind)) return null;

  const open = rows.filter(isOpenFollowUp);
  const closed = rows.filter((f) => !isOpenFollowUp(f));
  const date = (iso: string) => formatInTz(iso, timezone, { day: "numeric", month: "short" });
  const who = firstName?.trim() || "this client";

  return (
    <ProfileCard
      title="Due back"
      aside={
        <>
          <Link
            to="/follow-ups"
            className="text-[13px] font-bold text-foreground/70 hover:text-foreground"
          >
            All reminders ›
          </Link>
          {canRemind ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-[30px]"
              onClick={onRemind}
            >
              <Plus className="size-4" />
              Set a reminder
            </Button>
          ) : null}
        </>
      }
    >
      {rows.length === 0 ? (
        <p className={cn(rowClass, "text-sm text-muted-foreground")}>
          No reminders yet. Set one so {who} (and you) know when they're due back.
        </p>
      ) : null}
      <ul className="**:min-w-0">
        {[...open, ...closed].map((f) => {
          const bucket = followUpBucket(f);
          const isOpen = isOpenFollowUp(f);
          return (
            <li
              key={f.id}
              id={`client-follow-up-${f.id}`}
              className={cn(
                rowClass,
                "flex scroll-mt-20 items-start gap-3 transition-colors duration-700",
                flashId === f.id && "bg-primary-soft",
                !isOpen && "opacity-60",
              )}
            >
              <IconTile>
                <BellRing className="size-4" />
              </IconTile>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className="text-[14.5px] font-bold">
                  {f.title}
                  {f.linkedRecord ? (
                    <span className="font-semibold text-muted-foreground">
                      {" "}
                      · {f.linkedRecord.label}
                    </span>
                  ) : null}
                  {isOpen && f.status === "sent" ? (
                    <TonePill tone="blue" className="ml-2 align-middle">
                      {FOLLOW_UP_STATUS_LABELS[f.status]}
                    </TonePill>
                  ) : null}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {isOpen ? (
                    <span
                      className={cn(
                        bucket === "overdue"
                          ? "font-semibold text-destructive"
                          : bucket === "due_soon"
                            ? "font-semibold text-warning-foreground"
                            : undefined,
                      )}
                    >
                      Due {date(f.dueAt)} ({relativeDueLabel(f.dueAt)})
                    </span>
                  ) : (
                    <TonePill tone="grey" className="mr-1 align-middle">
                      {FOLLOW_UP_STATUS_LABELS[f.status]}
                    </TonePill>
                  )}
                  {f.source === "manual" ? " · set by you" : ""} · last done {date(f.lastDoneAt)}
                </p>
              </div>
              {canAct ? (
                <div className="shrink-0">
                  <FollowUpActions followUp={f} onBook={onBook} compact />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </ProfileCard>
  );
}
