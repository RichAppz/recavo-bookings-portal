import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowRightLeft,
  Camera,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { LinkedRecordPhotosDialog } from "@/components/LinkedRecordPhotos";
import { AppShell } from "@/components/AppShell";
import {
  activeSortedFields,
  CustomerSearchPicker,
  DeleteLinkedRecordDialog,
  LinkedRecordFormDialog,
  OwnershipHistoryDialog,
  TransferLinkedRecordDialog,
  type LinkedRecordField,
} from "@/components/LinkedRecordDialogs";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
import { TableGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/api";
import {
  useCreateCustomerLinkedRecord,
  useLinkedRecordDefinition,
  useLinkedRecordsInfinite,
  usePatchLinkedRecord,
} from "@/lib/api/hooks";
import { Label } from "@/components/ui/label";
import {
  customerDisplayName,
  type Customer,
  type LinkedRecord,
  type LinkedRecordWithOwner,
} from "@/lib/api/types";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { ukDate } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { toast } from "sonner";

export const Route = createFileRoute("/vehicles")({
  head: () => ({
    meta: [
      { title: "Vehicles — RECAVO" },
      {
        name: "description",
        content: "Every vehicle on record across your clients, searchable in one place.",
      },
      { property: "og:title", content: "RECAVO Vehicles" },
      {
        property: "og:description",
        content: "Business-wide vehicle records with owners, transfers and history.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <VehiclesPage />
      </AppShell>
    </RequireAuth>
  ),
});

/** Short "values" preview: first few scalar field values, e.g. reg · make · model. */
function valuesSummary(values: LinkedRecord["values"]): string {
  return Object.values((values ?? {}) as Record<string, unknown>)
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .slice(0, 3)
    .map(String)
    .join(" · ");
}

function ownerName(owner: LinkedRecordWithOwner["owner"]): string {
  if (!owner) return "Unknown client";
  return [owner.firstName, owner.lastName ?? ""].join(" ").trim();
}

function VehiclesPage() {
  const tenant = useTenant();
  const term = tenant.terminology.linkedRecord;
  const lower = term.toLowerCase();
  const plural = lower.endsWith("s") ? term : `${term}s`;
  const pluralLower = plural.toLowerCase();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState<LinkedRecord | null>(null);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<LinkedRecord | null>(null);
  const [photosFor, setPhotosFor] = useState<LinkedRecord | null>(null);
  const [deletingFor, setDeletingFor] = useState<LinkedRecord | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Unlike the client-profile tab, this page has no implicit owner — the add
  // dialog starts with a client picker.
  const [addOwner, setAddOwner] = useState<Customer | null>(null);

  const definition = useLinkedRecordDefinition();
  const records = useLinkedRecordsInfinite({
    search: query.trim() || undefined,
    status: status !== "all" ? (status as "active" | "archived") : undefined,
  });
  const rows = records.items;

  const qc = useQueryClient();
  const patch = usePatchLinkedRecord(undefined);
  const create = useCreateCustomerLinkedRecord(addOwner?.id);
  const fields = activeSortedFields(
    (definition.data?.fields ?? []) as unknown as LinkedRecordField[],
  );
  const hasSchema = fields.length > 0;
  const canEdit = tenant.can(PERMISSIONS.CUSTOMER_UPDATE);

  // Resolve the transfer target from the live list so that after a 409 (stale
  // version) the refetched record — with its bumped version — flows into the
  // dialog and a retry can succeed.
  const transferring = transferringId
    ? (rows.find((r) => r.record.id === transferringId) ?? null)
    : null;

  const archive = async (r: LinkedRecord) => {
    await patch.mutateAsync({
      recordId: r.id,
      version: r.version,
      body: { status: "archived" },
    });
    invalidateOwnerRecords(r.customerId);
    toast.success(`${term} archived`);
  };

  const invalidateOwnerRecords = (customerId: string) => {
    // The owner's client-profile tab caches its own list; keep it in step.
    void qc.invalidateQueries({
      queryKey: queryKeys.customerLinkedRecords(tenant.businessId, customerId),
    });
  };

  return (
    <>
      <PageHeader
        title={plural}
        description={`Every ${lower} on record, across all your clients.`}
        actions={
          hasSchema ? (
            <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
              <Button
                onClick={() => {
                  setAddOwner(null);
                  setAddOpen(true);
                }}
              >
                <Plus className="size-4" /> Add {lower}
              </Button>
            </Can>
          ) : null
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="flex flex-wrap gap-3 border-b p-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={`Search by ${lower}, registration or owner`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">Any status</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {records.isLoading || definition.isLoading ? (
          <TableGhost />
        ) : records.isError ? (
          <div className="p-6">
            <EmptyState
              title={`Couldn't load ${pluralLower}`}
              description="Please try again shortly."
            />
          </div>
        ) : !definition.data?.definition ? (
          <div className="p-6">
            <EmptyState
              title={`No ${lower} schema yet`}
              description="Enable a record schema in Settings to start keeping records."
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={`No ${pluralLower} found`}
              description={`Try a different search, or add a ${lower} with the button above.`}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs text-muted-foreground">
                  <tr>
                    {[term, "Owner", "Updated", "Status", ""].map((h, i) => (
                      <th key={i} className="px-4 py-2.5 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map(({ record: r, owner }) => {
                    const summary = valuesSummary(r.values);
                    const openEdit = canEdit ? () => setEditing(r) : undefined;
                    return (
                      <tr
                        key={r.id}
                        role={openEdit ? "button" : undefined}
                        tabIndex={openEdit ? 0 : undefined}
                        aria-label={openEdit ? `Edit ${r.displayLabel}` : undefined}
                        onClick={openEdit}
                        onKeyDown={
                          openEdit
                            ? (e) => {
                                // Only when the row itself is focused — not when
                                // Enter lands on the owner link or the menu.
                                if (e.target !== e.currentTarget) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openEdit();
                                }
                              }
                            : undefined
                        }
                        className={
                          openEdit
                            ? "cursor-pointer transition-colors outline-none hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                            : "transition-colors hover:bg-secondary/50"
                        }
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium">{r.displayLabel}</p>
                          {summary && summary !== r.displayLabel ? (
                            <p className="truncate text-xs text-muted-foreground">{summary}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {owner ? (
                            <Link
                              to="/clients/$clientId"
                              params={{ clientId: owner.id }}
                              className="font-medium hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {ownerName(owner)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Unknown client</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {ukDate(r.updatedAt.slice(0, 10))}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        {/* Menu clicks (incl. the portaled items, which bubble
                            through React's tree) must not also open the editor. */}
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                aria-label={`Actions for ${r.displayLabel}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {owner ? (
                                <DropdownMenuItem asChild>
                                  <Link to="/clients/$clientId" params={{ clientId: owner.id }}>
                                    <UserRound className="size-4" /> View client
                                  </Link>
                                </DropdownMenuItem>
                              ) : null}
                              <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
                                <DropdownMenuItem onSelect={() => setEditing(r)}>
                                  <Pencil className="size-4" /> Edit
                                </DropdownMenuItem>
                                {r.status === "active" ? (
                                  <DropdownMenuItem onSelect={() => setTransferringId(r.id)}>
                                    <ArrowRightLeft className="size-4" /> Transfer to another client
                                  </DropdownMenuItem>
                                ) : null}
                              </Can>
                              <Can permission={PERMISSIONS.CUSTOMER_READ}>
                                <DropdownMenuItem onSelect={() => setPhotosFor(r)}>
                                  <Camera className="size-4" /> Photos
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setHistoryFor(r)}>
                                  <History className="size-4" /> Ownership history
                                </DropdownMenuItem>
                              </Can>
                              <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
                                {r.status === "active" ? (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      disabled={patch.isPending}
                                      onSelect={() => void archive(r)}
                                    >
                                      <Archive className="size-4" /> Archive
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onSelect={() => setDeletingFor(r)}
                                    >
                                      <Trash2 className="size-4" /> Delete
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                              </Can>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {records.hasNextPage ? (
              <div className="border-t p-4">
                <Button
                  variant="outline"
                  disabled={records.isFetchingNextPage}
                  onClick={() => void records.fetchNextPage()}
                >
                  {records.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <LinkedRecordFormDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        fields={fields}
        term={term}
        initial={
          editing
            ? {
                displayLabel: editing.displayLabel,
                values: (editing.values ?? {}) as Record<string, unknown>,
              }
            : undefined
        }
        submitting={patch.isPending}
        submitError={patch.error}
        onSubmit={async (data) => {
          if (!editing) return;
          await patch.mutateAsync({
            recordId: editing.id,
            version: editing.version,
            body: data,
          });
          invalidateOwnerRecords(editing.customerId);
          setEditing(null);
          toast.success(`${term} updated`);
        }}
      />

      <TransferLinkedRecordDialog
        record={transferring?.record ?? null}
        sourceCustomerId={transferring?.record.customerId ?? ""}
        term={term}
        onOpenChange={(o) => {
          if (!o) setTransferringId(null);
        }}
      />

      <OwnershipHistoryDialog
        record={historyFor}
        term={term}
        onOpenChange={(o) => {
          if (!o) setHistoryFor(null);
        }}
      />

      <DeleteLinkedRecordDialog
        record={deletingFor}
        term={term}
        onOpenChange={(o) => {
          if (!o) setDeletingFor(null);
        }}
      />

      <LinkedRecordPhotosDialog
        record={photosFor}
        term={term}
        onOpenChange={(o) => {
          if (!o) setPhotosFor(null);
        }}
      />

      <LinkedRecordFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        fields={fields}
        term={term}
        submitting={create.isPending}
        submitError={create.error}
        submitDisabled={!addOwner}
        ownerSlot={
          <div className="grid gap-2">
            <Label>
              Owner<span className="text-destructive"> *</span>
            </Label>
            <CustomerSearchPicker
              value={addOwner}
              onSelect={setAddOwner}
              placeholder="Search for the owning client…"
            />
            {!addOwner ? (
              <p className="text-xs text-muted-foreground">
                Every {lower} belongs to a client. Pick who owns this one.
              </p>
            ) : null}
          </div>
        }
        onSubmit={async (data) => {
          if (!addOwner) return;
          await create.mutateAsync(data);
          setAddOpen(false);
          toast.success(`${term} added for ${customerDisplayName(addOwner)}`);
        }}
      />
    </>
  );
}
