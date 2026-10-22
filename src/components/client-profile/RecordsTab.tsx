import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRightLeft,
  Camera,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AddBookingModal } from "@/components/AddBookingModal";
import { TableGhost } from "@/components/ghost";
import { LinkedRecordPhotosDialog } from "@/components/LinkedRecordPhotos";
import {
  activeSortedFields,
  DeleteLinkedRecordDialog,
  OwnershipHistoryDialog,
  summariseValues,
  TransferLinkedRecordDialog,
  type LinkedRecordField,
} from "@/components/LinkedRecordDialogs";
import { ProfileCard, rowClass, TonePill } from "@/components/client-profile/parts";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { VehicleFormDrawer, type VehicleFormMode } from "@/components/vehicles/VehicleFormDrawer";
import { VehiclePanel } from "@/components/vehicles/VehiclePanel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCustomer,
  useCustomerLinkedRecords,
  useLinkedRecordDefinition,
  usePatchLinkedRecord,
} from "@/lib/api/hooks";
import type { Booking, LinkedRecord } from "@/lib/api/types";
import { isCancelledBooking, shortDate } from "@/lib/client-profile";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { registrationOf, vehicleSubline, vehicleTitle } from "@/lib/vehicles";

export function RecordsTab({
  customerId,
  disabled,
  focusRecordId,
  bookings,
  timezone,
  nowMs,
  onShowBookings,
}: {
  customerId: string;
  disabled: boolean;
  /** Record to open on arrival (from a booking's vehicle link). */
  focusRecordId?: string;
  bookings: readonly Booking[];
  timezone: string;
  nowMs: number;
  onShowBookings: (record: { id: string; label: string }) => void;
}) {
  const tenant = useTenant();
  const term = tenant.terminology.linkedRecord;
  const records = useCustomerLinkedRecords(customerId);
  const definition = useLinkedRecordDefinition();
  const owner = useCustomer(customerId);
  const patch = usePatchLinkedRecord(customerId);

  const fields = useMemo<LinkedRecordField[]>(
    () => activeSortedFields((definition.data?.fields ?? []) as unknown as LinkedRecordField[]),
    [definition.data],
  );
  const hasSchema = fields.length > 0;
  const canEdit = tenant.can(PERMISSIONS.CUSTOMER_UPDATE);

  const [form, setForm] = useState<VehicleFormMode | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bookFor, setBookFor] = useState<LinkedRecord | null>(null);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<LinkedRecord | null>(null);
  const [photosFor, setPhotosFor] = useState<LinkedRecord | null>(null);
  const [deletingFor, setDeletingFor] = useState<LinkedRecord | null>(null);

  // Arriving from a booking's vehicle link: open that record's panel.
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => {
    if (!focusRecordId || focused === focusRecordId) return;
    setFocused(focusRecordId);
    setOpenId(focusRecordId);
  }, [focusRecordId, focused]);
  const editRecord = (r: LinkedRecord) => setForm({ kind: "edit", record: r });

  // Resolve the transfer target from the live list so that after a 409 (stale
  // version) the refetched record — with its bumped version — flows into the
  // dialog and a retry can succeed.
  const transferring = transferringId
    ? ((records.data ?? []).find((r) => r.id === transferringId) ?? null)
    : null;

  const bookingStats = useMemo(() => {
    const stats = new Map<string, { count: number; last: string | null }>();
    for (const b of bookings) {
      if (!b.linkedRecordId || isCancelledBooking(b)) continue;
      const s = stats.get(b.linkedRecordId) ?? { count: 0, last: null };
      s.count += 1;
      if (Date.parse(b.start) <= nowMs && (!s.last || b.start > s.last)) s.last = b.start;
      stats.set(b.linkedRecordId, s);
    }
    return stats;
  }, [bookings, nowMs]);

  return (
    <ProfileCard
      title={`${term} records`}
      note={`Attach a ${term.toLowerCase()} when booking so its history builds up here.`}
      aside={
        <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
          <Button
            size="sm"
            className="h-[30px]"
            disabled={disabled || !hasSchema}
            onClick={() =>
              setForm({ kind: "add", owner: owner.data ?? null, lockOwner: Boolean(owner.data) })
            }
          >
            <Plus className="size-4" /> Add {term.toLowerCase()}
          </Button>
        </Can>
      }
    >
      {records.isLoading || definition.isLoading ? (
        <TableGhost rows={3} />
      ) : (records.data ?? []).length === 0 ? (
        <p className={cn(rowClass, "text-sm text-muted-foreground")}>
          {hasSchema
            ? `No ${term.toLowerCase()} records. Add a ${term.toLowerCase()} so it can be attached when booking.`
            : `No ${term.toLowerCase()} schema yet. Enable a record schema in Settings before adding records for this client.`}
        </p>
      ) : (
        <ul>
          {(records.data ?? []).map((r) => {
            const values = (r.values ?? {}) as Record<string, unknown>;
            const reg = registrationOf(values, fields);
            const summary = reg
              ? vehicleSubline(values, fields, { mileage: true })
              : summariseValues(fields, values);
            const openPanel = () => setOpenId(r.id);
            const stats = bookingStats.get(r.id);
            return (
              <li
                key={r.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${r.displayLabel}`}
                onClick={openPanel}
                onKeyDown={(e) => {
                  // Only when the row itself is focused — not the menu.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPanel();
                  }
                }}
                className={cn(
                  rowClass,
                  "flex cursor-pointer flex-wrap items-center justify-between gap-3 transition-colors outline-none hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  r.status !== "active" && "opacity-55",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {reg ? <NumberPlate registration={reg} size="row" className="shrink-0" /> : null}
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-bold">
                      {reg ? vehicleTitle(r, fields) : r.displayLabel}
                    </p>
                    {summary ? (
                      <p className="truncate text-[13px] text-muted-foreground">{summary}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Updated {shortDate(r.updatedAt, timezone)}
                      {stats ? (
                        <>
                          {" · "}
                          <button
                            type="button"
                            className="cursor-pointer font-semibold text-foreground/70 underline-offset-2 hover:text-foreground hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              onShowBookings({ id: r.id, label: r.displayLabel });
                            }}
                          >
                            {stats.last ? `Last booked ${shortDate(stats.last, timezone)} · ` : ""}
                            {stats.count} booking{stats.count === 1 ? "" : "s"}
                          </button>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                {/* Menu clicks (incl. the portaled items, which bubble through
                    React's tree) must not also open the panel. */}
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {r.status !== "active" ? <TonePill tone="grey">Archived</TonePill> : null}
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
                      <Can permission={PERMISSIONS.CUSTOMER_UPDATE}>
                        <DropdownMenuItem disabled={disabled} onSelect={() => editRecord(r)}>
                          <Pencil className="size-4" /> Edit
                        </DropdownMenuItem>
                        {r.status === "active" ? (
                          <DropdownMenuItem
                            disabled={disabled}
                            onSelect={() => setTransferringId(r.id)}
                          >
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
                              disabled={disabled || patch.isPending}
                              onSelect={async () => {
                                await patch.mutateAsync({
                                  recordId: r.id,
                                  version: r.version,
                                  body: { status: "archived" },
                                });
                                toast.success(`${term} archived`);
                              }}
                            >
                              <Archive className="size-4" /> Archive
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={disabled}
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
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {form ? (
        <VehicleFormDrawer
          open
          onOpenChange={(o) => {
            if (!o) setForm(null);
          }}
          mode={form}
          onSaved={(record, { book, created }) => {
            if (book) setBookFor(record);
            else if (created) setOpenId(record.id);
          }}
        />
      ) : null}

      <VehiclePanel
        recordId={openId}
        initial={(records.data ?? []).find((r) => r.id === openId) ?? null}
        readOnly={disabled}
        onClose={() => setOpenId(null)}
      />

      {bookFor ? (
        <AddBookingModal
          key={bookFor.id}
          open
          onOpenChange={(o) => {
            if (!o) setBookFor(null);
          }}
          defaultCustomerId={customerId}
          defaultLinkedRecordId={bookFor.id}
        />
      ) : null}

      <TransferLinkedRecordDialog
        record={transferring}
        sourceCustomerId={customerId}
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
    </ProfileCard>
  );
}
