import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronUp, Circle, ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useBusinessOnboarding,
  useDismissOnboarding,
  useSkipOnboardingStep,
} from "@/lib/api/hooks";
import type { OnboardingStep } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function parseHref(href: string): { to: string; search?: Record<string, string> } {
  const [path, query] = href.split("?");
  if (!query) return { to: path };
  return { to: path, search: Object.fromEntries(new URLSearchParams(query)) };
}

function ProgressRing({ value, size = 28 }: { value: number; size?: number }) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = c - (clamped / 100) * c;
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-border"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

function StepRow({
  step,
  onSkip,
  onNavigate,
  skipPending,
}: {
  step: OnboardingStep;
  onSkip?: () => void;
  onNavigate?: () => void;
  skipPending?: boolean;
}) {
  const done = step.completed || step.skipped;
  const { to, search } = parseHref(step.href);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg px-2 py-2 transition-colors",
        done ? "opacity-60" : "hover:bg-secondary/70",
      )}
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground">
        {done ? (
          <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : (
          <Circle className="size-4" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {done ? (
          <p className="text-sm font-medium line-through decoration-muted-foreground/50">
            {step.title}
          </p>
        ) : (
          <Link
            to={to}
            search={search}
            onClick={onNavigate}
            className="text-sm font-medium text-foreground hover:text-primary"
          >
            {step.title}
          </Link>
        )}
        {!done ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
        ) : null}
      </div>
      {!done && !step.required && onSkip ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={skipPending}
          onClick={onSkip}
        >
          Skip
        </Button>
      ) : null}
    </div>
  );
}

export function OnboardingChecklist() {
  const onboarding = useBusinessOnboarding();
  const dismiss = useDismissOnboarding(onboarding.isDerived, onboarding.bumpLocal);
  const skip = useSkipOnboardingStep(onboarding.isDerived, onboarding.bumpLocal);
  const [expanded, setExpanded] = useState(true);
  const [showFurther, setShowFurther] = useState(false);

  const data = onboarding.data;

  useEffect(() => {
    if (!data) return;
    if (data.status === "complete") {
      setExpanded(false);
      setShowFurther(true);
    }
  }, [data?.status]);

  if (onboarding.isLoading || onboarding.isError || !data) return null;
  if (data.status === "dismissed") return null;

  const required = data.steps.filter((s) => s.required);
  const optional = data.steps.filter((s) => !s.required);
  const requiredDone = required.every((s) => s.completed || s.skipped);
  const optionalPending = optional.filter((s) => !s.completed && !s.skipped);
  const allDone = requiredDone && optionalPending.length === 0;

  if (allDone) return null;

  const showingOptionalOnly = requiredDone && optionalPending.length > 0;
  const visibleSteps = showingOptionalOnly
    ? optionalPending
    : showFurther
      ? [...required, ...optional]
      : required;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex max-w-[min(100vw-2rem,22rem)] flex-col items-end gap-2 sm:right-6 sm:bottom-6">
      {expanded ? (
        <div className="pointer-events-auto surface-card w-[min(100vw-2rem,22rem)] overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start gap-3 border-b px-4 py-3">
            <ProgressRing value={data.percentComplete} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {showingOptionalOnly ? "Go further" : "Get set up"}
              </p>
              <p className="text-xs text-muted-foreground">
                {showingOptionalOnly
                  ? `${optionalPending.length} optional step${optionalPending.length === 1 ? "" : "s"} left`
                  : `${data.requiredCompleted} of ${data.requiredTotal} complete`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Collapse setup checklist"
                onClick={() => setExpanded(false)}
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Dismiss setup checklist"
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate()}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div className="max-h-[min(50vh,22rem)] space-y-0.5 overflow-y-auto px-2 py-2">
            {visibleSteps.map((step) => (
              <StepRow
                key={step.key}
                step={step}
                skipPending={skip.isPending}
                onNavigate={() => setExpanded(false)}
                onSkip={
                  !step.required && !step.completed
                    ? () => skip.mutate(step.key)
                    : undefined
                }
              />
            ))}
          </div>

          {!showingOptionalOnly && optionalPending.length > 0 ? (
            <div className="border-t px-3 py-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                onClick={() => setShowFurther((v) => !v)}
              >
                {showFurther ? "Hide optional steps" : "Go further"}
                {showFurther ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="pointer-events-auto flex items-center gap-2.5 rounded-full border bg-card px-3.5 py-2.5 text-sm font-medium shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="relative flex size-7 items-center justify-center">
            <ProgressRing value={data.percentComplete} size={28} />
            <ListChecks className="absolute size-3 text-foreground" aria-hidden />
          </span>
          {showingOptionalOnly ? "Go further" : "Get set up"}
          <span className="text-xs text-muted-foreground">
            {showingOptionalOnly
              ? `${optionalPending.length} left`
              : `${data.requiredCompleted}/${data.requiredTotal}`}
          </span>
        </button>
      )}
    </div>
  );
}
