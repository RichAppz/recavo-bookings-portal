import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Hourglass } from "lucide-react";
import { IconTile, ProfileCard, rowClass, TonePill } from "@/components/client-profile/parts";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { useVehicleFields } from "@/components/vehicles/use-vehicles-data";
import { WaitlistMenu } from "@/components/waitlist/actions";
import { Button } from "@/components/ui/button";
import { useCustomerLinkedRecords, useCustomerWaitlist } from "@/lib/api/hooks";
import type { WaitlistEntry } from "@/lib/api/types";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { registrationOf } from "@/lib/vehicles";
import { customerName, describePreferences, waitingSince } from "@/lib/waitlist";

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
  const records = useCustomerLinkedRecords(
    rows.some((e) => e.linkedRecordId) ? customerId : undefined,
  );
  const { fields } = useVehicleFields();
  const plates = useMemo(
    () => new Map((records.data ?? []).map((r) => [r.id, registrationOf(r.values, fields)])),
    [records.data, fields],
  );
  if (entries.isLoading || rows.length === 0) return null;
  const name = customerName(rows[0]!);

  return (
    <ProfileCard
      title="On the waitlist"
      aside={
        <Link
          to="/waitlist"
          search={{ q: name }}
          className="text-[13px] font-bold text-foreground/70 hover:text-foreground"
        >
          Whole waitlist ›
        </Link>
      }
    >
      <ul className="**:min-w-0">
        {rows.map((e) => {
          const plate = e.linkedRecordId ? plates.get(e.linkedRecordId) : null;
          return (
            <li key={e.id} className={cn(rowClass, "flex items-center gap-3")}>
              <IconTile>
                <Hourglass className="size-4" />
              </IconTile>
              <Link
                to="/waitlist"
                search={{ entry: e.id }}
                className="grid min-w-0 flex-1 gap-0.5 hover:opacity-80"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[14.5px] font-bold">
                    {e.service?.name ?? "Service"}
                    {e.variant ? (
                      <span className="font-semibold text-muted-foreground">
                        {" "}
                        · {e.variant.name}
                      </span>
                    ) : null}
                  </span>
                  {plate ? (
                    <NumberPlate registration={plate} size="small" />
                  ) : e.linkedRecord ? (
                    <span className="text-[13px] font-semibold text-muted-foreground">
                      {e.linkedRecord.label}
                    </span>
                  ) : null}
                  {e.priority === "high" ? <TonePill tone="amber">High priority</TonePill> : null}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {describePreferences(e.preferences)} · {waitingSince(e.createdAt).toLowerCase()}
                </span>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                {canAct && onBook ? (
                  <Button size="sm" onClick={() => onBook(e)}>
                    Book
                  </Button>
                ) : null}
                <WaitlistMenu entry={e} canAct={canAct} onEdit={onEdit} />
              </div>
            </li>
          );
        })}
      </ul>
    </ProfileCard>
  );
}
