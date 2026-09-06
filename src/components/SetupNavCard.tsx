import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBusinessOnboarding } from "@/lib/api/hooks";
import type { BusinessOnboarding } from "@/lib/api/types";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * How long the "You're set up" card lingers after the checklist is finished. Long
 * enough to enjoy the tick, short enough that it isn't sidebar furniture forever.
 * The checklist itself stays reachable from Help centre.
 */
const LINGER_MS = 3 * 24 * 60 * 60 * 1000;
const COMPLETED_KEY = (businessId: string) => `recavo.setup.completedAt.${businessId}`;

function isComplete(data: BusinessOnboarding | undefined): boolean {
  return Boolean(data) && (data!.status === "complete" || data!.percentComplete >= 100);
}

/**
 * Whether the setup card/button should still be shown. Incomplete → always. Complete →
 * for LINGER_MS after we first saw it complete (the API has no completion timestamp,
 * so it's remembered per business in localStorage).
 */
function useSetupCardVisible(data: BusinessOnboarding | undefined): boolean {
  const { businessId } = useTenant();
  const complete = isComplete(data);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!complete || !businessId) {
      setExpired(false);
      return;
    }
    let completedAt: number;
    try {
      const key = COMPLETED_KEY(businessId);
      const stored = Number(window.localStorage.getItem(key));
      completedAt = stored > 0 ? stored : Date.now();
      if (!(stored > 0)) window.localStorage.setItem(key, String(completedAt));
    } catch {
      completedAt = Date.now();
    }
    const remaining = completedAt + LINGER_MS - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    setExpired(false);
    // Flip it off if the tab stays open past the deadline (cap: setTimeout's max).
    const t = window.setTimeout(() => setExpired(true), Math.min(remaining, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [complete, businessId]);

  return !(complete && expired);
}

export function SetupNavCard({ onClick }: { onClick: () => void }) {
  const { data, isLoading } = useBusinessOnboarding();
  const percent = data?.percentComplete ?? 0;
  const complete = isComplete(data);
  const remaining = Math.max(0, (data?.requiredTotal ?? 0) - (data?.requiredCompleted ?? 0));
  const visible = useSetupCardVisible(data);

  if (isLoading && !data) {
    return <div className="h-[72px] animate-pulse rounded-xl bg-sidebar-accent/70" aria-hidden />;
  }

  if (!visible) return null;

  if (complete) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2.5 rounded-xl bg-sidebar-accent/70 px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent"
        aria-label="You're set up"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Check className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-sidebar-accent-foreground">
            You're set up
          </span>
          <span className="block text-[11px] text-sidebar-foreground/70">Review checklist</span>
        </span>
        <span className="text-[13px] font-bold tabular-nums text-sidebar-primary">100%</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl bg-sidebar-primary px-3 py-2.5 text-left text-sidebar-primary-foreground transition-opacity hover:opacity-90"
      aria-label={`Get set up, ${percent}% complete`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold">Get set up</span>
        <span className="text-lg font-bold leading-none tabular-nums">{percent}%</span>
      </span>
      <span
        className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sidebar-primary-foreground/25"
        aria-hidden
      >
        <span
          className="block h-full rounded-full bg-sidebar-primary-foreground transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </span>
      <span className="mt-1.5 block text-[11px] font-medium opacity-80">
        {data
          ? remaining === 0
            ? `${data.requiredCompleted} of ${data.requiredTotal} complete`
            : `${remaining} step${remaining === 1 ? "" : "s"} left`
          : "Finish the remaining steps"}
      </span>
    </button>
  );
}

export function SetupHeaderButton({ onClick }: { onClick: () => void }) {
  const { data } = useBusinessOnboarding();
  const percent = data?.percentComplete ?? 0;
  const complete = isComplete(data);
  const visible = useSetupCardVisible(data);

  if (!visible) return null;

  return (
    <Button
      type="button"
      variant={complete ? "outline" : "default"}
      className="gap-2"
      onClick={onClick}
      aria-label={complete ? "You're set up" : `Get set up, ${percent}% complete`}
    >
      {complete ? (
        <>
          <Check className="size-4" aria-hidden />
          <span className="hidden sm:inline">You're set up</span>
          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-primary">
            100%
          </span>
        </>
      ) : (
        <>
          <span className="hidden sm:inline">Get set up</span>
          <span className="rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
            {percent}%
          </span>
        </>
      )}
    </Button>
  );
}
