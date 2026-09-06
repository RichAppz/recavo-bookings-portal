import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnboardingStepKey } from "@/lib/api/types";
import { requestSetup } from "@/lib/onboarding/setup-prompt";

/**
 * Shown inside a dialog when the action someone just tried needs a setup step
 * they haven't done yet. It explains what's missing, links to where to fix it, and
 * opens the setup checklist on that step so they can see where they are overall.
 */
export function SetupGate({
  icon,
  title,
  description,
  step,
  to,
  search,
  cta,
  onNavigate,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  /** Checklist step this action depends on; highlighted when the checklist opens. */
  step: OnboardingStepKey;
  to: string;
  search?: Record<string, string | boolean>;
  cta: string;
  /** Called when the link is followed — typically closes the hosting dialog. */
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">
        <Button asChild>
          <Link
            to={to}
            search={search}
            onClick={() => {
              onNavigate();
              requestSetup(step);
            }}
          >
            <Plus className="size-4" />
            {cta}
          </Link>
        </Button>
      </div>
    </div>
  );
}
