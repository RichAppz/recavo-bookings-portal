import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBusinessOnboarding } from "@/lib/api/hooks";

export function SetupNavCard({ onClick }: { onClick: () => void }) {
  const { data, isLoading } = useBusinessOnboarding();
  const percent = data?.percentComplete ?? 0;
  const complete = data?.status === "complete" || percent >= 100;
  const remaining = Math.max(0, (data?.requiredTotal ?? 0) - (data?.requiredCompleted ?? 0));

  if (isLoading && !data) {
    return <div className="h-[72px] animate-pulse rounded-xl bg-sidebar-accent/70" aria-hidden />;
  }

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
  const complete = data?.status === "complete" || percent >= 100;

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
