import { Link } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { WaitlistActions } from "@/components/WaitlistActions";
import { SectionCard } from "@/components/ui-bits";
import { useCustomerWaitlist } from "@/lib/api/hooks";
import type { WaitlistEntry } from "@/lib/api/types";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
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
    <SectionCard
      title="On the waitlist"
      description="Jobs this client wants that the diary couldn't fit yet."
      action={
        <Link to="/waitlist" className="text-xs font-medium text-primary hover:underline">
          Whole waitlist
        </Link>
      }
      bodyClassName="p-0"
    >
      <ul className="divide-y **:min-w-0">
        {rows.map((e) => (
          <li key={e.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <Hourglass className="size-3.5 text-muted-foreground" />
                  {e.service?.name ?? "Service"}
                  {e.variant ? (
                    <span className="font-normal text-muted-foreground">· {e.variant.name}</span>
                  ) : null}
                </span>
                {e.linkedRecord ? (
                  <span className="text-xs text-muted-foreground">· {e.linkedRecord.label}</span>
                ) : null}
                {e.priority === "high" ? (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                    High priority
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground/80">{describePreferences(e.preferences)}</span>
                {" · "}
                {waitingSince(e.createdAt)}
                {e.location ? ` · ${e.location.name}` : ""}
              </p>
              {e.notes ? <p className="text-xs text-muted-foreground italic">“{e.notes}”</p> : null}
            </div>
            {canAct ? (
              <div className="shrink-0 self-end sm:self-start">
                <WaitlistActions entry={e} onBook={onBook} onEdit={onEdit} compact />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
