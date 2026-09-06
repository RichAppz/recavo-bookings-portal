import { useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api";
import {
  useBookWithPortalCredit,
  usePublicLocations,
  usePublicServices,
  type PortalBusinessSummary,
  type PortalCredit,
} from "@/lib/api/hooks";
import { queryKeys } from "@/lib/api/query-keys";
import type { AvailabilitySlot } from "@/lib/api/types";
import { formatInTz, isoDate } from "@/lib/format";
import { toast } from "sonner";

export type CalendarPaidSlot = {
  studio: PortalBusinessSummary;
  date: string;
  serviceId: string;
  locationId: string;
  slot: AvailabilitySlot;
};

type DaySlot = AvailabilitySlot & {
  serviceId: string;
  serviceName: string;
  locationName: string;
};

function usableCredits(credits: readonly PortalCredit[]): PortalCredit[] {
  const now = Date.now();
  return credits.filter(
    (c) => c.status === "active" && c.available > 0 && Date.parse(c.expiresAt) > now,
  );
}

/** Empty eligibleServiceIds means the credit works on every session. */
function creditsCoverService(credits: readonly PortalCredit[], serviceId: string): boolean {
  return usableCredits(credits).some(
    (c) => c.eligibleServiceIds.length === 0 || c.eligibleServiceIds.includes(serviceId),
  );
}

function slotOnDate(slot: AvailabilitySlot, date: string): boolean {
  return (
    formatInTz(
      slot.start,
      slot.displayTimezone,
      { year: "numeric", month: "2-digit", day: "2-digit" },
      "en-CA",
    ) === date
  );
}

function useStudioDaySlots(businessId: string, date: string, enabled: boolean) {
  const services = usePublicServices(enabled ? businessId : undefined);
  const locations = usePublicLocations(enabled ? businessId : undefined);
  const from = new Date(`${date}T00:00:00.000Z`).toISOString();
  const to = new Date(
    new Date(`${date}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();

  const combos = useMemo(() => {
    const list = services.data ?? [];
    const places = locations.data ?? [];
    return list.flatMap((service) => places.map((location) => ({ service, location })));
  }, [services.data, locations.data]);

  const queries = useQueries({
    queries: combos.map(({ service, location }) => ({
      queryKey: queryKeys.publicAvailability(businessId, {
        serviceId: service.id,
        locationId: location.id,
        from,
        to,
      }),
      enabled,
      queryFn: async () => {
        const res = await api.get<{ slots: AvailabilitySlot[] }>(
          `/api/v1/public/businesses/${businessId}/availability`,
          {
            public: true,
            query: {
              serviceId: service.id,
              locationId: location.id,
              from,
              to,
            },
          },
        );
        return res.data.slots
          .filter((slot) => slotOnDate(slot, date))
          .map((slot): DaySlot => ({
            ...slot,
            serviceId: service.id,
            serviceName: service.name,
            locationName: location.name,
          }));
      },
    })),
  });

  const isLoading =
    enabled &&
    (services.isLoading ||
      locations.isLoading ||
      (combos.length > 0 && queries.some((q) => q.isPending)));

  const slots = queries
    .flatMap((q) => q.data ?? [])
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start) || a.serviceName.localeCompare(b.serviceName));

  return { slots, isLoading };
}

/**
 * Times still free on the selected calendar day. Credits that cover a session
 * book it here; everything else opens the same account booking drawer.
 */
export function CalendarDayBooker({
  date,
  studios,
  credits,
  onBookPaid,
}: {
  date: string;
  studios: readonly PortalBusinessSummary[];
  credits: readonly (PortalCredit & { studio: PortalBusinessSummary })[];
  onBookPaid: (slot: CalendarPaidSlot) => void;
}) {
  if (date < isoDate(new Date())) return null;

  return (
    <div className="space-y-4 border-t pt-4">
      <h3 className="text-sm font-medium">Available to book</h3>
      {studios.map((studio) => (
        <StudioDaySlots
          key={`${studio.id}-${date}`}
          studio={studio}
          date={date}
          credits={credits.filter((c) => c.studio.id === studio.id)}
          hideStudioName={studios.length === 1}
          onBookPaid={onBookPaid}
        />
      ))}
    </div>
  );
}

function StudioDaySlots({
  studio,
  date,
  credits,
  hideStudioName,
  onBookPaid,
}: {
  studio: PortalBusinessSummary;
  date: string;
  credits: readonly PortalCredit[];
  hideStudioName: boolean;
  onBookPaid: (slot: CalendarPaidSlot) => void;
}) {
  const queryClient = useQueryClient();
  const { slots, isLoading } = useStudioDaySlots(studio.id, date, true);
  const book = useBookWithPortalCredit(studio.id);
  const [picked, setPicked] = useState<DaySlot | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, DaySlot[]>();
    for (const slot of slots) {
      const bucket = map.get(slot.serviceId);
      if (bucket) bucket.push(slot);
      else map.set(slot.serviceId, [slot]);
    }
    return [...map.values()];
  }, [slots]);

  const covers = picked ? creditsCoverService(credits, picked.serviceId) : false;
  const hasAnyCredit = usableCredits(credits).length > 0;

  const submitCredit = () => {
    if (!picked) return;
    book.mutate(
      { slotToken: picked.slotToken },
      {
        onSuccess: () => {
          toast.success("Session booked", { description: "One credit has been used." });
          setPicked(null);
          void queryClient.invalidateQueries({
            queryKey: queryKeys.publicAvailabilityAll(studio.id),
          });
        },
        onError: (err) => {
          if (err instanceof ApiError && (err.code === "BOOKING_CONFLICT" || err.isConflict)) {
            setPicked(null);
          }
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-primary/10" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return hideStudioName ? (
      <p className="text-sm text-muted-foreground">No availability on this day.</p>
    ) : null;
  }

  return (
    <div className="space-y-3">
      {hideStudioName ? null : (
        <p className="text-xs font-medium text-muted-foreground">{studio.tradingName}</p>
      )}
      {grouped.map((group) => (
        <div key={group[0].serviceId} className="space-y-2">
          <p className="text-sm font-medium">{group[0].serviceName}</p>
          <div className="grid grid-cols-3 gap-2">
            {group.map((slot) => {
              const selected =
                picked?.start === slot.start &&
                picked.staffId === slot.staffId &&
                picked.serviceId === slot.serviceId;
              return (
                <button
                  key={`${slot.serviceId}-${slot.start}-${slot.staffId}`}
                  type="button"
                  onClick={() => setPicked(slot)}
                  className={`rounded-xl border py-2 text-sm tabular-nums ${
                    selected ? "border-primary bg-primary-soft text-primary" : "hover:bg-secondary"
                  }`}
                >
                  {formatInTz(slot.start, slot.displayTimezone, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {picked ? (
        covers ? (
          <Button className="w-full" disabled={book.isPending} onClick={submitCredit}>
            {book.isPending ? "Booking…" : "Book with 1 credit"}
          </Button>
        ) : (
          <Button
            className="w-full"
            variant={hasAnyCredit ? "outline" : "default"}
            onClick={() =>
              onBookPaid({
                studio,
                date,
                serviceId: picked.serviceId,
                locationId: picked.locationId,
                slot: picked,
              })
            }
          >
            {hasAnyCredit ? "Book without a credit" : "Book this time"}
          </Button>
        )
      ) : (
        <p className="text-xs text-muted-foreground">
          {hasAnyCredit
            ? "Pick a time to use a credit — any open slot is available."
            : "Pick a time to book."}
        </p>
      )}
    </div>
  );
}
