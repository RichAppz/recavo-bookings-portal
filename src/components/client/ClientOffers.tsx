import { ChevronRight, Gift } from "lucide-react";
import { ClientCard } from "@/components/client/ClientPage";
import type { PublicPackageLink } from "@/lib/api/hooks";
import { price } from "@/lib/client-journey";
import { formatDuration } from "@/lib/format";
import { describeDiscount, discountedMinor } from "@/lib/offer-discount";
import { validityLabel } from "@/lib/packages";
import { cn } from "@/lib/utils";

/**
 * One offer on the booking page: the link's name, its discount if any, and the
 * sessions and packages it names as rows the client can tap. A session books through
 * the page's own flow with the link's code applied; a package goes to its checkout
 * with the same code, so the price shown is the price charged.
 */
export function OfferCard({
  offer,
  onPickService,
  onPickPackage,
  selectedServiceId = null,
  selectedPackageId = null,
}: {
  offer: PublicPackageLink;
  onPickService: (code: string, serviceId: string) => void;
  onPickPackage: (code: string, packageId: string) => void;
  selectedServiceId?: string | null;
  selectedPackageId?: string | null;
}) {
  const discount = offer.link.discount ?? null;
  const currency = offer.services[0]?.currency ?? offer.packages[0]?.currency ?? "GBP";
  const badge = describeDiscount(discount, currency);
  const empty = offer.services.length === 0 && offer.packages.length === 0;

  return (
    <ClientCard>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
          aria-hidden
        >
          <Gift className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold leading-tight">{offer.link.name}</p>
          <p className="text-[13px] text-muted-foreground">
            {badge ? `${badge} when you book through this offer` : "Picked out for you"}
          </p>
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </div>
      {empty ? (
        <p className="border-t border-border px-4 py-4 text-[14px] text-muted-foreground">
          Nothing in this offer is bookable right now.
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {offer.services.map((service) => {
            const was = service.basePriceMinor;
            const now = discountedMinor(discount, was);
            return (
              <li key={`s-${service.id}`}>
                <OfferRow
                  active={selectedServiceId === service.id}
                  title={service.name}
                  subtitle={formatDuration(service.durationMinutes)}
                  was={now !== was ? price(was, service.currency) : null}
                  now={now === 0 ? "Free" : price(now, service.currency)}
                  onClick={() => onPickService(offer.link.code, service.id)}
                />
              </li>
            );
          })}
          {offer.packages.map((pkg) => {
            const list = pkg.listPriceMinor ?? pkg.priceMinor;
            return (
              <li key={`p-${pkg.id}`}>
                <OfferRow
                  active={selectedPackageId === pkg.id}
                  title={pkg.name}
                  subtitle={`${pkg.creditsIssued} ${pkg.creditsIssued === 1 ? "session" : "sessions"} · Use within ${validityLabel(pkg.validity)}`}
                  was={list !== pkg.priceMinor ? price(list, pkg.currency) : null}
                  now={price(pkg.priceMinor, pkg.currency)}
                  onClick={() => onPickPackage(offer.link.code, pkg.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </ClientCard>
  );
}

function OfferRow({
  active,
  title,
  subtitle,
  was,
  now,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  was: string | null;
  now: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-muted",
        active && "bg-primary-soft/40",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">{title}</span>
        <span className="block text-[13px] text-muted-foreground">{subtitle}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end leading-tight">
        {was ? <span className="text-[12px] text-muted-foreground line-through">{was}</span> : null}
        <span className="text-[16px] font-semibold">{now}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </button>
  );
}
