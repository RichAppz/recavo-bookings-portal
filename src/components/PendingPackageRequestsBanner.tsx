import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useCustomer,
  useCustomersById,
  usePackageRequests,
  type PackageRequest,
} from "@/lib/api/hooks";
import { customerDisplayName } from "@/lib/api/types";
import { relativeTimeAgo } from "@/lib/booking-reminders";
import { formatMoney } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const MAX_ROWS = 3;

/**
 * Purchases a client has asked for that nobody has confirmed yet. The request only
 * lived on the Packages page and in one email, which is how one sat unnoticed for a
 * fortnight; this puts it where the owner actually looks (Overview and Calendar) and
 * each row jumps straight to that request so it can be confirmed in two taps.
 * Renders nothing when there is nothing waiting or the person cannot manage packages.
 *
 * `variant="strip"` is the calendar's one-line form (calendar spec §2.2 / §3.4): the
 * count in bold, the requests summarised after it and truncated, and one Review
 * button to the Packages page where Confirm and Decline live.
 */
export function PendingPackageRequestsBanner({
  className,
  variant = "card",
}: {
  className?: string;
  variant?: "card" | "strip";
}) {
  const tenant = useTenant();
  const canManage = tenant.can(PERMISSIONS.PACKAGE_MANAGE);
  const pending = usePackageRequests("pending", { enabled: canManage });
  const requests = pending.data ?? [];
  if (!canManage || requests.length === 0) return null;
  if (variant === "strip") return <Strip requests={requests} className={className} />;

  const count = requests.length;
  const shown = requests.slice(0, MAX_ROWS);
  const more = count - shown.length;

  return (
    <section
      role="status"
      aria-label="Package purchases waiting for confirmation"
      className={cn(
        "rounded-xl border border-warning/40 bg-warning-soft/60 p-4 text-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning-foreground">
            <PackageCheck className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-warning-foreground">
              {count === 1
                ? "A package purchase is waiting for your confirmation"
                : `${count} package purchases are waiting for your confirmation`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The client has asked to buy; nothing goes on their account until you confirm it.
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="bg-card">
          <Link to="/packages">
            Review {count === 1 ? "request" : "requests"} <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <ul className="mt-3 divide-y divide-warning/20 rounded-lg border border-warning/20 bg-card/70">
        {shown.map((r) => (
          <PendingRequestRow key={r.id} request={r} />
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          And {more} more on the{" "}
          <Link to="/packages" className="font-medium underline-offset-2 hover:underline">
            Packages page
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}

function Strip({ requests, className }: { requests: PackageRequest[]; className?: string }) {
  const customers = useCustomersById(requests.map((r) => r.customerId));
  const count = requests.length;
  const summary = requests
    .map((r) => {
      const c = customers.get(r.customerId);
      const who = c ? customerDisplayName(c) : "A client";
      return `${who}, ${r.packageName} ${formatMoney(r.priceMinor, r.currency, { compact: true })}`;
    })
    .join(" · ");
  const title = `${count} package ${count === 1 ? "request" : "requests"} to confirm`;
  return (
    <section
      role="status"
      aria-label="Package purchases waiting for confirmation"
      className={cn(
        "flex items-center gap-3 rounded-xl border border-[#f3d6b5] bg-[#fdf4ea] py-2 pr-2 pl-3 text-sm dark:border-[rgba(233,146,57,0.32)] dark:bg-[rgba(233,146,57,0.10)]",
        className,
      )}
    >
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning-foreground">
        <PackageCheck className="size-4" aria-hidden />
      </span>
      {/* Whole strip is the tap target on a phone; the button is the desktop one. */}
      <Link
        to="/packages"
        className="flex min-w-0 flex-1 items-center gap-2 sm:pointer-events-none sm:gap-1"
      >
        <span className="shrink-0 font-bold text-warning-foreground">{title}</span>
        <span className="hidden min-w-0 truncate text-muted-foreground sm:inline">· {summary}</span>
        <span className="ml-auto flex shrink-0 items-center text-sm font-bold text-warning-foreground sm:hidden">
          Review <ChevronRight className="size-4" aria-hidden />
        </span>
      </Link>
      <Button asChild size="sm" variant="outline" className="hidden h-8 bg-card sm:inline-flex">
        <Link to="/packages">Review</Link>
      </Button>
    </section>
  );
}

function PendingRequestRow({ request }: { request: PackageRequest }) {
  const customer = useCustomer(request.customerId);
  const name = customer.data ? customerDisplayName(customer.data) : "A client";
  return (
    <li>
      <Link
        to="/packages"
        search={{ request: request.id }}
        className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/60"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {name} · {request.packageName}
          </span>
          <span className="block text-xs text-muted-foreground">
            {formatMoney(request.priceMinor, request.currency)} · asked{" "}
            {relativeTimeAgo(request.createdAt)}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-primary">Confirm</span>
      </Link>
    </li>
  );
}
