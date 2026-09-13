import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Plus, Settings } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CreateInvoiceDialog } from "@/components/CreateInvoiceDialog";
import { DeleteDraftInvoiceDialog } from "@/components/DeleteDraftInvoiceDialog";
import { InvoicesTable } from "@/components/InvoicesTable";
import { InvoicingUpgradeDialog } from "@/components/InvoicingUpgradeDialog";
import { EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { useCustomers } from "@/lib/api/hooks";
import { useInvoices, useInvoicingEntitled, type Invoice } from "@/lib/api/invoices";
import { customerDisplayName } from "@/lib/api/types";
import { formatMoney, isoDate } from "@/lib/format";
import {
  INVOICE_STATUSES,
  invoiceBalanceMinor,
  isInvoiceOverdue,
  visibleInvoices,
  type InvoiceStatus,
  type InvoiceStatusFilter,
} from "@/lib/invoices";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, RequirePermission, useTenant } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/invoices/")({
  head: () => ({
    meta: [
      { title: "Invoices — RECAVO" },
      {
        name: "description",
        content: "Numbered PDF invoices for jobs and one-off charges, with payment tracking.",
      },
      { property: "og:title", content: "RECAVO Invoices" },
      { property: "og:description", content: "Raise, send and track invoices for your business." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <RequirePermission permission={PERMISSIONS.INVOICE_READ}>
          <InvoicesPage />
        </RequirePermission>
      </AppShell>
    </RequireAuth>
  ),
});

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  void: "Void",
};

function InvoicesPage() {
  const tenant = useTenant();
  const [status, setStatus] = useState<InvoiceStatusFilter>("all");
  const [customerId, setCustomerId] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [deleting, setDeleting] = useState<Invoice | null>(null);

  const entitled = useInvoicingEntitled();
  const invoices = useInvoices({
    ...(status !== "all" ? { status } : {}),
    ...(customerId !== "all" ? { customerId } : {}),
    limit: 200,
  });
  const customers = useCustomers();
  const canManage = tenant.can(PERMISSIONS.INVOICE_MANAGE);
  const currency = tenant.business?.currency ?? "GBP";

  // "All statuses" hides voided invoices so a wrong one that was voided (and redone)
  // leaves the day-to-day view; the explicit "Void" filter brings them back.
  const list = useMemo(() => visibleInvoices(invoices.data ?? [], status), [invoices.data, status]);
  const totals = useMemo(() => {
    const today = isoDate(new Date());
    let outstanding = 0;
    let overdue = 0;
    let paidCount = 0;
    for (const inv of list) {
      if (inv.status === "issued") {
        const bal = invoiceBalanceMinor(inv);
        outstanding += bal;
        if (isInvoiceOverdue(inv, today)) overdue += bal;
      }
      if (inv.status === "paid") paidCount += 1;
    }
    return { outstanding, overdue, paidCount };
  }, [list]);

  const nameFor = (id: string) => {
    const c = customers.data?.items.find((x) => x.id === id);
    return c ? customerDisplayName(c) : undefined;
  };

  const startCreate = () => {
    if (entitled === false) setUpsellOpen(true);
    else setCreateOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Numbered PDF invoices for jobs and one-off charges."
        actions={
          <>
            <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
              <Button variant="outline" asChild>
                <Link to="/settings" search={{ tab: "payments" }}>
                  <Settings className="size-4" /> Invoicing settings
                </Link>
              </Button>
            </Can>
            {canManage ? (
              <Button
                onClick={startCreate}
                disabled={entitled === undefined}
                title={
                  entitled === false
                    ? "Invoicing isn’t on your plan yet — add the bolt-on to raise invoices."
                    : undefined
                }
              >
                <Plus className="size-4" /> New invoice
              </Button>
            ) : null}
          </>
        }
      />

      {entitled === false && canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed bg-primary-soft/40 px-4 py-3 text-sm">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
            <p>
              <span className="font-medium">Invoicing isn’t on your plan.</span> You can still view
              and download every invoice already issued. Add the bolt-on to raise new ones — or have
              jobs invoiced automatically when they’re marked attended.
            </p>
          </div>
          <Button size="sm" onClick={() => setUpsellOpen(true)}>
            Add invoicing
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding (shown)" value={formatMoney(totals.outstanding, currency)} />
        <StatCard label="Overdue (shown)" value={formatMoney(totals.overdue, currency)} />
        <StatCard label="Paid (shown)" value={String(totals.paidCount)} />
      </div>

      <SectionCard
        title="All invoices"
        description="Newest first"
        bodyClassName="p-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {(customers.data?.items ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {customerDisplayName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatusFilter)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {INVOICE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <InvoicesTable
          invoices={list}
          loading={invoices.isLoading}
          error={invoices.isError}
          customerName={nameFor}
          onDeleteDraft={canManage ? setDeleting : undefined}
          empty={
            <EmptyState
              icon={<FileText className="size-6" />}
              title={
                status === "all" && customerId === "all" ? "No invoices yet" : "Nothing matches"
              }
              description={
                status === "all" && customerId === "all"
                  ? canManage
                    ? "Raise one from a job in the booking panel, or start a blank invoice here."
                    : "Invoices raised for jobs and one-off charges will appear here."
                  : "Try a different status or client."
              }
              action={
                canManage && status === "all" && customerId === "all" ? (
                  <Button onClick={startCreate} disabled={entitled === undefined}>
                    <Plus className="size-4" /> New invoice
                  </Button>
                ) : null
              }
            />
          }
        />
      </SectionCard>

      <DeleteDraftInvoiceDialog
        invoice={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <InvoicingUpgradeDialog
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
        onEnabled={() => setCreateOpen(true)}
      />
    </>
  );
}
