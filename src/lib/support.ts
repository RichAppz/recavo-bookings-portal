import { SUPPORT_CATEGORIES } from "@/lib/api/support";
import type { SupportRequest } from "@/lib/api/types";

export function categoryLabel(value: SupportRequest["category"]): string {
  return SUPPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** What happened most recently on the thread, from the business's point of view. */
export function lastActivity(r: SupportRequest): { label: string; at: string; ours: boolean } {
  if (r.lastMessageAt && r.lastMessageBy === "platform") {
    return { label: "RECAVO replied", at: r.lastMessageAt, ours: true };
  }
  if (r.lastMessageAt) return { label: "You replied", at: r.lastMessageAt, ours: false };
  return { label: "Sent", at: r.createdAt, ours: false };
}
