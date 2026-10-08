import type { PortalCredit } from "@/lib/api/hooks";

/** Credits that can actually be spent right now: active, unexpired, with units left. */
export function usableCredits<T extends PortalCredit>(
  credits: readonly T[] | undefined,
  now: number = Date.now(),
): T[] {
  return (credits ?? [])
    .filter((c) => c.status === "active" && c.available > 0 && Date.parse(c.expiresAt) > now)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

/** Usable credits that cover one service; empty `eligibleServiceIds` means any service. */
export function creditsCovering<T extends PortalCredit>(
  credits: readonly T[] | undefined,
  serviceId: string,
  now: number = Date.now(),
): T[] {
  return usableCredits(credits, now).filter(
    (c) => c.eligibleServiceIds.length === 0 || c.eligibleServiceIds.includes(serviceId),
  );
}

export type CreditBalance = {
  /** Units the client can spend (on `serviceId` when one is given). */
  readonly available: number;
  /** True when some of the counted credits only work on particular services. */
  readonly restricted: boolean;
  /** Soonest expiry among the counted credits, when there are any. */
  readonly nextExpiresAt: string | null;
};

/**
 * What the client has left to book with. On the calendar the service they picked
 * decides which packages count, so a "10 PT sessions" pack is not shown as spendable
 * on a massage.
 */
export function creditBalance(
  credits: readonly PortalCredit[] | undefined,
  serviceId?: string | null,
  now: number = Date.now(),
): CreditBalance {
  const counted = serviceId
    ? creditsCovering(credits, serviceId, now)
    : usableCredits(credits, now);
  return {
    available: counted.reduce((sum, c) => sum + c.available, 0),
    restricted: counted.some((c) => c.eligibleServiceIds.length > 0),
    nextExpiresAt: counted[0]?.expiresAt ?? null,
  };
}

/** "1 credit left" / "4 credits left" / "No credits left". */
export function creditsLeftLabel(n: number): string {
  if (n <= 0) return "No credits left";
  return `${n} ${n === 1 ? "credit" : "credits"} left`;
}
