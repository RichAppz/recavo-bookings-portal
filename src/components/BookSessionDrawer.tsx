import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BookingFlow } from "@/components/BookingFlow";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { queryKeys } from "@/lib/api/query-keys";
import type { PortalBusinessSummary } from "@/lib/api/hooks";
import type { AvailabilitySlot } from "@/lib/api/types";

/** A calendar (or similar) can hand the drawer a day, session and time. */
export type BookingSeed = {
  date?: string;
  serviceId?: string;
  locationId?: string;
  slot?: AvailabilitySlot;
};

/**
 * Signed-in booking stays on the account. The public studio page (`/$slug`) is
 * left for people who arrived from a link without an account.
 *
 * `offer` scopes the flow to a sign-up link the studio handed this customer, the
 * same way `?offer=` does on the public page.
 */
export function BookSessionDrawer({
  studio,
  open,
  onOpenChange,
  seed,
  offer,
}: {
  studio: PortalBusinessSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seed?: BookingSeed | null;
  offer?: { code: string; name: string } | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const finish = () => {
    if (studio) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.portalBookings(studio.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portalPayments(studio.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portalCredits(studio.id) });
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        <SheetHeader className="space-y-1 border-b px-5 py-4 text-left">
          <SheetTitle>{offer ? offer.name : "Book a session"}</SheetTitle>
          {studio ? (
            <SheetDescription>{studio.tradingName}</SheetDescription>
          ) : (
            <SheetDescription>Choose a time with your studio.</SheetDescription>
          )}
        </SheetHeader>
        {open && studio ? (
          <BookingFlow
            key={`${studio.id}:${offer?.code ?? ""}:${seed?.slot?.slotToken ?? seed?.date ?? "new"}`}
            businessId={studio.id}
            offerCode={offer?.code ?? null}
            studio={{
              id: studio.id,
              slug: studio.slug,
              tradingName: studio.tradingName,
              currency: "GBP",
              defaultTimezone: "Europe/London",
              branding: { logoUrl: null, accentColour: null },
            }}
            layout="embedded"
            initialDate={seed?.date}
            initialServiceId={seed?.serviceId}
            initialLocationId={seed?.locationId ?? seed?.slot?.locationId}
            initialSlot={seed?.slot ?? null}
            onComplete={finish}
            onClearRedirectParams={() =>
              void navigate({
                from: "/account",
                to: "/account",
                search: (prev) => ({ view: prev.view }),
                replace: true,
              })
            }
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
