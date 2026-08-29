import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  change,
  hint,
  icon,
}: {
  label: string;
  value: string;
  change?: number;
  hint?: string;
  icon?: ReactNode;
}) {
  const positive = (change ?? 0) >= 0;
  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? (
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {change !== undefined ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
              positive ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive",
            )}
          >
            {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {positive ? "+" : ""}
            {change}%
          </span>
        ) : null}
        {hint ? <span className="text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}

const statusStyles: Record<string, string> = {
  confirmed: "bg-primary-soft text-primary",
  completed: "bg-success-soft text-success",
  succeeded: "bg-success-soft text-success",
  attended: "bg-success-soft text-success",
  paid: "bg-success-soft text-success",
  active: "bg-success-soft text-success",
  entitled: "bg-success-soft text-success",
  connected: "bg-success-soft text-success",
  awaiting_payment: "bg-warning-soft text-warning-foreground",
  pending: "bg-warning-soft text-warning-foreground",
  held: "bg-warning-soft text-warning-foreground",
  draft: "bg-warning-soft text-warning-foreground",
  trialing: "bg-warning-soft text-warning-foreground",
  trial: "bg-warning-soft text-warning-foreground",
  past_due: "bg-warning-soft text-warning-foreground",
  grace: "bg-warning-soft text-warning-foreground",
  invited: "bg-warning-soft text-warning-foreground",
  processing: "bg-warning-soft text-warning-foreground",
  scheduled: "bg-info-soft text-info",
  unknown: "bg-info-soft text-info",
  cancelled: "bg-muted text-muted-foreground",
  cancelled_by_customer: "bg-muted text-muted-foreground",
  cancelled_by_business: "bg-muted text-muted-foreground",
  inactive: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  ended: "bg-muted text-muted-foreground",
  used: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
  late_cancelled: "bg-warning-soft text-warning-foreground",
  late_cancellation: "bg-warning-soft text-warning-foreground",
  pending_counsel_review: "bg-warning-soft text-warning-foreground",
  no_show: "bg-destructive-soft text-destructive",
  failed: "bg-destructive-soft text-destructive",
  suspended: "bg-destructive-soft text-destructive",
  restricted: "bg-destructive-soft text-destructive",
  disputed: "bg-destructive-soft text-destructive",
  anonymised: "bg-destructive-soft text-destructive",
  over_limit: "bg-destructive-soft text-destructive",
  refunded: "bg-secondary text-secondary-foreground",
  partially_refunded: "bg-secondary text-secondary-foreground",
};

const statusLabels: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  late_cancellation: "Late cancellation",
  late_cancelled: "Late cancellation",
  cancelled_by_customer: "Cancelled by client",
  cancelled_by_business: "Cancelled by business",
  no_show: "No-show",
  partially_refunded: "Partially refunded",
  past_due: "Past due",
  pending_counsel_review: "Needs legal review",
  over_limit: "Over limit",
  grace_over_limit: "Grace (over limit)",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const label =
    statusLabels[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        statusStyles[status] ?? "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("surface-card flex min-w-0 flex-col", className)}>
      {title ? (
        <header className="flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={cn("min-w-0 p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PersonAvatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold text-secondary-foreground",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" loading="lazy" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      {icon ? (
        <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
