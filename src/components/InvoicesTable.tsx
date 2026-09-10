import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { TableGhost } from "@/components/ghost";
import { EmptyState, StatusBadge } from "@/components/ui-bits";
import type { Invoice } from "@/lib/api/invoices";
import { formatMoney, isoDate, ukDate } from "@/lib/format";
import { invoiceBalanceMinor, invoiceLinkedRecord, isInvoiceOverdue } from "@/lib/invoices";
import { cn } from "@/lib/utils";

/** "Auto" tag for invoices raised by the job-completion worker rather than a person. */
export function InvoiceOriginTag({ invoice }: { invoice: Pick<Invoice, "origin"> }) {
  if (invoice.origin !== "booking_completed") return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info"
      title="Issued automatically when the job was marked attended"
    >
      <Zap className="size-3" /> Auto
    </span>
  );
}

/** Status chip that also flags an unpaid invoice past its due date. */
export function InvoiceStatusBadge({
  invoice,
  className,
}: {
  invoice: Pick<Invoice, "status" | "dueDate" | "totalMinor" | "paidMinor">;
  className?: string;
}) {
  const overdue = isInvoiceOverdue(invoice, isoDate(new Date()));
  return <StatusBadge status={overdue ? "overdue" : invoice.status} className={className} />;
}

export function InvoiceNumber({ invoice }: { invoice: Pick<Invoice, "number" | "status"> }) {
  if (invoice.number) return <span className="font-mono text-xs">{invoice.number}</span>;
  return <span className="text-xs text-muted-foreground">Draft</span>;
}

/**
 * The invoices list shared by the Invoices page, a client's Invoices tab and the
 * job panel. Rows link through to the invoice; columns adapt to what the caller
 * already knows (no client column on a client's own tab).
 */
export function InvoicesTable({
  invoices,
  loading,
  error,
  showCustomer = true,
  customerName,
  empty,
  compact = false,
}: {
  invoices: readonly Invoice[] | undefined;
  loading?: boolean;
  error?: boolean;
  showCustomer?: boolean;
  /** Resolve a customer id to a display name; falls back to the frozen bill-to name. */
  customerName?: (customerId: string) => string | undefined;
  empty?: ReactNode;
  compact?: boolean;
}) {
  if (loading) return <TableGhost rows={compact ? 3 : 6} />;
  if (error) {
    return (
      <div className="p-6">
        <EmptyState title="Couldn't load invoices" description="Please try again shortly." />
      </div>
    );
  }
  const list = invoices ?? [];
  if (list.length === 0) {
    return <div className="p-6">{empty ?? <EmptyState title="No invoices yet" />}</div>;
  }

  const headers = [
    "Number",
    ...(showCustomer ? ["Client"] : []),
    "Issued",
    "Due",
    "Total",
    "Balance",
    "Status",
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs text-muted-foreground">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {list.map((inv) => {
            const balance = invoiceBalanceMinor(inv);
            const record = invoiceLinkedRecord(inv);
            return (
              <tr key={inv.id} className="hover:bg-secondary/50">
                <td className={cn("px-4 whitespace-nowrap", compact ? "py-2" : "py-3")}>
                  <Link
                    to="/invoices/$invoiceId"
                    params={{ invoiceId: inv.id }}
                    className="inline-flex items-center gap-2 font-medium hover:underline"
                  >
                    <InvoiceNumber invoice={inv} />
                    <InvoiceOriginTag invoice={inv} />
                  </Link>
                  {record ? (
                    <p
                      className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground"
                      title={`${record.label}: ${record.value}`}
                    >
                      {record.value}
                    </p>
                  ) : null}
                </td>
                {showCustomer ? (
                  <td className={cn("px-4", compact ? "py-2" : "py-3")}>
                    {customerName?.(inv.customerId) ?? inv.billTo?.name ?? "Client"}
                  </td>
                ) : null}
                <td
                  className={cn(
                    "px-4 whitespace-nowrap text-muted-foreground",
                    compact ? "py-2" : "py-3",
                  )}
                >
                  {inv.issueDate ? ukDate(inv.issueDate) : "—"}
                </td>
                <td
                  className={cn(
                    "px-4 whitespace-nowrap text-muted-foreground",
                    compact ? "py-2" : "py-3",
                  )}
                >
                  {inv.dueDate ? ukDate(inv.dueDate) : "—"}
                </td>
                <td className={cn("px-4 tabular-nums font-medium", compact ? "py-2" : "py-3")}>
                  {formatMoney(inv.totalMinor, inv.currency)}
                </td>
                <td
                  className={cn(
                    "px-4 tabular-nums",
                    compact ? "py-2" : "py-3",
                    balance > 0 && inv.status === "issued" ? "" : "text-muted-foreground",
                  )}
                >
                  {inv.status === "void" ? "—" : formatMoney(balance, inv.currency)}
                </td>
                <td className={cn("px-4", compact ? "py-2" : "py-3")}>
                  <InvoiceStatusBadge invoice={inv} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
