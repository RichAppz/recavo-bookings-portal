import type { ReactNode } from "react";
import { CalendarPlus } from "lucide-react";
import { CustomerFollowUpsCard } from "@/components/CustomerFollowUpsCard";
import { CustomerWaitlistCard } from "@/components/CustomerWaitlistCard";
import { NoteQuickAdd, NotesList } from "@/components/client-profile/Notes";
import {
  CardLink,
  DateTile,
  ProfileCard,
  rowClass,
  TONE_TEXT,
  TonePill,
} from "@/components/client-profile/parts";
import { TagChips } from "@/components/client-profile/Tags";
import { Button } from "@/components/ui/button";
import {
  customerAddressLine,
  type Booking,
  type Customer,
  type CustomerNote,
  type EntitlementView,
  type ServiceFollowUp,
  type WaitlistEntry,
} from "@/lib/api/types";
import {
  bookingTitle,
  comingUpPill,
  entitlementIsExpired,
  expiresWithin30Days,
  longDate,
  shortDate,
} from "@/lib/client-profile";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";

const CHANNEL_LABELS: Record<Customer["contactPreferences"]["preferredChannel"], string> = {
  sms: "Text",
  email: "Email",
  phone: "Phone",
  none: "None",
};

export function ComingUpCard({
  upcoming,
  firstName,
  timezone,
  staffName,
  locationName,
  money,
  onOpenBooking,
  onAllBookings,
  onNewBooking,
}: {
  upcoming: readonly Booking[];
  firstName: string;
  timezone: string;
  staffName: (id: string) => string | null;
  locationName: (id: string) => string | null;
  money: (minor: number, currency: string) => string;
  onOpenBooking: (id: string) => void;
  onAllBookings: () => void;
  onNewBooking?: () => void;
}) {
  return (
    <ProfileCard
      title="Coming up"
      aside={<CardLink onClick={onAllBookings}>All bookings</CardLink>}
    >
      {upcoming.length === 0 ? (
        <div className={cn(rowClass, "flex flex-wrap items-center justify-between gap-3 py-5")}>
          <div>
            <p className="text-[14.5px] font-bold">Nothing booked</p>
            <p className="text-[13px] text-muted-foreground">
              {firstName} has nothing in the diary.
            </p>
          </div>
          {onNewBooking ? (
            <Button size="sm" onClick={onNewBooking}>
              <CalendarPlus className="size-4" /> New booking
            </Button>
          ) : null}
        </div>
      ) : (
        <ul>
          {upcoming.slice(0, 3).map((b) => {
            const tz = b.timezone || timezone;
            const pill = comingUpPill(b, (m) => money(m, b.currency));
            const time = b.allDay
              ? "All day"
              : `${formatInTz(b.start, tz, { timeStyle: "short" })} to ${formatInTz(b.end, tz, { timeStyle: "short" })}`;
            const line = [time, staffName(b.staffId), locationName(b.locationId)]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={b.id} className="border-t">
                <button
                  type="button"
                  onClick={() => onOpenBooking(b.id)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-[11px] text-left hover:bg-secondary/40"
                >
                  <DateTile
                    weekday={formatInTz(b.start, tz, { weekday: "short" })}
                    date={formatInTz(b.start, tz, { day: "numeric" })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold">
                      {bookingTitle(b)}
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {formatInTz(b.start, tz, { day: "numeric", month: "short" })} · {line}
                    </span>
                  </span>
                  {pill ? <TonePill tone={pill.tone}>{pill.label}</TonePill> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ProfileCard>
  );
}

export function NotesCard({
  customerId,
  notes,
  timezone,
  canAdd,
  onAllNotes,
}: {
  customerId: string;
  notes: readonly CustomerNote[];
  timezone: string;
  canAdd: boolean;
  onAllNotes: () => void;
}) {
  return (
    <ProfileCard
      title="Notes"
      note="Only your team sees these"
      aside={notes.length > 2 ? <CardLink onClick={onAllNotes}>All notes</CardLink> : null}
    >
      {canAdd ? (
        <div className="px-4 pb-3">
          <NoteQuickAdd customerId={customerId} />
        </div>
      ) : null}
      <NotesList notes={notes} timezone={timezone} limit={2} />
    </ProfileCard>
  );
}

export function PackageCard({
  credits,
  packageName,
  purchaseLine,
  timezone,
  nowMs,
  onMoney,
}: {
  credits: readonly EntitlementView[];
  packageName: (packageId: string) => string;
  /** "bought 3 Sept for £420", when the purchase is known. */
  purchaseLine: (view: EntitlementView) => string | null;
  timezone: string;
  nowMs: number;
  onMoney?: () => void;
}) {
  const active = credits.filter((v) => !entitlementIsExpired(v.entitlement, nowMs));
  if (active.length === 0) return null;
  return (
    <ProfileCard
      title={active.length > 1 ? "Packages" : "Package"}
      aside={onMoney ? <CardLink onClick={onMoney}>Money</CardLink> : null}
    >
      <ul>
        {active.map((v) => {
          const issued = Math.max(v.entitlement.unitsIssued, v.balance.available, 1);
          const pct = Math.min(100, Math.round((v.balance.available / issued) * 100));
          const soon = expiresWithin30Days(v.entitlement.expiresAt, nowMs);
          return (
            <li key={v.entitlement.id} className={rowClass}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[14.5px] font-bold">
                  {packageName(v.entitlement.packageId)}
                </p>
                <p className="shrink-0 text-[13px] font-semibold">
                  {v.balance.available} of {v.entitlement.unitsIssued} left
                </p>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={issued}
                aria-valuenow={v.balance.available}
                aria-label={`${v.balance.available} of ${v.entitlement.unitsIssued} credits left`}
              >
                <div className="h-full rounded-full bg-ring" style={{ width: `${pct}%` }} />
              </div>
              <p className={cn("mt-1.5 text-xs", soon ? TONE_TEXT.amber : "text-muted-foreground")}>
                {[`Expires ${longDate(v.entitlement.expiresAt, timezone)}`, purchaseLine(v)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </ProfileCard>
  );
}

function AboutRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={cn(rowClass, "grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-3 text-sm")}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children}</dd>
    </div>
  );
}

export function AboutCard({
  client,
  timezone,
  canEdit,
  onEdit,
}: {
  client: Customer;
  timezone: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const prefs = client.contactPreferences;
  const address = client.address ? customerAddressLine(client.address) : "";
  return (
    <ProfileCard title="About" aside={<CardLink onClick={onEdit}>Edit</CardLink>}>
      <dl>
        <AboutRow label="Hears from you by">
          {CHANNEL_LABELS[prefs.preferredChannel]} · reminders{" "}
          {prefs.operationalNotifications ? "on" : "off"}
        </AboutRow>
        <AboutRow label="Marketing">
          {client.marketingConsent.granted
            ? `Yes${client.marketingConsent.updatedAt ? ` · updated ${shortDate(client.marketingConsent.updatedAt, timezone)}` : ""}`
            : "No"}
        </AboutRow>
        <AboutRow label="Portal">{client.userId ? "Signed up" : "Not invited"}</AboutRow>
        {address ? <AboutRow label="Address">{address}</AboutRow> : null}
      </dl>
      <div className={rowClass}>
        <TagChips customerId={client.id} canEdit={canEdit} emptyText="No tags" />
      </div>
    </ProfileCard>
  );
}

export function OverviewTab({
  client,
  timezone,
  nowMs,
  upcoming,
  notes,
  credits,
  staffName,
  locationName,
  packageName,
  purchaseLine,
  money,
  canBook,
  canEdit,
  canMoney,
  highlight,
  onOpenBooking,
  onAllBookings,
  onNewBooking,
  onBookFollowUp,
  onRemind,
  onBookWaitlist,
  onEditWaitlist,
  onAllNotes,
  onMoney,
  onDetails,
}: {
  client: Customer;
  timezone: string;
  nowMs: number;
  upcoming: readonly Booking[];
  notes: readonly CustomerNote[];
  credits: readonly EntitlementView[];
  staffName: (id: string) => string | null;
  locationName: (id: string) => string | null;
  packageName: (packageId: string) => string;
  purchaseLine: (view: EntitlementView) => string | null;
  money: (minor: number, currency: string) => string;
  canBook: boolean;
  canEdit: boolean;
  canMoney: boolean;
  highlight: { id: string } | null;
  onOpenBooking: (id: string) => void;
  onAllBookings: () => void;
  onNewBooking: () => void;
  onBookFollowUp: (f: ServiceFollowUp) => void;
  /** Omitted where reminders aren't offered (non-automotive businesses); hides the card. */
  onRemind?: () => void;
  onBookWaitlist: (e: WaitlistEntry) => void;
  onEditWaitlist: (e: WaitlistEntry) => void;
  onAllNotes: () => void;
  onMoney: () => void;
  onDetails: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-4">
        <ComingUpCard
          upcoming={upcoming}
          firstName={client.firstName}
          timezone={timezone}
          staffName={staffName}
          locationName={locationName}
          money={money}
          onOpenBooking={onOpenBooking}
          onAllBookings={onAllBookings}
          onNewBooking={canBook ? onNewBooking : undefined}
        />
        {onRemind ? (
          <CustomerFollowUpsCard
            customerId={client.id}
            firstName={client.firstName}
            onBook={onBookFollowUp}
            onRemind={onRemind}
            highlight={highlight}
          />
        ) : null}
        <CustomerWaitlistCard
          customerId={client.id}
          onBook={onBookWaitlist}
          onEdit={onEditWaitlist}
        />
      </div>
      <div className="grid min-w-0 gap-4">
        <NotesCard
          customerId={client.id}
          notes={notes}
          timezone={timezone}
          canAdd
          onAllNotes={onAllNotes}
        />
        <PackageCard
          credits={credits}
          packageName={packageName}
          purchaseLine={purchaseLine}
          timezone={timezone}
          nowMs={nowMs}
          onMoney={canMoney ? onMoney : undefined}
        />
        <AboutCard client={client} timezone={timezone} canEdit={canEdit} onEdit={onDetails} />
      </div>
    </div>
  );
}
