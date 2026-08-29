import type { PublicPackage } from "@/lib/api/hooks";

/** How long the credits last, in words rather than `{kind, amount}`. */
export function validityLabel(validity: PublicPackage["validity"]): string {
  const { kind, amount } = validity;
  if (kind === "days") return `${amount} ${amount === 1 ? "day" : "days"}`;
  return `${amount} ${amount === 1 ? "month" : "months"}`;
}

/** One-line description of what buying a package gets you. */
export function packageSummary(pkg: PublicPackage): string {
  const sessions = `${pkg.creditsIssued} ${pkg.creditsIssued === 1 ? "session" : "sessions"}`;
  return `${sessions}, valid ${validityLabel(pkg.validity)}`;
}
