import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft, Check, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Wordmark } from "@/components/Wordmark";
import { ApiError } from "@/lib/api";
import {
  useConfirmPublicBooking,
  useCreatePublicBookingHold,
  usePublicAvailability,
  usePublicLocations,
  usePublicServices,
} from "@/lib/api/hooks";
import type { AvailabilitySlot, Booking } from "@/lib/api/types";
import { formatInTz, formatMoney, isoDate } from "@/lib/format";
import { toast } from "sonner";

const searchSchema = z.object({
  businessId: z.string().optional(),
});

export const Route = createFileRoute("/book")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Book a session — RECAVO" },
      {
        name: "description",
        content:
          "Book a session online in a couple of minutes — choose a service, time and pay securely.",
      },
      { property: "og:title", content: "Book a session — RECAVO" },
      {
        property: "og:description",
        content: "Choose a service and time, then confirm your booking.",
      },
    ],
  }),
  component: BookingJourney,
});

const STEPS = ["Service", "Location", "Time", "Details", "Review", "Confirmed"];
const HOLD_WARNING_SECONDS = 60;

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function BookingJourney() {
  const { businessId } = Route.useSearch();

  if (!businessId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">Missing business</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This booking link is missing a business id. Please use the link provided by your studio.
          </p>
        </div>
      </main>
    );
  }

  return <BookingFlow businessId={businessId} />;
}

/** Live mm:ss countdown to an ISO instant; fires `onExpire` once when it lapses. */
function useCountdown(targetIso: string | null, onExpire: () => void) {
  const [msLeft, setMsLeft] = useState<number | null>(
    targetIso ? new Date(targetIso).getTime() - Date.now() : null,
  );
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    if (!targetIso) {
      setMsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = new Date(targetIso).getTime() - Date.now();
      setMsLeft(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIso]);

  return msLeft;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Hold = { booking: Booking; holdToken: string };

function BookingFlow({ businessId }: { businessId: string }) {
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [date, setDate] = useState(isoDate(addDays(new Date(), 1)));
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [hold, setHold] = useState<Hold | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  const services = usePublicServices(businessId);
  const locations = usePublicLocations(businessId);

  const service = services.data?.find((s) => s.id === serviceId) ?? null;
  const location = locations.data?.find((l) => l.id === locationId) ?? null;

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const availability = usePublicAvailability(businessId, {
    serviceId: serviceId ?? undefined,
    locationId: locationId ?? undefined,
    from: dayStart.toISOString(),
    to: dayEnd.toISOString(),
    enabled: step === 2,
  });

  const slots = useMemo(
    () => (availability.data ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)),
    [availability.data],
  );

  const reselect = (message: string) => {
    toast.error(message);
    setHold(null);
    setSelectedSlot(null);
    setStep(2);
    void availability.refetch();
  };

  const holdMutation = useCreatePublicBookingHold(businessId);
  const confirmMutation = useConfirmPublicBooking(businessId);

  const msLeft = useCountdown(hold?.booking.holdExpiresAt ?? null, () =>
    reselect("Your held time has expired — please choose a new time."),
  );

  const submitDetails = () => {
    if (!selectedSlot) return;
    setFieldErrors({});
    holdMutation.mutate(
      {
        slotToken: selectedSlot.slotToken,
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        notesCustomer: notes.trim() || null,
        marketingConsent,
      },
      {
        onSuccess: ({ booking, holdToken }) => {
          setHold({ booking, holdToken });
          setStep(4);
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.code === "BOOKING_CONFLICT" || err.isConflict) {
              reselect("That time was just taken — please choose another.");
              return;
            }
            if (err.fieldErrors.length > 0) {
              const next: Record<string, string> = {};
              for (const fe of err.fieldErrors) {
                if (fe.field) next[fe.field] = fe.message || fe.code || "Invalid";
              }
              setFieldErrors(next);
              toast.error(err.title || "Please check your details");
              return;
            }
          }
          toast.error(err instanceof ApiError ? err.title : "Something went wrong");
        },
      },
    );
  };

  const submitConfirm = () => {
    if (!hold) return;
    confirmMutation.mutate(
      { bookingId: hold.booking.id, holdToken: hold.holdToken },
      {
        onSuccess: (booking) => {
          setConfirmedBooking(booking);
          setStep(5);
        },
        onError: (err) => {
          if (err instanceof ApiError && (err.code === "BOOKING_CONFLICT" || err.isConflict)) {
            reselect("That time is no longer available — please choose another.");
            return;
          }
          toast.error(err instanceof ApiError ? err.title : "Something went wrong");
        },
      },
    );
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-nav text-nav-foreground">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Wordmark />
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        <ol className="flex flex-wrap items-center gap-2 text-xs">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary-soft text-primary"
                    : "bg-secondary text-muted-foreground"
              }`}
            >
              {i < step ? (
                <Check className="size-3.5" />
              ) : (
                <span className="tabular-nums">{i + 1}</span>
              )}
              {s}
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <section className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">Choose a session</h1>
            {services.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading services…</p>
            ) : services.isError ? (
              <p className="text-sm text-destructive">
                Couldn't load services. Please try again shortly.
              </p>
            ) : (services.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bookable services are available right now.
              </p>
            ) : (
              (services.data ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setServiceId(s.id);
                    setSelectedSlot(null);
                    setStep(1);
                  }}
                  className="surface-card flex w-full items-center justify-between gap-4 p-5 text-left transition-shadow hover:shadow-lg"
                >
                  <span>
                    <span className="block font-medium">{s.name}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {s.description}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {s.durationMinutes} minutes
                      {s.capacityMax > 1 ? ` · up to ${s.capacityMax} people` : ""}
                    </span>
                  </span>
                  <span className="text-lg font-semibold whitespace-nowrap">
                    {formatMoney(s.basePriceMinor, s.currency)}
                  </span>
                </button>
              ))
            )}
          </section>
        ) : null}

        {step === 1 ? (
          <section className="space-y-3">
            <Back onClick={() => setStep(0)} />
            <h1 className="text-2xl font-semibold tracking-tight">Pick a location</h1>
            {locations.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading locations…</p>
            ) : (locations.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No locations are available right now.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(locations.data ?? []).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setLocationId(l.id)}
                    className={`surface-card p-4 text-left ${l.id === locationId ? "ring-2 ring-primary" : ""}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <MapPin className="size-4" />
                      {l.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{l.timezone}</span>
                  </button>
                ))}
              </div>
            )}
            <Button className="w-full" disabled={!locationId} onClick={() => setStep(2)}>
              Continue
            </Button>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <Back onClick={() => setStep(1)} />
            <h1 className="text-2xl font-semibold tracking-tight">Choose a date and time</h1>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {Array.from({ length: 14 }, (_, i) => isoDate(addDays(new Date(), i + 1))).map(
                (d) => {
                  const dt = new Date(`${d}T00:00:00Z`);
                  const weekday = dt.toLocaleDateString("en-GB", {
                    weekday: "short",
                    timeZone: "UTC",
                  });
                  const dayNum = dt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    timeZone: "UTC",
                  });
                  const month = dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
                  const selected = d === date;
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setDate(d);
                        setSelectedSlot(null);
                      }}
                      className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-3 text-center transition ${
                        selected
                          ? "border-primary bg-primary-soft text-primary"
                          : "bg-card hover:bg-secondary"
                      }`}
                    >
                      <span className="text-xs text-muted-foreground">{weekday}</span>
                      <span className="text-base font-semibold tabular-nums">{dayNum}</span>
                      <span className="text-xs text-muted-foreground">{month}</span>
                    </button>
                  );
                },
              )}
            </div>

            {availability.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading available times…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No availability on this date. Try another day.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((s) => (
                    <button
                      key={`${s.start}-${s.staffId}`}
                      onClick={() => setSelectedSlot(s)}
                      className={`rounded-xl border py-2.5 text-sm tabular-nums ${
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
                <p className="text-xs text-muted-foreground">
                  Times shown in {slots[0]?.displayTimezone}.
                </p>
              </>
            )}
            <Button className="w-full" disabled={!selectedSlot} onClick={() => setStep(3)}>
              Continue
            </Button>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <Back onClick={() => setStep(2)} />
            <h1 className="text-2xl font-semibold tracking-tight">Your details</h1>
            <div className="surface-card space-y-3 p-5">
              <div className="grid gap-2">
                <Label htmlFor="b-name">First name</Label>
                <Input
                  id="b-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jamie"
                  aria-invalid={Boolean(fieldErrors.firstName)}
                />
                {fieldErrors.firstName ? (
                  <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="b-lname">Last name</Label>
                <Input
                  id="b-lname"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Ellis"
                  aria-invalid={Boolean(fieldErrors.lastName)}
                />
                {fieldErrors.lastName ? (
                  <p className="text-xs text-destructive">{fieldErrors.lastName}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="b-email">Email</Label>
                <Input
                  id="b-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jamie@example.co.uk"
                  aria-invalid={Boolean(fieldErrors.email)}
                />
                {fieldErrors.email ? (
                  <p className="text-xs text-destructive">{fieldErrors.email}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="b-phone">Mobile</Label>
                <Input
                  id="b-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07700 900000"
                  aria-invalid={Boolean(fieldErrors.phone)}
                />
                {fieldErrors.phone ? (
                  <p className="text-xs text-destructive">{fieldErrors.phone}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="b-notes">Anything we should know?</Label>
                <Textarea
                  id="b-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <label className="flex items-start gap-2.5 pt-1 text-sm">
                <Checkbox
                  checked={marketingConsent}
                  onCheckedChange={(v) => setMarketingConsent(v === true)}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  Keep me updated with offers and news from this studio. You can opt out anytime.
                </span>
              </label>
            </div>
            {service && selectedSlot && location ? (
              <Summary
                serviceName={service.name}
                locationName={location.name}
                start={selectedSlot.start}
                timezone={selectedSlot.displayTimezone}
                price={formatMoney(selectedSlot.priceMinor, selectedSlot.currency)}
              />
            ) : null}
            <Button
              className="w-full"
              disabled={!firstName.trim() || holdMutation.isPending}
              onClick={submitDetails}
            >
              {holdMutation.isPending ? "Holding your slot…" : "Continue"}
            </Button>
          </section>
        ) : null}

        {step === 4 && hold ? (
          <section className="space-y-4">
            <button
              onClick={() => reselect("Your hold was released — please choose a new time.")}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Change time
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">Review &amp; confirm</h1>
            {msLeft !== null ? (
              <div
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                  msLeft < HOLD_WARNING_SECONDS * 1000
                    ? "border-destructive/40 bg-destructive-soft text-destructive"
                    : "border-warning/40 bg-warning-soft text-warning-foreground"
                }`}
              >
                <Clock className="size-4 shrink-0" />
                We're holding this time for you — complete your booking within{" "}
                <span className="font-semibold tabular-nums">{formatCountdown(msLeft)}</span>.
              </div>
            ) : null}
            {service && location ? (
              <Summary
                serviceName={service.name}
                locationName={location.name}
                start={hold.booking.start}
                timezone={hold.booking.timezone}
                price={formatMoney(hold.booking.priceMinor, hold.booking.currency)}
              />
            ) : null}
            <Button
              className="w-full"
              disabled={confirmMutation.isPending || (msLeft ?? 0) <= 0}
              onClick={submitConfirm}
            >
              {confirmMutation.isPending ? "Confirming…" : "Confirm booking"}
            </Button>
          </section>
        ) : null}

        {step === 5 && confirmedBooking ? (
          <section className="space-y-4 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-7" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">You're booked in</h1>
            <p className="text-sm text-muted-foreground">
              We've reserved your session. Bring along anything your trainer asked for and arrive a
              few minutes early.
            </p>
            {service && location ? (
              <Summary
                serviceName={service.name}
                locationName={location.name}
                start={confirmedBooking.start}
                timezone={confirmedBooking.timezone}
                price={formatMoney(confirmedBooking.priceMinor, confirmedBooking.currency)}
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Back
    </button>
  );
}

function Summary({
  serviceName,
  locationName,
  start,
  timezone,
  price,
}: {
  serviceName: string;
  locationName: string;
  start: string;
  timezone: string;
  price: string;
}) {
  return (
    <dl className="surface-card space-y-2 p-5 text-left text-sm">
      {[
        ["Session", serviceName],
        ["Studio", locationName],
        [
          "When",
          formatInTz(start, timezone, {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          }),
        ],
        ["Total", price],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
