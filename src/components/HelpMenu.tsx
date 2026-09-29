import { Link } from "@tanstack/react-router";
import { BookOpen, CircleHelp, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSupportRequests } from "@/lib/api/support";
import { lastActivity } from "@/lib/support";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * Help button in the top bar, beside search: Guides and Support in one menu so the
 * sidebar footer stays short. The dot on the icon (and the count on the Support row)
 * is open threads where RECAVO spoke last — the same "New reply" the support list
 * marks — so a reply is noticed without opening the page.
 */
export function HelpMenu() {
  const tenant = useTenant();
  const requests = useSupportRequests();
  const awaiting = (requests.data ?? []).filter(
    (r) => r.status !== "resolved" && lastActivity(r).ours,
  ).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative shrink-0" aria-label="Help">
          <CircleHelp className="size-4" />
          {awaiting > 0 ? (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Help</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/support/guides">
            <BookOpen className="size-4" /> Guides
          </Link>
        </DropdownMenuItem>
        {tenant.businessId ? (
          <DropdownMenuItem asChild>
            <Link to="/support">
              <LifeBuoy className="size-4" /> Support
              {awaiting > 0 ? (
                <span
                  className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground"
                  aria-label={`${awaiting} new ${awaiting === 1 ? "reply" : "replies"}`}
                >
                  {awaiting}
                </span>
              ) : null}
            </Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
