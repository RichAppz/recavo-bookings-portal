import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { useDeclineUpsellOffer, useUpsellOffers } from "@/lib/api/upsells";
import { formatInTz, formatMoney } from "@/lib/format";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * Add-on requests awaiting staff: a customer tapped "Request to add" on the offer
 * email after being booked in. Opening the booking lets staff add the service via
 * Edit booking; declining closes the request. Renders nothing when there are none.
 */
export function UpsellRequestsCard({ onOpenBooking }: { onOpenBooking: (id: string) => void }) {
  const tenant = useTenant();
  const offers = useUpsellOffers(["requested"]);
  const decline = useDeclineUpsellOffer();
  const timezone = tenant.business?.defaultTimezone || "Europe/London";
  const rows = offers.data ?? [];
  if (rows.length === 0) return null;

  return (
    <SectionCard
      title={`Add-on ${rows.length === 1 ? "request" : "requests"}`}
      description="Clients who asked for an extra from their offer email. Add it to the job or decline."
    >
      <ul className="divide-y">
        {rows.map((offer) => {
          const who = offer.customer
            ? [offer.customer.firstName, offer.customer.lastName].filter(Boolean).join(" ")
            : "A client";
          return (
            <li
              key={offer.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="size-4 shrink-0 text-primary" />
                  <span className="truncate">
                    {who} wants{" "}
                    {offer.requested
                      .map((r) => `${r.name} (${formatMoney(r.priceMinor, r.currency)})`)
                      .join(", ")}
                  </span>
                </p>
                {offer.booking ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    On their {offer.booking.serviceName} ·{" "}
                    {formatInTz(offer.booking.start, timezone, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    · ref {offer.booking.reference}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => onOpenBooking(offer.bookingId)}>
                  Open booking
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decline.isPending}
                  onClick={() =>
                    void decline.mutateAsync(offer.id).then(() => toast.success("Request declined"))
                  }
                >
                  Decline
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
