/**
 * What the account overview's Credits card says, per studio. Three looks:
 *
 * - `credits`: sessions left, with a quiet "+N on the way" line when a package is
 *   still waiting on the studio;
 * - `pending`: nothing usable yet, but a package has been asked for — the request
 *   lives here now instead of as a banner over the whole page;
 * - `none`: no credits and nothing pending, shown only when the studio actually
 *   sells packages, so the invitation to buy never points at an empty shelf.
 *
 * Pure so it can be tested without React.
 */

type StudioRef = { id: string; tradingName: string };

type CreditLike = { available: number; expiresAt: string };
type PendingLike = { status: string; packageName: string; creditsIssued: number };
type PackageLike = { id: string };

export type PendingSummary = {
  /** Credits across every pending request at the studio. */
  credits: number;
  count: number;
  /** The package's name when exactly one request is waiting. */
  packageName: string | null;
};

export type CreditsCardModel<S extends StudioRef = StudioRef> =
  | { kind: "credits"; studio: S; total: number; useBy: string; pending: PendingSummary | null }
  | { kind: "pending"; studio: S; pending: PendingSummary }
  | { kind: "none"; studio: S };

export function creditsCards<S extends StudioRef>(input: {
  studios: readonly S[];
  credits: readonly (CreditLike & { studio: StudioRef })[];
  requests: readonly (PendingLike & { studio: StudioRef })[];
  packages: readonly (PackageLike & { studio: StudioRef })[];
}): CreditsCardModel<S>[] {
  const cards: CreditsCardModel<S>[] = [];
  for (const studio of input.studios) {
    const mine = input.credits.filter((c) => c.studio.id === studio.id);
    const total = mine.reduce((sum, c) => sum + c.available, 0);
    const pending = summarisePending(
      input.requests.filter((r) => r.studio.id === studio.id && r.status === "pending"),
    );
    if (total > 0) {
      const useBy = mine.reduce(
        (soonest, c) => (c.expiresAt < soonest ? c.expiresAt : soonest),
        mine[0]!.expiresAt,
      );
      cards.push({ kind: "credits", studio, total, useBy, pending });
    } else if (pending) {
      cards.push({ kind: "pending", studio, pending });
    }
  }
  if (cards.length > 0) return cards;

  // Nothing owned or waiting anywhere: one invitation, from the first studio that
  // has packages for sale. None of them do → no card at all.
  const seller = input.studios.find((s) => input.packages.some((p) => p.studio.id === s.id));
  return seller ? [{ kind: "none", studio: seller }] : [];
}

function summarisePending(requests: readonly PendingLike[]): PendingSummary | null {
  if (requests.length === 0) return null;
  return {
    credits: requests.reduce((sum, r) => sum + r.creditsIssued, 0),
    count: requests.length,
    packageName: requests.length === 1 ? requests[0]!.packageName : null,
  };
}

/** "Your 10 session block from Northside Strength is on its way". */
export function pendingHeadline(pending: PendingSummary, studioName: string): string {
  if (pending.packageName) return `Your ${pending.packageName} from ${studioName} is on its way`;
  return `Your ${pending.count} packages from ${studioName} are on their way`;
}

/** "+10 on the way", or "+15 on the way (2 requests)". */
export function pendingLine(pending: PendingSummary): string {
  const base = `+${pending.credits} on the way`;
  return pending.count > 1 ? `${base} (${pending.count} requests)` : base;
}
