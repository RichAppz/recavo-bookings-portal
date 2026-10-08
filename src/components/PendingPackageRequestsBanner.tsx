import { Link } from "@tanstack/react-router";
import { ArrowRight, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCustomer, usePackageRequests, type PackageRequest } from "@/lib/api/hooks";
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
 */
export function PendingPackageRequestsBanner({ className }: { className?: string }) {
  const tenant = useTenant();
  const canManage = tenant.can(PERMISSIONS.PACKAGE_MANAGE);
  const pending = usePackageRequests("pending", { enabled: canManage });
  const requests = pending.data ?? [];
  if (!canManage || requests.length === 0) return null;

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
