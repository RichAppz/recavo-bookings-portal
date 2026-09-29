import { Link, useRouterState } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { useSupportRequests } from "@/lib/api/support";
import { lastActivity } from "@/lib/support";
import { cn } from "@/lib/utils";

/**
 * Sidebar footer link to Support. The badge counts open threads where RECAVO spoke
 * last — the same "New reply" the support list marks — so a reply is noticed
 * without opening the page.
 */
export function SupportNavLink({ onClick }: { onClick?: () => void }) {
  const requests = useSupportRequests();
  const awaiting = (requests.data ?? []).filter(
    (r) => r.status !== "resolved" && lastActivity(r).ours,
  ).length;
  const active = useRouterState({ select: (s) => s.location.pathname }).startsWith("/support");
  return (
    <Link
      to="/support"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <LifeBuoy className={cn("size-4.5", active && "text-sidebar-primary")} aria-hidden />
      Support
      {awaiting > 0 ? (
        <span
          className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[11px] font-semibold text-sidebar-primary-foreground"
          aria-label={`${awaiting} new ${awaiting === 1 ? "reply" : "replies"}`}
        >
          {awaiting}
        </span>
      ) : null}
    </Link>
  );
}
