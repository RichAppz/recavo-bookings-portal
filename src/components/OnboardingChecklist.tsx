import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronUp, Circle, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBusinessOnboarding, useSkipOnboardingStep } from "@/lib/api/hooks";
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
        "rounded-lg px-2 py-2 transition-colors",
        done ? "opacity-60" : "hover:bg-secondary/70",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-muted-foreground">
          {done ? (
            <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : (
            <Circle className="size-4" aria-hidden />
          )}
        </span>
        <Link
          to={to}
          search={search}
          onClick={onNavigate}
          className={cn(
            "min-w-0 flex-1 text-sm font-medium leading-none",
            done
              ? "text-muted-foreground line-through decoration-muted-foreground/50"
              : "text-foreground hover:text-primary",
          )}
        >
          {step.title}
        </Link>
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
      {!done ? (
        <p className="mt-0.5 pl-7 text-xs text-muted-foreground">{step.description}</p>
      ) : null}
    </div>
  );
}

export function OnboardingChecklist({
  openRequest = 0,
  onOpenTour,
}: {
  openRequest?: number;
  onOpenTour?: () => void;
}) {
  const onboarding = useBusinessOnboarding();
  const skip = useSkipOnboardingStep(onboarding.isDerived, onboarding.bumpLocal);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [showFurther, setShowFurther] = useState(false);

  const data = onboarding.data;
  const [didAutoOpen, setDidAutoOpen] = useState(false);

  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);

  useEffect(() => {
    if (didAutoOpen || !data) return;
    if (data.status === "in_progress" && data.requiredCompleted === 0) {
      setOpen(true);
      setDidAutoOpen(true);
    }
  }, [data, didAutoOpen]);

  const required = data?.steps.filter((s) => s.required) ?? [];
  const optional = data?.steps.filter((s) => !s.required) ?? [];
  const requiredDone = required.length > 0 && required.every((s) => s.completed || s.skipped);
  const optionalPending = optional.filter((s) => !s.completed && !s.skipped);
  const allDone = Boolean(data) && requiredDone && optionalPending.length === 0;

  const showingOptionalOnly = requiredDone && optionalPending.length > 0 && !allDone;
  const visibleSteps = !data
    ? []
    : allDone
      ? data.steps
      : showingOptionalOnly
        ? optionalPending
        : showFurther
          ? [...required, ...optional]
          : required;

  const title = allDone ? "You're set up" : showingOptionalOnly ? "Go further" : "Get set up";
  const subtitle = !data
    ? "Your setup checklist"
    : allDone
      ? "Reopen any step from here whenever you need it"
      : showingOptionalOnly
        ? `${optionalPending.length} optional step${optionalPending.length === 1 ? "" : "s"} left`
        : `${data.requiredCompleted} of ${data.requiredTotal} complete`;

  // Steps list, "Go further" toggle and the tour link are identical whether we
  // render the mobile sheet or the desktop corner popup, so build them once.
  const stepsList =
    onboarding.isLoading && !data ? (
      <p className="px-3 py-6 text-sm text-muted-foreground">Loading your setup steps…</p>
    ) : onboarding.isError && !data ? (
      <p className="px-3 py-6 text-sm text-muted-foreground">
        Couldn't load setup just now. Try Get set up again in a moment.
      </p>
    ) : (
      visibleSteps.map((step) => (
        <StepRow
          key={step.key}
          step={step}
          skipPending={skip.isPending}
          onNavigate={() => setOpen(false)}
          onSkip={!step.required && !step.completed ? () => skip.mutate(step.key) : undefined}
        />
      ))
    );

  const goFurther =
    data && !allDone && !showingOptionalOnly && optionalPending.length > 0 ? (
      <div className="border-t px-3 py-2">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          onClick={() => setShowFurther((v) => !v)}
        >
          {showFurther ? "Hide optional steps" : "Go further"}
          {showFurther ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      </div>
    ) : null;

  const tourLink = onOpenTour ? (
    <div className="border-t px-3 py-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
        onClick={() => {
          setOpen(false);
          onOpenTour();
        }}
      >
        <ListChecks className="size-3.5" />
        How Recavo works
      </button>
    </div>
  ) : null;

  // Mobile keeps the full-height sheet; it's the right pattern on a small screen.
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b px-4 py-4 text-left">
            <div className="flex items-start gap-3 pr-8">
              <ProgressRing value={data?.percentComplete ?? 0} />
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base">{title}</SheetTitle>
                <SheetDescription>{subtitle}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-0.5 px-2 py-2">{stepsList}</div>
          {goFurther}
          {tourLink}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: an unobtrusive bottom-right popup — an expandable card that collapses
  // to a small pill, rather than a full-height drawer taking over the screen.
  return (
    <div className="pointer-events-none fixed right-6 bottom-6 z-40 flex max-w-[min(100vw-2rem,22rem)] flex-col items-end gap-2">
      {open ? (
        <div className="pointer-events-auto surface-card w-[min(100vw-2rem,22rem)] overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start gap-3 border-b px-4 py-3">
            <ProgressRing value={data?.percentComplete ?? 0} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Collapse setup checklist"
              onClick={() => setOpen(false)}
            >
              <ChevronDown className="size-4" />
            </Button>
          </div>

          <div className="max-h-[min(50vh,22rem)] space-y-0.5 overflow-y-auto px-2 py-2">
            {stepsList}
          </div>
          {goFurther}
          {tourLink}
        </div>
      ) : data && !allDone ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex items-center gap-2.5 rounded-full border bg-card px-3.5 py-2.5 text-sm font-medium shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <span className="relative flex size-7 items-center justify-center">
            <ProgressRing value={data.percentComplete} size={28} />
            <ListChecks className="absolute size-3 text-foreground" aria-hidden />
          </span>
          {title}
          <span className="text-xs text-muted-foreground">
            {showingOptionalOnly
              ? `${optionalPending.length} left`
              : `${data.requiredCompleted}/${data.requiredTotal}`}
          </span>
        </button>
      ) : null}
    </div>
  );
}
