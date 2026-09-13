import { Button } from "@/components/ui/button";
import { useBusinessOnboarding } from "@/lib/api/hooks";
import type { BusinessOnboarding } from "@/lib/api/types";

/**
 * The setup prompt only earns its place while there is something left to do. The
 * moment the checklist is complete it disappears; the checklist itself stays
 * reachable from Help centre for anyone who wants to revisit a step.
 */
function isComplete(data: BusinessOnboarding | undefined): boolean {
  return Boolean(data) && (data!.status === "complete" || data!.percentComplete >= 100);
}

export function SetupNavCard({ onClick }: { onClick: () => void }) {
  const { data, isLoading } = useBusinessOnboarding();
  const percent = data?.percentComplete ?? 0;
  const remaining = Math.max(0, (data?.requiredTotal ?? 0) - (data?.requiredCompleted ?? 0));

  if (isLoading && !data) {
    return <div className="h-[72px] animate-pulse rounded-xl bg-sidebar-accent/70" aria-hidden />;
  }

  if (!data || isComplete(data)) return null;

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
        {remaining === 0
          ? `${data.requiredCompleted} of ${data.requiredTotal} complete`
          : `${remaining} step${remaining === 1 ? "" : "s"} left`}
      </span>
    </button>
  );
}

export function SetupHeaderButton({ onClick }: { onClick: () => void }) {
  const { data } = useBusinessOnboarding();
  const percent = data?.percentComplete ?? 0;

  if (!data || isComplete(data)) return null;

  return (
    <Button
      type="button"
      className="gap-2"
      onClick={onClick}
      aria-label={`Get set up, ${percent}% complete`}
    >
      <span className="hidden sm:inline">Get set up</span>
      <span className="rounded-md bg-primary-foreground/20 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
        {percent}%
      </span>
    </Button>
  );
}
