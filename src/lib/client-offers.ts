import type { PublicPackage, PublicPackageLink, PublicService } from "@/lib/api/hooks";
import type { BookingPageSectionKey } from "@/lib/client-theme";

/**
 * The booking page's Offers section. An "offer" is an offer link (a package link the
 * business shared): a named set of sessions and packages, maybe with a discount,
 * resolved through `GET /public/businesses/:id/package-links/:code`. The section
 * shows the links a signed-in client has been given at this business
 * (`GET /portal/package-links?businessId=`) and the one named by `?offer=<code>`.
 */

/** Which offers to list: the link they arrived by first, then theirs, no code twice. */
export function offersToShow(
  arrivedBy: PublicPackageLink | null | undefined,
  mine: readonly PublicPackageLink[] | null | undefined,
): PublicPackageLink[] {
  const out: PublicPackageLink[] = [];
  const seen = new Set<string>();
  for (const link of [arrivedBy, ...(mine ?? [])]) {
    if (!link || seen.has(link.link.code)) continue;
    seen.add(link.link.code);
    out.push(link);
  }
  return out;
}

/**
 * The section is on screen only when there is something to show: the business turned
 * it on and the client has at least one offer. The editor's preview always shows it
 * (with a sample) so the business can see where it sits. A private offer link is
 * the whole page, so it shows whether or not the section is on.
 */
export function offersSectionVisible(input: {
  enabled: boolean;
  offers: readonly PublicPackageLink[];
  preview: boolean;
  offerOnly?: boolean;
}): boolean {
  if (input.offerOnly) return input.offers.length > 0;
  if (!input.enabled) return false;
  return input.preview || input.offers.length > 0;
}

/**
 * Which sections the landing draws, top to bottom. The business's own order as a
 * rule; on a private offer link the offer leads and the catalogue (Sessions and
 * Packages) is left out, with the rest — reviews, about, team, location — following
 * in the business's order.
 */
export function landingSectionOrder(
  order: readonly BookingPageSectionKey[],
  offerOnly: boolean,
): BookingPageSectionKey[] {
  if (!offerOnly) return [...order];
  return ["offers", ...order.filter((key) => key !== "offers" && key !== "sessions")];
}

/** A stand-in offer for the editor's preview, built from the business's own catalogue. */
export function sampleOffer(
  services: readonly PublicService[],
  packages: readonly PublicPackage[],
): PublicPackageLink {
  const service = services[0];
  const pkg = packages[0];
  return {
    link: {
      code: "SAMPLE",
      name: "Welcome offer",
      showFullCatalogue: true,
      discount: { kind: "percent", percent: 10 },
    },
    services: service ? [service] : [],
    packages: pkg ? [pkg] : [],
  };
}
