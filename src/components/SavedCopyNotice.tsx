import { CloudOff } from "lucide-react";
import { useOnline } from "@/lib/offline/network";
import { relativeTimeAgo } from "@/lib/booking-reminders";

/**
 * "You're looking at a saved copy" — shown above a list while offline (or when
 * the data is old because the last refresh couldn't get through). Silent when
 * online and fresh, so it never nags.
 */
const OLD_AFTER_MS = 10 * 60_000;

export function SavedCopyNotice({
  updatedAt,
  what = "This list",
}: {
  /** `dataUpdatedAt` from the query; 0 when nothing has ever loaded. */
  updatedAt: number;
  what?: string;
}) {
  const online = useOnline();
  if (!updatedAt) return null;
  const age = Date.now() - updatedAt;
  if (online && age < OLD_AFTER_MS) return null;

  return (
    <p className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
      <CloudOff className="size-3.5 shrink-0" aria-hidden />
      <span>
        {what} is a saved copy from {relativeTimeAgo(new Date(updatedAt).toISOString())}
        {online ? " — refreshing…" : ". It updates when you're back online."}
      </span>
    </p>
  );
}
