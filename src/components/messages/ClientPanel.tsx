import type { ReactNode } from "react";
import { CalendarPlus, Check, Link2, PoundSterling, Repeat2, X } from "lucide-react";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { useVehicleFields } from "@/components/vehicles/use-vehicles-data";
import { Button } from "@/components/ui/button";
import { useLinkedRecord, useStaffList } from "@/lib/api/hooks";
import { customerDisplayName, type Customer } from "@/lib/api/types";
import { bookingTitle } from "@/lib/client-profile";
import { formatInTz } from "@/lib/format";
import { clientReach } from "@/lib/messages";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { registrationOf, vehicleTitle } from "@/lib/vehicles";
import { ClientAvatar } from "./parts";
import { useNextBooking } from "./use-next-booking";

export type ClientPanelActions = {
  onViewProfile: () => void;
  onNewBooking: () => void;
  onOpenBooking: (bookingId: string, opts?: { reschedule?: boolean }) => void;
  onSendBookingLink: () => void;
};

export function ClientPanel({
  customer,
  timezone,
  actions,
  className,
}: {
  customer: Customer;
  timezone: string;
  actions: ClientPanelActions;
  className?: string;
}) {
  const { can } = useTenant();
  const name = customerDisplayName(customer);
  const { next, count } = useNextBooking(customer.id);
  const staff = useStaffList();
  const record = useLinkedRecord(next?.linkedRecordId ?? undefined);
  const { fields } = useVehicleFields();
  const reach = clientReach(customer);
  const canBook = can(PERMISSIONS.BOOKING_CREATE);
  const canMove = can(PERMISSIONS.BOOKING_RESCHEDULE);
  const canMoney = can(PERMISSIONS.PAYMENT_READ);
  const tz = next?.timezone || timezone;
  const staffName = next ? staff.data?.find((s) => s.id === next.staffId)?.displayName : null;
  const plate = record.data ? registrationOf(record.data.values ?? {}, fields) : null;
  const vehicle = record.data ? vehicleTitle(record.data, fields) : null;
  const consent = customer.marketingConsent;
  const since = formatInTz(customer.createdAt, timezone, { month: "short", year: "numeric" });

  return (
    <div className={cn("flex flex-col gap-4 text-[13.5px]", className)}>
      <div className="flex flex-col items-center text-center">
        <ClientAvatar id={customer.id} name={name} size={56} />
        <p className="mt-2 text-[16px] font-extrabold">{name}</p>
        <p className="text-[12.5px] text-muted-foreground">
          Client since {since} · {count} booking{count === 1 ? "" : "s"}
        </p>
        <Button variant="outline" size="sm" className="mt-2.5" onClick={actions.onViewProfile}>
          View profile
        </Button>
      </div>

      <section aria-label="Next booking" className="rounded-[14px] border bg-panel p-3.5">
        <p className="text-[11.5px] font-extrabold tracking-wide text-muted-foreground uppercase">
          Next booking
        </p>
        {next ? (
          <>
            <p className="mt-1.5 font-extrabold">
              {formatInTz(next.start, tz, { weekday: "short", day: "numeric", month: "short" })}
              {next.allDay
                ? " · All day"
                : ` · ${formatInTz(next.start, tz, { timeStyle: "short" })}`}
            </p>
            <p className="truncate text-muted-foreground">
              {[bookingTitle(next), staffName].filter(Boolean).join(" · ")}
            </p>
            {plate || vehicle ? (
              <p className="mt-2 flex items-center gap-2">
                {plate ? <NumberPlate registration={plate} size="small" /> : null}
                {vehicle && vehicle !== plate ? (
                  <span className="truncate text-[12.5px] text-muted-foreground">{vehicle}</span>
                ) : null}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => actions.onOpenBooking(next.id)}>
                Open
              </Button>
              {canMove ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => actions.onOpenBooking(next.id, { reschedule: true })}
                >
                  Move
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-muted-foreground">No upcoming bookings</p>
            {canBook ? (
              <Button size="sm" className="mt-2.5" onClick={actions.onNewBooking}>
                <CalendarPlus className="size-4" /> New booking
              </Button>
            ) : null}
          </>
        )}
      </section>

      <section aria-label="Quick actions">
        <p className="mb-1 text-[11.5px] font-extrabold tracking-wide text-muted-foreground uppercase">
          Quick actions
        </p>
        <ul className="-mx-1">
          {next && canMove ? (
            <ActionRow
              icon={<Repeat2 className="size-4" />}
              onClick={() => actions.onOpenBooking(next.id, { reschedule: true })}
            >
              Move booking
            </ActionRow>
          ) : null}
          <ActionRow icon={<Link2 className="size-4" />} onClick={actions.onSendBookingLink}>
            Send booking link
          </ActionRow>
          {next && canMoney ? (
            <ActionRow
              icon={<PoundSterling className="size-4" />}
              onClick={() => actions.onOpenBooking(next.id)}
            >
              Take a payment
            </ActionRow>
          ) : null}
        </ul>
      </section>

      <section aria-label="Can message by">
        <p className="mb-1.5 text-[11.5px] font-extrabold tracking-wide text-muted-foreground uppercase">
          Can message by
        </p>
        <ReachRow ok={reach.sms} label="Text" why={reach.smsWhyNot} />
        <ReachRow ok={reach.email} label="Email" why={reach.emailWhyNot} />
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          {consent?.granted && consent.updatedAt
            ? `Marketing: agreed ${formatInTz(consent.updatedAt, timezone, { day: "numeric", month: "short", year: "numeric" })}`
            : "Marketing: not agreed"}
        </p>
      </section>
    </div>
  );
}

function ActionRow({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-1 text-left font-semibold hover:bg-secondary"
      >
        <span className="text-muted-foreground">{icon}</span>
        {children}
      </button>
    </li>
  );
}

function ReachRow({ ok, label, why }: { ok: boolean; label: string; why: string | null }) {
  return (
    <p className="flex items-center gap-2 py-0.5">
      {ok ? (
        <Check className="size-4 text-[#1f6b41] dark:text-[#9fe3bf]" aria-hidden />
      ) : (
        <X className="size-4 text-muted-foreground" aria-hidden />
      )}
      <span className="font-semibold">{label}</span>
      <span className="sr-only">{ok ? "yes" : "no"}</span>
      {!ok && why ? (
        <span className="truncate text-[12px] text-muted-foreground">{why}</span>
      ) : null}
    </p>
  );
}
