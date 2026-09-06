import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import {
  useBookWithPortalCredit,
  usePortalCredits,
  usePublicAvailability,
  usePublicLocations,
  usePublicServices,
  type PortalCredit,
} from "@/lib/api/hooks";
import type { AvailabilitySlot } from "@/lib/api/types";
import { formatInTz, isoDate } from "@/lib/format";
import { toast } from "sonner";

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function usableCredits(credits: PortalCredit[] | undefined): PortalCredit[] {
  const now = Date.now();
  return (credits ?? [])
    .filter((c) => c.status === "active" && c.available > 0 && Date.parse(c.expiresAt) > now)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export function BookWithCreditDialog({
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
          toast.success("Booked", { description: "One credit has been used." });
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
              : "Your credits don't cover any of the services available to book online. Please contact the business."}
          </p>
        ) : (
          <div className="space-y-4">
            {bookable.length > 1 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Service</p>
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
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="h-10 animate-pulse rounded-md bg-primary/10" />
                    ))}
                  </div>
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
                Choose a service{locationList.length > 1 ? " and location" : ""} to see available
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
