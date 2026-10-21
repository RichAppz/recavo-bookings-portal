import { Link } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { IconTile, ProfileCard, rowClass, TonePill } from "@/components/client-profile/parts";
import { WaitlistActions } from "@/components/WaitlistActions";
import { useCustomerWaitlist } from "@/lib/api/hooks";
import type { WaitlistEntry } from "@/lib/api/types";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { describePreferences, waitingSince } from "@/lib/waitlist";

/**
 * "On the waitlist" on a client's profile: the jobs they want but couldn't get a slot
 * for. Hidden when they have none open.
 */
export function CustomerWaitlistCard({
  customerId,
  onBook,
  onEdit,
}: {
  customerId: string;
  /** Opens the booking form prefilled from this entry. */
  onBook?: (entry: WaitlistEntry) => void;
  onEdit?: (entry: WaitlistEntry) => void;
}) {
  const tenant = useTenant();
  const canAct = tenant.can(PERMISSIONS.BOOKING_CREATE);
  const entries = useCustomerWaitlist(customerId);
  const rows = (entries.data ?? []).filter((e) => e.status === "waiting");
  if (entries.isLoading || rows.length === 0) return null;

  return (
    <ProfileCard
      title="On the waitlist"
      aside={
        <Link
          to="/waitlist"
          className="text-[13px] font-bold text-foreground/70 hover:text-foreground"
        >
          Whole waitlist ›
        </Link>
      }
    >
      <ul className="**:min-w-0">
        {rows.map((e) => (
          <li key={e.id} className={cn(rowClass, "flex items-start gap-3")}>
            <IconTile>
              <Hourglass className="size-4" />
            </IconTile>
            <div className="grid min-w-0 flex-1 gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-bold">
                  {e.service?.name ?? "Service"}
                  {e.variant ? (
                    <span className="font-semibold text-muted-foreground"> · {e.variant.name}</span>
                  ) : null}
                  {e.linkedRecord ? (
                    <span className="font-semibold text-muted-foreground">
                      {" "}
                      · {e.linkedRecord.label}
                    </span>
                  ) : null}
                </span>
                {e.priority === "high" ? <TonePill tone="amber">High priority</TonePill> : null}
              </div>
              <p className="text-[13px] text-muted-foreground">
                <span className="text-foreground/80">{describePreferences(e.preferences)}</span>
                {" · "}
                {waitingSince(e.createdAt)}
                {e.location ? ` · ${e.location.name}` : ""}
              </p>
              {e.notes ? (
                <p className="text-[13px] text-muted-foreground italic">“{e.notes}”</p>
              ) : null}
            </div>
            {canAct ? (
              <div className="shrink-0">
                <WaitlistActions entry={e} onBook={onBook} onEdit={onEdit} compact />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </ProfileCard>
  );
}
