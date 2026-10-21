import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, MessageSquare, Phone, TriangleAlert } from "lucide-react";
import { TonePill } from "@/components/client-profile/parts";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsPhone } from "@/hooks/use-media-query";
import { useWaitlistEntry, useWaitlistFreeTimes } from "@/lib/api/hooks";
import type { WaitlistEntry, WaitlistFreeTime } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-store";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import {
  WEEKDAYS,
  customerName,
  displayPhone,
  firstName,
  headerLine,
  historyText,
  shortDate,
  timeOfDayPhrase,
  windowPassed,
  windowPhrase,
} from "@/lib/waitlist";
import { WaitlistMenu } from "@/components/waitlist/actions";
import {
  useOpenClientConversation,
  usePutBackOnWaitlist,
} from "@/components/waitlist/use-waitlist-actions";
import { AMBER_TEXT, MINT_TINT, WaitlistAvatar } from "@/components/waitlist/parts";

export type VehicleInfo = { plate: string | null; title: string };

function inZone(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...opts }).format(new Date(iso));
}

/** "Sat 25 Oct · 09:00". */
function freeTimeLabel(t: WaitlistFreeTime): string {
  const day = inZone(t.start, t.timezone, { weekday: "short", day: "numeric", month: "short" });
  const time = inZone(t.start, t.timezone, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day.replace(",", "")} · ${time}`;
}

/**
 * Click a row: who they are and how to reach them, free times that suit, what they
 * want and when, notes and history. Right drawer on desktop, bottom sheet on phone.
 */
export function WaitlistEntryPanel({
  entryId,
  initial,
  todayIso,
  vehicleOf,
  canAct,
  onClose,
  onEdit,
  onBook,
  onOpenBooking,
}: {
  entryId: string | null;
  /** The row the list already has, shown while the full entry loads. */
  initial?: WaitlistEntry | null;
  todayIso: string;
  vehicleOf: (entry: WaitlistEntry) => VehicleInfo | undefined;
  canAct: boolean;
  onClose: () => void;
  onEdit: (entry: WaitlistEntry) => void;
  /** Book them in: with a free time chosen, or as the row's Book. */
  onBook: (entry: WaitlistEntry, time?: WaitlistFreeTime) => void;
  onOpenBooking: (bookingId: string) => void;
}) {
  const phone = useIsPhone();
  const loaded = useWaitlistEntry(entryId ?? undefined);
  const entry = loaded.data ?? (initial && initial.id === entryId ? initial : null);

  return (
    <Sheet open={entryId !== null} onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "top-[70px] rounded-t-3xl" : "sm:max-w-[480px]",
        )}
      >
        {phone ? (
          <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
        ) : null}
        {entry ? (
          <PanelBody
            entry={entry}
            history={loaded.data?.history}
            historyLoading={loaded.isLoading}
            todayIso={todayIso}
            vehicle={vehicleOf(entry)}
            canAct={canAct}
            onClose={onClose}
            onEdit={onEdit}
            onBook={onBook}
            onOpenBooking={onOpenBooking}
          />
        ) : (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 text-left">
              <SheetTitle>
                <Skeleton className="h-6 w-40" />
              </SheetTitle>
              <SheetDescription className="sr-only">Loading the waitlist entry</SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 px-6">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  entry,
  history,
  historyLoading,
  todayIso,
  vehicle,
  canAct,
  onClose,
  onEdit,
  onBook,
  onOpenBooking,
}: {
  entry: WaitlistEntry;
  history: WaitlistEntry["history"];
  historyLoading: boolean;
  todayIso: string;
  vehicle: VehicleInfo | undefined;
  canAct: boolean;
  onClose: () => void;
  onEdit: (entry: WaitlistEntry) => void;
  onBook: (entry: WaitlistEntry, time?: WaitlistFreeTime) => void;
  onOpenBooking: (bookingId: string) => void;
}) {
  const tenant = useTenant();
  const myUserId = useAuth().user?.id;
  const conversation = useOpenClientConversation();
  const { putBack, isPending: puttingBack } = usePutBackOnWaitlist();
  const waiting = entry.status === "waiting";
  // Only windows that could start in the next 60 days get a free-times lookup.
  const lookAhead = (() => {
    const d = new Date(`${todayIso}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 60);
    return d.toISOString().slice(0, 10);
  })();
  const passed = windowPassed(entry.preferences, todayIso);
  const showFree =
    waiting && !passed && (!entry.preferences.from || entry.preferences.from <= lookAhead);
  const free = useWaitlistFreeTimes(entry.id, showFree);
  const recordTerm = tenant.terminology.linkedRecord;
  const serviceNoun = tenant.terminology.service.replace(/\s+type$/i, "").trim() || "Service";
  const c = entry.customer;
  const name = customerName(entry);
  const days = entry.preferences.days;

  return (
    <>
      <SheetHeader className="border-b px-6 pt-6 pb-4 text-left">
        <div className="flex items-center gap-3 pr-8">
          <WaitlistAvatar entry={entry} size={38} />
          <div className="grid min-w-0 gap-0.5">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-xl font-extrabold">
              <span className="truncate">{name}</span>
              {entry.priority === "high" ? <TonePill tone="amber">High priority</TonePill> : null}
              {entry.status === "cancelled" ? <TonePill tone="grey">Removed</TonePill> : null}
              {entry.status === "expired" ? <TonePill tone="grey">Expired</TonePill> : null}
              {entry.status === "booked" ? <TonePill tone="green">Booked</TonePill> : null}
            </SheetTitle>
            <SheetDescription className="text-[13px]">
              {headerLine(entry, myUserId)}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 py-5">
        <section aria-label="Contact" className="grid gap-2">
          <div className="grid grid-cols-3 gap-2">
            <ContactButton
              label="Call"
              icon={<Phone className="size-4" />}
              href={c?.phone ? `tel:${c.phone}` : undefined}
              missing="No phone number"
            />
            <ContactButton
              label="Text"
              icon={<MessageSquare className="size-4" />}
              onClick={c?.phone ? () => conversation.openFor(entry.customerId) : undefined}
              missing="No phone number"
            />
            <ContactButton
              label="Email"
              icon={<Mail className="size-4" />}
              onClick={c?.email ? () => conversation.openFor(entry.customerId) : undefined}
              missing="No email address"
            />
          </div>
          <p className="truncate text-[12.5px] text-muted-foreground">
            {[displayPhone(c?.phone), c?.email].filter(Boolean).join(" · ") || "No contact details"}
          </p>
        </section>

        {showFree ? (
          <section
            aria-labelledby="wl-free"
            className={cn("grid gap-2 rounded-[14px] px-4 py-3", MINT_TINT)}
          >
            <h3 id="wl-free" className="text-[13px] font-extrabold">
              Free times that fit
            </h3>
            {free.isLoading ? (
              <div className="grid gap-2">
                <Skeleton className="h-10 w-full bg-white/50" />
                <Skeleton className="h-10 w-full bg-white/50" />
              </div>
            ) : (free.data?.times.length ?? 0) === 0 ? (
              <p className="text-[13px] text-foreground/80">
                No free times in their window right now. We&rsquo;ll show them here when one frees.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {free.data!.times.map((t) => (
                  <li
                    key={`${t.start}:${t.staff?.id ?? ""}`}
                    className="flex items-center gap-3 rounded-xl bg-background/70 px-3 py-2 text-foreground"
                  >
                    <span className="grid min-w-0 flex-1">
                      <span className="text-sm font-bold">{freeTimeLabel(t)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {t.freedByCancellation ? "Freed by a cancellation" : "Free"} · with{" "}
                        {t.staff?.displayName ?? "Anyone"}
                      </span>
                    </span>
                    {canAct ? (
                      <Button size="sm" className="shrink-0" onClick={() => onBook(entry, t)}>
                        Book this
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section aria-labelledby="wl-wants" className="grid gap-2">
          <h3 id="wl-wants" className="text-[13px] font-extrabold">
            Wants
          </h3>
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{serviceNoun}</dt>
            <dd className="font-semibold">
              {entry.service?.name ?? serviceNoun}
              {entry.variant ? ` · ${entry.variant.name}` : ""}
            </dd>
            {entry.linkedRecord || vehicle ? (
              <>
                <dt className="text-muted-foreground">{recordTerm}</dt>
                <dd className="flex min-w-0 items-center gap-1.5">
                  {vehicle?.plate ? (
                    <NumberPlate registration={vehicle.plate} size="small" />
                  ) : null}
                  <span className="truncate">{vehicle?.title ?? entry.linkedRecord?.label}</span>
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Where</dt>
            <dd>{entry.location?.name ?? "Anywhere"}</dd>
            <dt className="text-muted-foreground">With</dt>
            <dd>{entry.staff?.displayName ?? "Anyone"}</dd>
          </dl>
        </section>

        <section aria-labelledby="wl-when" className="grid gap-2">
          <h3 id="wl-when" className="text-[13px] font-extrabold">
            When
          </h3>
          <p className={cn("text-[15px] font-bold", passed && AMBER_TEXT)}>
            {windowPhrase(entry.preferences)}
            {passed ? " · passed" : ""}
          </p>
          <div className="grid grid-cols-7 gap-1" aria-label="Days they can do">
            {WEEKDAYS.map((d) => {
              const on = !days || days.length === 0 || days.includes(d.value);
              return (
                <span
                  key={d.value}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg text-xs font-bold",
                    on
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  <span aria-hidden>{d.short}</span>
                  <span className="sr-only">
                    {d.long}: {on ? "yes" : "no"}
                  </span>
                </span>
              );
            })}
          </div>
          <p className="text-[13px] text-muted-foreground">{timeOfDayPhrase(entry.preferences)}</p>
          {passed && entry.preferences.to ? (
            <p className={cn("flex items-start gap-2 text-[13px] font-semibold", AMBER_TEXT)}>
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              This window passed on {shortDate(entry.preferences.to)}. Edit the dates or remove
              them.
            </p>
          ) : null}
        </section>

        {entry.notes ? (
          <section aria-labelledby="wl-notes" className="grid gap-1.5">
            <h3 id="wl-notes" className="text-[13px] font-extrabold">
              Notes
            </h3>
            <p className="rounded-xl bg-secondary/60 px-3 py-2.5 text-sm whitespace-pre-wrap">
              {entry.notes}
            </p>
          </section>
        ) : null}

        <section aria-labelledby="wl-history" className="grid gap-2">
          <h3 id="wl-history" className="text-[13px] font-extrabold">
            History
          </h3>
          {historyLoading && !history ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <ol className="grid gap-2">
              {(history ?? []).map((h) => (
                <li key={h.id} className="flex items-baseline gap-2.5 text-[13px]">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-ring" />
                  <span className="min-w-0 flex-1">
                    {historyText(h, { recordLabel: recordTerm, myUserId })}
                    {h.kind === "booked" && (h.bookingId ?? entry.bookingId) ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="cursor-pointer font-semibold text-primary hover:underline"
                          onClick={() => onOpenBooking((h.bookingId ?? entry.bookingId)!)}
                        >
                          {entry.booking?.reference ?? "Open booking"}
                        </button>
                      </>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {shortDate(h.createdAt.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <footer className="flex items-center gap-2 border-t px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
        {waiting ? (
          canAct ? (
            <>
              <Button variant="outline" className="max-sm:h-12" onClick={() => onEdit(entry)}>
                Edit
              </Button>
              <WaitlistMenu
                entry={entry}
                canAct={canAct}
                onRemoved={onClose}
                triggerClassName="size-9 max-sm:size-12"
              />
              <Button className="ml-auto max-sm:h-12 max-sm:flex-1" onClick={() => onBook(entry)}>
                Book {firstName(entry)}
              </Button>
            </>
          ) : c?.phone ? (
            <Button asChild className="ml-auto max-sm:h-12 max-sm:flex-1">
              <a href={`tel:${c.phone}`}>
                <Phone className="size-4" /> Call
              </a>
            </Button>
          ) : (
            <Button asChild variant="outline" className="ml-auto">
              <Link to="/clients/$clientId" params={{ clientId: entry.customerId }}>
                View client
              </Link>
            </Button>
          )
        ) : (
          <>
            {entry.status === "booked" && entry.bookingId ? (
              <Button
                variant="outline"
                className="max-sm:h-12"
                onClick={() => onOpenBooking(entry.bookingId!)}
              >
                Open booking
              </Button>
            ) : null}
            {canAct ? (
              <Button
                className="ml-auto max-sm:h-12 max-sm:flex-1"
                disabled={puttingBack}
                onClick={() => void putBack(entry)}
              >
                Put back on the waitlist
              </Button>
            ) : null}
          </>
        )}
      </footer>
    </>
  );
}

function ContactButton({
  label,
  icon,
  href,
  onClick,
  missing,
}: {
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  missing: string;
}) {
  const className = "h-11 gap-1.5 font-semibold";
  if (href) {
    return (
      <Button asChild variant="outline" className={className}>
        <a href={href}>
          {icon} {label}
        </a>
      </Button>
    );
  }
  if (onClick) {
    return (
      <Button variant="outline" className={className} onClick={onClick}>
        {icon} {label}
      </Button>
    );
  }
  return (
    <span title={missing} className="grid">
      <Button variant="outline" className={className} disabled aria-label={`${label}: ${missing}`}>
        {icon} {label}
      </Button>
    </span>
  );
}
