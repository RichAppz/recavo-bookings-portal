import { Link } from "@tanstack/react-router";
import { MessageSquareText } from "lucide-react";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { cn } from "@/lib/utils";

/**
 * Sidebar card with the text credit balance (ADR 0020). Hidden on Growth (texts
 * included) and until the balance is known; goes amber when low and red at zero,
 * matching the card on the Billing page. Click → the credits page.
 */
export function SmsCreditsNavCard({ onClick }: { onClick?: () => void }) {
  const { credits, level } = useSmsCreditsSummary();
  if (!credits || level === "unlimited" || level === "unknown") return null;

  const balance = credits.balance;
  const subtitle =
    level === "empty"
      ? "Out — texts going as email"
      : level === "low"
        ? "Running low · buy more"
        : "Prepaid texts · buy more";

  return (
    <Link
      to="/billing/sms-credits"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
        level === "empty"
          ? "bg-destructive/15 hover:bg-destructive/25"
          : level === "low"
            ? "bg-amber-500/15 hover:bg-amber-500/25"
            : "bg-sidebar-accent/70 hover:bg-sidebar-accent",
      )}
      aria-label={`${balance} text ${balance === 1 ? "credit" : "credits"} left — open text credits`}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          level === "empty"
            ? "bg-destructive text-destructive-foreground"
            : level === "low"
              ? "bg-amber-500 text-white"
              : "bg-sidebar-primary text-sidebar-primary-foreground",
        )}
      >
        <MessageSquareText className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-sidebar-accent-foreground">
          Text credits
        </span>
        <span className="block truncate text-[11px] text-sidebar-foreground/70">{subtitle}</span>
      </span>
      <span
        className={cn(
          "text-[13px] font-bold tabular-nums",
          level === "empty"
            ? "text-destructive"
            : level === "low"
              ? "text-amber-600 dark:text-amber-400"
              : "text-sidebar-primary",
        )}
      >
        {balance}
      </span>
    </Link>
  );
}
