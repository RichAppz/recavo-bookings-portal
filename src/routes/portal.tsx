import { useMemo, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  CalendarClock,
  CalendarX,
  FileText,
  LogOut,
  MapPin,
  MessageSquare,
  Receipt,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PersonAvatar, StatusBadge } from "@/components/ui-bits";
import { Wordmark } from "@/components/Wordmark";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useAuth } from "@/lib/auth/auth-store";
import { ApiError } from "@/lib/api";
import {
  usePortalBooking,
  usePortalBookings,
  usePortalConversation,
  usePortalCredits,
  usePortalLinkedRecords,
  usePortalMe,
  usePortalMessages,
  usePortalNotes,
  usePortalPayments,
  usePublicAvailability,
  usePublicLocations,
  usePublicServices,
  useBookWithPortalCredit,
  useCancelPortalBooking,
  useReschedulePortalBooking,
  useSendPortalMessage,
  type PortalCredit,
} from "@/lib/api/hooks";
import type { AvailabilitySlot, Booking } from "@/lib/api/types";
import { formatInTz, formatMoney, isoDate } from "@/lib/format";
import { toast } from "sonner";

const searchSchema = z.object({
  businessId: z.string().optional(),
});

export const Route = createFileRoute("/portal")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "My account — RECAVO" },
      { name: "description", content: "View and manage your upcoming sessions." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <PortalShell />
    </RequireAuth>
  ),
});

function PortalShell() {
  const { businessId } = Route.useSearch();
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-nav text-nav-foreground">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Wordmark compact />
          <span className="text-sm font-medium">My account</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-nav-foreground hover:bg-nav-accent hover:text-nav-foreground"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-5 py-8">
        {!businessId ? (
          <EmptyState
            title="Missing business"
            description="This account link is missing a business id. Please use the link provided by your studio."
          />
        ) : (
          <PortalContent businessId={businessId} />
        )}
      </div>
    </div>
  );
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function PortalContent({ businessId }: { businessId: string }) {
  const [rescheduleTarget, setRescheduleTarget] = useState<Booking | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bookingWithCredit, setBookingWithCredit] = useState(false);

  const me = usePortalMe(businessId);
  const bookings = usePortalBookings(businessId);
  const cancelBooking = useCancelPortalBooking(businessId);

  // A 404 means this account holds no customer link here, which happens when a
  // businessId outlives the person it belonged to — signing in after someone
  // else was signed out of this page returns you to their URL. Send them to the
  // root, which knows where they actually belong.
  if (me.isError && me.error instanceof ApiError && me.error.status === 404) {
    return <Navigate to="/" replace />;
  }

  const now = new Date().toISOString();
  const upcoming = (bookings.data ?? [])
    .filter(
      (b) =>
        b.start >= now &&
        b.status !== "cancelled_by_customer" &&
        b.status !== "cancelled_by_business",
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const past = (bookings.data ?? [])
    .filter((b) => !upcoming.includes(b))
    .sort((a, b) => b.start.localeCompare(a.start));

  return (
    <>
      {me.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your account…</p>
      ) : me.isError ? (
        <EmptyState
          title="Couldn't load your account"
          description="Please sign in again or contact the studio."
        />
      ) : me.data ? (
        <div className="surface-card flex items-center gap-4 p-5">
          <PersonAvatar name={`${me.data.firstName} ${me.data.lastName ?? ""}`} size={56} />
          <div>
            <h1 className="text-lg font-semibold">
              {me.data.firstName} {me.data.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {me.data.emailDisplay ?? me.data.phoneDisplay ?? ""}
            </p>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="bookings">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="more">More</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="space-y-6">
          <CreditsPanel businessId={businessId} onBook={() => setBookingWithCredit(true)} />

          <section className="space-y-3">
            <h2 className="text-base font-semibold">Upcoming sessions</h2>
            {bookings.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading your sessions…</p>
            ) : bookings.isError ? (
              <EmptyState
                title="Couldn't load your bookings"
                description="Please try again shortly."
              />
            ) : upcoming.length === 0 ? (
              <EmptyState
                title="No upcoming sessions"
                description="Book your next session with your studio."
              />
            ) : (
              <ul className="space-y-3">
                {upcoming.map((b) => (
                  <li
                    key={b.id}
                    className="surface-card flex items-center justify-between gap-4 p-4"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setDetailId(b.id)}
                    >
                      <p className="text-sm font-medium">{b.serviceSnapshot.name}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {formatInTz(b.start, b.timezone, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="mt-1 text-xs font-medium">
                        {formatMoney(b.priceMinor, b.currency)}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={b.status} />
                      {b.status === "confirmed" || b.status === "awaiting_payment" ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRescheduleTarget(b)}
                          >
                            <CalendarClock className="size-4" /> Reschedule
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={cancelBooking.isPending}
                              >
                                <CalendarX className="size-4" /> Cancel
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This cancels your {b.serviceSnapshot.name} session on{" "}
                                  {formatInTz(b.start, b.timezone, {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })}
                                  . Your studio's cancellation policy still applies.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Keep booking</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    cancelBooking.mutate(
                                      { bookingId: b.id },
                                      { onSuccess: () => toast.success("Booking cancelled") },
                                    );
                                  }}
                                >
                                  Cancel booking
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Past sessions</h2>
              <ul className="space-y-3">
                {past.slice(0, 10).map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setDetailId(b.id)}
                      className="flex w-full items-center justify-between gap-4 rounded-xl border p-4 text-left text-sm hover:bg-secondary/50"
                    >
                      <div>
                        <p className="font-medium">{b.serviceSnapshot.name}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="size-3.5" />{" "}
                          {formatInTz(b.start, b.timezone, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <StatusBadge status={b.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="messages">
          <MessagesPanel businessId={businessId} />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsPanel businessId={businessId} />
        </TabsContent>

        <TabsContent value="more" className="space-y-6">
          <NotesPanel businessId={businessId} />
          <LinkedRecordsPanel businessId={businessId} />
        </TabsContent>
      </Tabs>

      {bookingWithCredit ? (
        <BookWithCreditDialog
          businessId={businessId}
          onOpenChange={(open) => {
            if (!open) setBookingWithCredit(false);
          }}
        />
      ) : null}

      {rescheduleTarget ? (
        <RescheduleDialog
          businessId={businessId}
          booking={rescheduleTarget}
          onOpenChange={(open) => {
            if (!open) setRescheduleTarget(null);
          }}
        />
      ) : null}

      {detailId ? (
        <BookingDetailDialog
          businessId={businessId}
          bookingId={detailId}
          onOpenChange={(open) => {
            if (!open) setDetailId(null);
          }}
          onReschedule={(booking) => {
            setDetailId(null);
            setRescheduleTarget(booking);
          }}
        />
      ) : null}
    </>
  );
}

/** Credits with sessions left on them that haven't lapsed — the only ones worth showing. */
function usableCredits(credits: PortalCredit[] | undefined): PortalCredit[] {
  const now = Date.now();
  return (credits ?? [])
    .filter((c) => c.status === "active" && c.available > 0 && Date.parse(c.expiresAt) > now)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

function sessionCount(n: number): string {
  return `${n} ${n === 1 ? "session" : "sessions"}`;
}

function CreditsPanel({ businessId, onBook }: { businessId: string; onBook: () => void }) {
  const credits = usePortalCredits(businessId);
  const usable = usableCredits(credits.data);

  // Nothing to say to a customer who has never bought a package, so stay out of the way.
  if (credits.isLoading || credits.isError || usable.length === 0) return null;

  const total = usable.reduce((sum, c) => sum + c.available, 0);
  // Soonest to lapse, which is also the one the next booking will spend.
  const nextToExpire = usable[0];

  return (
    <section className="surface-card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{sessionCount(total)} prepaid</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {usable.length === 1
              ? `Use ${nextToExpire.available === 1 ? "it" : "them"} before ${formatInTz(
                  nextToExpire.expiresAt,
                  "Europe/London",
                  { dateStyle: "medium" },
                )}.`
              : `Your next ${sessionCount(nextToExpire.available)} expire ${formatInTz(
                  nextToExpire.expiresAt,
                  "Europe/London",
                  { dateStyle: "medium" },
                )}.`}
          </p>
        </div>
        <Button size="sm" onClick={onBook}>
          <CalendarClock className="size-4" /> Book a session
        </Button>
      </div>

      {usable.length > 1 ? (
        <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
          {usable.map((c) => (
            <li key={c.id} className="flex justify-between gap-3">
              <span>{sessionCount(c.available)} left</span>
              <span className="tabular-nums">
                expires {formatInTz(c.expiresAt, "Europe/London", { dateStyle: "medium" })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function BookWithCreditDialog({
  businessId,
  onOpenChange,
}: {
  businessId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const credits = usePortalCredits(businessId);
  const services = usePublicServices(businessId);
  const locations = usePublicLocations(businessId);
  const book = useBookWithPortalCredit(businessId);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [date, setDate] = useState(isoDate(addDays(new Date(), 1)));
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);

  // A credit is only spendable on the services its package covers, so offering anything
  // else would just fail at submit. An entitlement with no restriction covers everything.
  const bookable = useMemo(() => {
    const usable = usableCredits(credits.data);
    if (usable.length === 0) return [];
    const unrestricted = usable.some((c) => c.eligibleServiceIds.length === 0);
    if (unrestricted) return services.data ?? [];
    const allowed = new Set(usable.flatMap((c) => c.eligibleServiceIds));
    return (services.data ?? []).filter((s) => allowed.has(s.id));
  }, [credits.data, services.data]);

  const activeService = bookable.length === 1 ? bookable[0].id : serviceId;
  const locationList = locations.data ?? [];
  const activeLocation = locationList.length === 1 ? locationList[0].id : locationId;

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const availability = usePublicAvailability(businessId, {
    serviceId: activeService ?? undefined,
    locationId: activeLocation ?? undefined,
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
    enabled: Boolean(activeService && activeLocation),
  });

  const slots = useMemo(
    () => (availability.data ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );

  const submit = () => {
    if (!selectedSlot) return;
    book.mutate(
      { slotToken: selectedSlot.slotToken },
      {
        onSuccess: () => {
          toast.success("Session booked", { description: "One credit has been used." });
          onOpenChange(false);
        },
        onError: (err) => {
          if (err instanceof ApiError && (err.code === "BOOKING_CONFLICT" || err.isConflict)) {
            toast.error("That time was just taken — please choose another.");
            setSelectedSlot(null);
            void availability.refetch();
          }
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book with a credit</DialogTitle>
        </DialogHeader>

        {bookable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {services.isLoading
              ? "Loading…"
              : "Your credits don't cover any of the sessions available to book online. Please contact the studio."}
          </p>
        ) : (
          <div className="space-y-4">
            {bookable.length > 1 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Session</p>
                <div className="grid gap-2">
                  {bookable.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setServiceId(s.id);
                        setSelectedSlot(null);
                      }}
                      className={`rounded-xl border p-3 text-left text-sm ${
                        s.id === activeService
                          ? "border-primary bg-primary-soft text-primary"
                          : "hover:bg-secondary"
                      }`}
                    >
                      <span className="block font-medium">{s.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {s.durationMinutes} minutes
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {locationList.length > 1 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Location</p>
                <div className="grid gap-2">
                  {locationList.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setLocationId(l.id);
                        setSelectedSlot(null);
                      }}
                      className={`rounded-xl border p-3 text-left text-sm ${
                        l.id === activeLocation
                          ? "border-primary bg-primary-soft text-primary"
                          : "hover:bg-secondary"
                      }`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeService && activeLocation ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 8 }, (_, i) => isoDate(addDays(new Date(), i + 1))).map(
                    (d) => {
                      const dt = new Date(`${d}T00:00:00Z`);
                      const selected = d === date;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            setDate(d);
                            setSelectedSlot(null);
                          }}
                          className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center text-xs ${
                            selected
                              ? "border-primary bg-primary-soft text-primary"
                              : "hover:bg-secondary"
                          }`}
                        >
                          <span className="text-muted-foreground">
                            {dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {dt.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>

                {availability.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading available times…</p>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No availability on this date.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((s) => (
                      <button
                        key={`${s.start}-${s.staffId}`}
                        type="button"
                        onClick={() => setSelectedSlot(s)}
                        className={`rounded-xl border py-2 text-sm tabular-nums ${
                          s.start === selectedSlot?.start && s.staffId === selectedSlot?.staffId
                            ? "border-primary bg-primary-soft text-primary"
                            : "hover:bg-secondary"
                        }`}
                      >
                        {formatInTz(s.start, s.displayTimezone, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Choose a session{locationList.length > 1 ? " and location" : ""} to see available
                times.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!selectedSlot || book.isPending} onClick={submit}>
            {book.isPending ? "Booking…" : "Book with 1 credit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookingDetailDialog({
  businessId,
  bookingId,
  onOpenChange,
  onReschedule,
}: {
  businessId: string;
  bookingId: string;
  onOpenChange: (open: boolean) => void;
  onReschedule: (booking: Booking) => void;
}) {
  const detail = usePortalBooking(businessId, bookingId);
  const cancelBooking = useCancelPortalBooking(businessId);
  const booking = detail.data;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{booking?.serviceSnapshot.name ?? "Booking details"}</DialogTitle>
        </DialogHeader>
        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : detail.isError || !booking ? (
          <EmptyState title="Couldn't load this booking" description="Please try again shortly." />
        ) : (
          <dl className="space-y-2 text-sm">
            {[
              ["Reference", booking.reference],
              [
                "When",
                formatInTz(booking.start, booking.timezone, {
                  dateStyle: "full",
                  timeStyle: "short",
                }),
              ],
              ["Status", booking.status.replace(/_/g, " ")],
              ["Total", formatMoney(booking.priceMinor, booking.currency)],
              ["Notes", booking.notesCustomer || "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium capitalize">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {booking && (booking.status === "confirmed" || booking.status === "awaiting_payment") ? (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => onReschedule(booking)}>
              <CalendarClock className="size-4" /> Reschedule
            </Button>
            <Button
              variant="destructive"
              disabled={cancelBooking.isPending}
              onClick={() =>
                cancelBooking.mutate(
                  { bookingId: booking.id },
                  {
                    onSuccess: () => {
                      toast.success("Booking cancelled");
                      onOpenChange(false);
                    },
                  },
                )
              }
            >
              <CalendarX className="size-4" /> Cancel
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MessagesPanel({ businessId }: { businessId: string }) {
  const conversation = usePortalConversation(businessId);
  const messages = usePortalMessages(businessId);
  const sendMessage = useSendPortalMessage(businessId);
  const [draft, setDraft] = useState("");

  const sorted = useMemo(
    () => (messages.data ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages.data],
  );

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    sendMessage.mutate(body);
  };

  return (
    <div className="surface-card flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="size-4" /> Messages
        {conversation.data?.lastMessageAt ? (
          <span className="text-xs font-normal text-muted-foreground">
            Last reply{" "}
            {formatInTz(conversation.data.lastMessageAt, "Europe/London", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        ) : null}
      </div>

      {messages.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading messages…</p>
      ) : messages.isError ? (
        <EmptyState title="Couldn't load messages" description="Please try again shortly." />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description="Send a message and your studio will get back to you here."
        />
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {sorted.map((m) => (
            <li
              key={m.id}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                m.senderType === "customer"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-secondary"
              } ${m.id.startsWith("optimistic-") ? "opacity-70" : ""}`}
            >
              <p>{m.body}</p>
              <p
                className={`mt-1 text-[11px] ${
                  m.senderType === "customer"
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground"
                }`}
              >
                {formatInTz(m.createdAt, "Europe/London", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          className="min-h-[44px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button onClick={send} disabled={!draft.trim()}>
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function PaymentsPanel({ businessId }: { businessId: string }) {
  const payments = usePortalPayments(businessId);
  const sorted = useMemo(
    () => (payments.data ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [payments.data],
  );

  return (
    <div className="surface-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Receipt className="size-4" /> Payments
      </div>
      {payments.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading payments…</p>
      ) : payments.isError ? (
        <EmptyState title="Couldn't load payments" description="Please try again shortly." />
      ) : sorted.length === 0 ? (
        <EmptyState title="No payments yet" description="Your payment history will appear here." />
      ) : (
        <ul className="divide-y">
          {sorted.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">{formatMoney(p.amountMinor, p.currency)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatInTz(p.createdAt, "Europe/London", { dateStyle: "medium" })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={p.state} />
                {p.receiptUrl ? (
                  <a
                    href={p.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Receipt
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesPanel({ businessId }: { businessId: string }) {
  const notes = usePortalNotes(businessId);
  if (notes.isLoading || (notes.data ?? []).length === 0) {
    return (
      <div className="surface-card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4" /> Notes from your studio
        </div>
        {notes.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading notes…</p>
        ) : (
          <EmptyState title="No notes yet" description="Notes shared with you will appear here." />
        )}
      </div>
    );
  }
  return (
    <div className="surface-card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <FileText className="size-4" /> Notes from your studio
      </div>
      <ul className="space-y-3">
        {notes.data!.map((n) => (
          <li key={n.id} className="rounded-xl border p-3 text-sm">
            <p>{n.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatInTz(n.createdAt, "Europe/London", { dateStyle: "medium" })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkedRecordsPanel({ businessId }: { businessId: string }) {
  const records = usePortalLinkedRecords(businessId);
  if ((records.data ?? []).length === 0 && !records.isLoading) return null;
  return (
    <div className="surface-card p-5">
      <div className="mb-3 text-sm font-semibold">Your records</div>
      {records.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {records.data!.map((r) => (
            <li key={r.id} className="rounded-xl border p-3 text-sm">
              <p className="font-medium">{r.displayLabel}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RescheduleDialog({
  businessId,
  booking,
  onOpenChange,
}: {
  businessId: string;
  booking: Booking;
  onOpenChange: (open: boolean) => void;
}) {
  const [date, setDate] = useState(isoDate(addDays(new Date(), 1)));
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const reschedule = useReschedulePortalBooking(businessId);

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const availability = usePublicAvailability(businessId, {
    serviceId: booking.serviceSnapshot.serviceId,
    locationId: booking.locationId,
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
  });

  const slots = useMemo(
    () => (availability.data ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );

  const submit = () => {
    if (!selectedSlot) return;
    reschedule.mutate(
      { bookingId: booking.id, slotToken: selectedSlot.slotToken },
      {
        onSuccess: () => {
          toast.success("Booking rescheduled");
          onOpenChange(false);
        },
        onError: (err) => {
          if (err instanceof ApiError && (err.code === "BOOKING_CONFLICT" || err.isConflict)) {
            toast.error("That time was just taken — please choose another.");
            setSelectedSlot(null);
            void availability.refetch();
            return;
          }
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule {booking.serviceSnapshot.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => isoDate(addDays(new Date(), i + 1))).map((d) => {
            const dt = new Date(`${d}T00:00:00Z`);
            const selected = d === date;
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDate(d);
                  setSelectedSlot(null);
                }}
                className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center text-xs ${
                  selected ? "border-primary bg-primary-soft text-primary" : "hover:bg-secondary"
                }`}
              >
                <span className="text-muted-foreground">
                  {dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                </span>
                <span className="font-semibold tabular-nums">
                  {dt.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}
                </span>
              </button>
            );
          })}
        </div>

        {availability.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading available times…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No availability on this date.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => (
              <button
                key={`${s.start}-${s.staffId}`}
                onClick={() => setSelectedSlot(s)}
                className={`rounded-xl border py-2 text-sm tabular-nums ${
                  s.start === selectedSlot?.start && s.staffId === selectedSlot?.staffId
                    ? "border-primary bg-primary-soft text-primary"
                    : "hover:bg-secondary"
                }`}
              >
                {formatInTz(s.start, s.displayTimezone, { hour: "2-digit", minute: "2-digit" })}
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            className="w-full"
            disabled={!selectedSlot || reschedule.isPending}
            onClick={submit}
          >
            {reschedule.isPending ? "Rescheduling…" : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
