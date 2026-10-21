import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AddBookingModal } from "@/components/AddBookingModal";
import { BookingPanel } from "@/components/BookingPanel";
import { AVATAR_TINTS, TonePill } from "@/components/client-profile/parts";
import {
  DeleteLinkedRecordDialog,
  TransferLinkedRecordDialog,
} from "@/components/LinkedRecordDialogs";
import { LinkedRecordPhotosDialog, PhotoTile } from "@/components/LinkedRecordPhotos";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { useVehicleFields } from "@/components/vehicles/use-vehicles-data";
import { VehicleFormDrawer } from "@/components/vehicles/VehicleFormDrawer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  useClientStatsBookings,
  useCustomer,
  useDeleteFile,
  useFollowUps,
  useLinkedRecord,
  useLinkedRecordOwnership,
  useMemberships,
  useOwnerFiles,
  usePatchLinkedRecord,
  usePlanFeature,
  useStaffList,
} from "@/lib/api/hooks";
import {
  customerDisplayName,
  userDisplayName,
  type Booking,
  type LinkedRecord,
  type LinkedRecordWithOwner,
} from "@/lib/api/types";
import { isMaskedContact, type Tone } from "@/lib/client-profile";
import { avatarTintIndex } from "@/lib/clients-list";
import { formatInTz, formatMoney, initials } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import {
  conditionField,
  detailFields,
  dueByRecord,
  dueTitle,
  EMPTY_VEHICLE_STATS,
  fuelField,
  mileageText,
  registrationField,
  registrationOf,
  VEHICLE_JOB_STATUS_LABELS,
  vehicleJobs,
  vehicleJobStatus,
  vehicleStatsById,
  vehicleSubline,
  vehicleTitle,
  type VehicleField,
  type VehicleJobStatus,
} from "@/lib/vehicles";

const JOB_TONE: Record<VehicleJobStatus, Tone> = {
  booked: "blue",
  done: "green",
  cancelled: "grey",
  no_show: "red",
  past: "grey",
};

/** Keys shown elsewhere in the panel, so "Other details" skips them. */
const SHOWN_KEYS = new Set(["make", "model", "year", "colour", "color", "mileage"]);

/**
 * The vehicle panel (design spec §4): everything about one vehicle in a right-hand
 * drawer, full screen on a phone. Self-contained, so any screen can open it with
 * just an id: edit, transfer, archive, delete, photos and booking all happen here.
 */
export function VehiclePanel({
  recordId,
  initial,
  onClose,
  existing,
  onDeleted,
  readOnly = false,
}: {
  recordId: string | null;
  /** View only (e.g. an anonymised owner): no edit, transfer or booking. */
  readOnly?: boolean;
  /** The row the list already has, so the panel paints before the fetch lands. */
  initial?: LinkedRecord | null;
  onClose: () => void;
  existing?: readonly LinkedRecordWithOwner[];
  onDeleted?: () => void;
}) {
  const tenant = useTenant();
  const navigate = useNavigate();
  const term = tenant.terminology.linkedRecord || "Vehicle";
  const lower = term.toLowerCase();
  const timeZone = tenant.business?.defaultTimezone ?? "Europe/London";
  const currency = tenant.business?.currency ?? "GBP";
  const canEdit = !readOnly && tenant.can(PERMISSIONS.CUSTOMER_UPDATE);
  const canBook = !readOnly && tenant.can(PERMISSIONS.BOOKING_CREATE);
  const canMoney = tenant.can(PERMISSIONS.PAYMENT_READ);

  const open = recordId !== null;
  const fetched = useLinkedRecord(recordId ?? undefined);
  const record = fetched.data ?? (initial && initial.id === recordId ? initial : null);
  const { fields } = useVehicleFields();
  const owner = useCustomer(record?.customerId);
  const ownership = useLinkedRecordOwnership(open ? (recordId ?? undefined) : undefined);
  const memberships = useMemberships();
  const staff = useStaffList();
  const bookings = useClientStatsBookings(open);
  const followUps = useFollowUps({
    status: ["scheduled", "sent"],
    customerId: record?.customerId,
    enabled: Boolean(record),
  });
  const patch = usePatchLinkedRecord(record?.customerId);

  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [booking, setBooking] = useState<{ serviceId?: string } | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const childOpen =
    editOpen || transferOpen || deleteOpen || photosOpen || booking !== null || bookingId !== null;

  const nowMs = Date.now();
  const allBookings = bookings.data?.bookings ?? [];
  const stats = record
    ? (vehicleStatsById(allBookings, nowMs).get(record.id) ?? EMPTY_VEHICLE_STATS)
    : EMPTY_VEHICLE_STATS;
  const jobs = record ? vehicleJobs(allBookings, record.id, nowMs) : [];
  const due = record ? (dueByRecord(followUps.items).get(record.id) ?? null) : null;

  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of memberships.data ?? []) {
      const name = userDisplayName(m.user, "");
      if (m.userId && name) map.set(m.userId, name);
    }
    return map;
  }, [memberships.data]);
  const staffNames = useMemo(
    () => new Map((staff.data ?? []).map((s) => [s.id, s.displayName])),
    [staff.data],
  );

  const values = (record?.values ?? {}) as Record<string, unknown>;
  const reg = record ? registrationOf(values, fields) : null;
  const title = record ? vehicleTitle(record, fields) : "";
  const subline = vehicleSubline(values, fields, { mileage: true });
  const archived = record?.status === "archived";
  const currentOwnership = (ownership.data ?? []).find((o) => o.endedAt === null);

  const day = (
    iso: string,
    opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
  ) => formatInTz(iso, timeZone, opts);

  const setArchived = async (next: boolean) => {
    if (!record) return;
    await patch.mutateAsync({
      recordId: record.id,
      version: record.version,
      body: { status: next ? "archived" : "active" },
    });
    toast.success(next ? `${term} archived` : `${term} restored`);
  };

  const openAllJobs = () => {
    if (!record) return;
    onClose();
    void navigate({
      to: "/clients/$clientId",
      params: { clientId: record.customerId },
      search: { tab: "bookings", record: record.id },
    });
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          // Dialogs opened from the panel sit on top of it; focus moving into them
          // reads as an outside interaction, which mustn't close the panel.
          if (!o && !childOpen) onClose();
        }}
      >
        <SheetContent
          side="right"
          className={cn(
            "flex w-full flex-col gap-0 p-0 sm:max-w-[480px]",
            record && "[&>button.absolute]:hidden",
          )}
        >
          {!record ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <SheetTitle className="sr-only">{term}</SheetTitle>
              <SheetDescription className="sr-only">Loading</SheetDescription>
              {fetched.isError ? (
                <p className="px-6 text-center text-sm">
                  Couldn't load this {lower}. It may have been deleted.
                </p>
              ) : (
                <Loader2 className="size-5 animate-spin" />
              )}
            </div>
          ) : (
            <>
              <header className="flex items-start gap-3 border-b px-6 pt-6 pb-4">
                <div className="grid min-w-0 flex-1 gap-2">
                  {reg ? <NumberPlate registration={reg} size="large" className="w-fit" /> : null}
                  <SheetTitle className="truncate text-[22px] leading-tight font-extrabold tracking-tight">
                    {title}
                  </SheetTitle>
                  <SheetDescription className={cn("text-[13px]", !subline && "sr-only")}>
                    {subline || `${term} details`}
                  </SheetDescription>
                  {archived ? (
                    <TonePill tone="grey" className="w-fit">
                      Archived
                    </TonePill>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-9"
                          aria-label={`Actions for ${title}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                          <Pencil className="size-4" /> Edit
                        </DropdownMenuItem>
                        {!archived ? (
                          <DropdownMenuItem onSelect={() => setTransferOpen(true)}>
                            <ArrowRightLeft className="size-4" /> Transfer to another client
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={patch.isPending}
                          onSelect={() => void setArchived(!archived)}
                        >
                          {archived ? (
                            <>
                              <ArchiveRestore className="size-4" /> Unarchive
                            </>
                          ) : (
                            <>
                              <Archive className="size-4" /> Archive
                            </>
                          )}
                        </DropdownMenuItem>
                        {!archived ? (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeleteOpen(true)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9"
                    aria-label="Close"
                    onClick={onClose}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </header>

              <div className="no-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 py-5">
                <OwnerCard
                  customerId={record.customerId}
                  name={owner.data ? customerDisplayName(owner.data) : null}
                  since={currentOwnership ? day(currentOwnership.startedAt) : null}
                  phone={
                    owner.data?.phoneDisplay && !isMaskedContact(owner.data.phoneDisplay)
                      ? owner.data.phoneDisplay
                      : null
                  }
                  onNavigate={onClose}
                />

                <div className={cn("grid gap-2", canMoney ? "grid-cols-3" : "grid-cols-2")}>
                  <Fact label="Jobs" value={bookings.isLoading ? "…" : String(stats.jobs)} />
                  {canMoney ? (
                    <Fact
                      label="Spent"
                      value={
                        bookings.isLoading
                          ? "…"
                          : formatMoney(stats.spentMinor, currency, { compact: true })
                      }
                    />
                  ) : null}
                  <Fact
                    label="Last in"
                    value={
                      bookings.isLoading
                        ? "…"
                        : stats.lastJob
                          ? day(stats.lastJob.at, {
                              day: "numeric",
                              month: "short",
                              year: "2-digit",
                            })
                          : "Never"
                    }
                  />
                </div>

                {due ? (
                  <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-[13px] text-warning-foreground">
                    <p className="min-w-0 flex-1">
                      <span className="font-bold">
                        {dueTitle(due)} due {day(due.dueAt, { day: "numeric", month: "short" })}.
                      </span>
                      {due.lastDoneAt ? ` Last done ${day(due.lastDoneAt)}.` : null}
                    </p>
                    {canBook && !archived ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 bg-background"
                        onClick={() => setBooking({ serviceId: due.serviceId ?? undefined })}
                      >
                        Book
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                <PanelSection
                  title="Jobs"
                  aside={
                    jobs.length > 0 ? (
                      <button
                        type="button"
                        onClick={openAllJobs}
                        className="cursor-pointer text-[13px] font-bold text-foreground/70 hover:text-foreground"
                      >
                        All {jobs.length} ›
                      </button>
                    ) : null
                  }
                >
                  {bookings.isLoading ? (
                    <p className="text-[13px] text-muted-foreground">Loading jobs…</p>
                  ) : jobs.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                      No jobs for this {lower} yet.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-xl border">
                      {jobs.slice(0, 4).map((b) => (
                        <JobRow
                          key={b.id}
                          booking={b}
                          status={vehicleJobStatus(b, nowMs)}
                          staffName={b.staffId ? (staffNames.get(b.staffId) ?? null) : null}
                          paid={
                            canMoney && (b.paidMinor ?? 0) > 0
                              ? `${formatMoney(b.paidMinor ?? 0, b.currency ?? currency, { compact: true })} paid`
                              : null
                          }
                          timeZone={timeZone}
                          onOpen={() => setBookingId(b.id)}
                        />
                      ))}
                    </ul>
                  )}
                </PanelSection>

                <PhotosStrip record={record} onOpenAll={() => setPhotosOpen(true)} />

                <ConditionSection
                  record={record}
                  fields={fields}
                  canEdit={canEdit}
                  updatedBy={memberNames.get(record.updatedBy) ?? null}
                  updatedAt={day(record.updatedAt, { day: "numeric", month: "short" })}
                />

                <PanelSection title="Ownership">
                  {ownership.isLoading ? (
                    <p className="text-[13px] text-muted-foreground">Loading…</p>
                  ) : (ownership.data ?? []).length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">No ownership history yet.</p>
                  ) : (
                    <ol className="grid gap-3">
                      {[...(ownership.data ?? [])].reverse().map((o) => (
                        <li key={o.id} className="grid gap-0.5 border-l-2 pl-3">
                          <span className="flex items-center gap-2">
                            <OwnerName customerId={o.customerId} onNavigate={onClose} />
                            {o.endedAt === null ? <TonePill tone="green">Current</TonePill> : null}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {o.endedAt
                              ? `${day(o.startedAt)} to ${day(o.endedAt)}`
                              : `From ${day(o.startedAt)}`}
                            {memberNames.get(o.assignedBy)
                              ? ` · added by ${memberNames.get(o.assignedBy)}`
                              : null}
                            {o.reason ? ` · “${o.reason}”` : null}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </PanelSection>

                <OtherFields values={values} fields={fields} />
              </div>

              <footer className="flex gap-2 border-t px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
                {canEdit ? (
                  <Button
                    variant="outline"
                    className="flex-1 max-sm:h-12"
                    onClick={() => setEditOpen(true)}
                  >
                    Edit
                  </Button>
                ) : null}
                {canBook && !archived ? (
                  <Button className="flex-1 max-sm:h-12" onClick={() => setBooking({})}>
                    Book this {lower}
                  </Button>
                ) : null}
              </footer>
            </>
          )}
        </SheetContent>
      </Sheet>

      {record ? (
        <>
          <VehicleFormDrawer
            open={editOpen}
            onOpenChange={setEditOpen}
            mode={{ kind: "edit", record }}
            existing={existing}
          />
          <TransferLinkedRecordDialog
            record={transferOpen ? record : null}
            sourceCustomerId={record.customerId}
            term={term}
            onOpenChange={(o) => {
              if (!o) setTransferOpen(false);
            }}
          />
          <DeleteLinkedRecordDialog
            record={deleteOpen ? record : null}
            term={term}
            onOpenChange={(o) => {
              if (!o) setDeleteOpen(false);
            }}
            onDone={(outcome) => {
              if (outcome === "deleted") {
                onClose();
                onDeleted?.();
              }
            }}
          />
          <LinkedRecordPhotosDialog
            record={photosOpen ? record : null}
            term={term}
            onOpenChange={(o) => {
              if (!o) setPhotosOpen(false);
            }}
          />
          {booking ? (
            <AddBookingModal
              key={`${record.id}-${booking.serviceId ?? "any"}`}
              open
              onOpenChange={(o) => {
                if (!o) setBooking(null);
              }}
              defaultCustomerId={record.customerId}
              defaultLinkedRecordId={record.id}
              defaultServiceId={booking.serviceId}
            />
          ) : null}
        </>
      ) : null}
      <BookingPanel bookingId={bookingId} onClose={() => setBookingId(null)} />
    </>
  );
}

function PanelSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-extrabold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
      <p className="text-[11.5px] font-bold text-muted-foreground">{label}</p>
      <p className="truncate text-[17px] font-extrabold">{value}</p>
    </div>
  );
}

function OwnerCard({
  customerId,
  name,
  since,
  phone,
  onNavigate,
}: {
  customerId: string;
  name: string | null;
  since: string | null;
  phone: string | null;
  onNavigate: () => void;
}) {
  const meta = [since ? `Since ${since}` : null, phone].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
      <span
        aria-hidden
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
          AVATAR_TINTS[avatarTintIndex(customerId)],
        )}
      >
        {name ? initials(name) : "…"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">
          Owner
        </span>
        <span className="block truncate text-sm font-bold">{name ?? "Loading…"}</span>
        {meta ? <span className="block truncate text-xs text-muted-foreground">{meta}</span> : null}
      </span>
      <Link
        to="/clients/$clientId"
        params={{ clientId: customerId }}
        onClick={onNavigate}
        className="shrink-0 text-[13px] font-bold text-primary hover:underline"
      >
        Profile ›
      </Link>
    </div>
  );
}

function OwnerName({ customerId, onNavigate }: { customerId: string; onNavigate: () => void }) {
  const customer = useCustomer(customerId);
  return (
    <Link
      to="/clients/$clientId"
      params={{ clientId: customerId }}
      onClick={onNavigate}
      className="text-sm font-bold hover:underline"
    >
      {customer.data
        ? customerDisplayName(customer.data)
        : customer.isError
          ? "Former client"
          : "…"}
    </Link>
  );
}

function JobRow({
  booking,
  status,
  staffName,
  paid,
  timeZone,
  onOpen,
}: {
  booking: Booking;
  status: VehicleJobStatus;
  staffName: string | null;
  paid: string | null;
  timeZone: string;
  onOpen: () => void;
}) {
  const upcoming = status === "booked";
  const meta = [staffName, paid].filter(Boolean).join(" · ");
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/50"
      >
        <span className="w-14 shrink-0 leading-tight">
          <span className="block text-[13px] font-bold">
            {formatInTz(booking.start, timeZone, { day: "numeric", month: "short" })}
          </span>
          <span className="block text-[11.5px] text-muted-foreground">
            {upcoming ? "Upcoming" : formatInTz(booking.start, timeZone, { year: "numeric" })}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">
            {booking.serviceSnapshot.name}
          </span>
          {meta ? (
            <span className="block truncate text-xs text-muted-foreground">{meta}</span>
          ) : null}
        </span>
        <TonePill tone={JOB_TONE[status]}>{VEHICLE_JOB_STATUS_LABELS[status]}</TonePill>
      </button>
    </li>
  );
}

function PhotosStrip({ record, onOpenAll }: { record: LinkedRecord; onOpenAll: () => void }) {
  const tenant = useTenant();
  const hasPhotos = usePlanFeature("custom_records.images");
  const owner = { ownerType: "linked_record" as const, ownerId: record.id };
  const files = useOwnerFiles(hasPhotos ? owner : undefined);
  const deleteFile = useDeleteFile(owner);
  const canManage = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  if (!hasPhotos) return null;
  const items = files.data ?? [];
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;
  return (
    <PanelSection
      title="Photos"
      aside={
        canManage ? (
          <button
            type="button"
            onClick={onOpenAll}
            className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-bold text-primary"
          >
            <Plus className="size-3.5" /> Add
          </button>
        ) : null
      }
    >
      {files.isLoading ? (
        <p className="text-[13px] text-muted-foreground">Loading photos…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {shown.map((f, i) => (
            <div key={f.id} className="relative">
              <PhotoTile
                file={f}
                canDelete={canManage}
                deleting={deleteFile.isPending && deleteFile.variables === f.id}
                onDelete={() =>
                  deleteFile.mutate(f.id, { onSuccess: () => toast.success("Photo removed") })
                }
              />
              {i === shown.length - 1 && extra > 0 ? (
                <button
                  type="button"
                  onClick={onOpenAll}
                  aria-label={`See all ${items.length} photos`}
                  className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-xl bg-black/55 text-lg font-extrabold text-white"
                >
                  +{extra}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function ConditionSection({
  record,
  fields,
  canEdit,
  updatedBy,
  updatedAt,
}: {
  record: LinkedRecord;
  fields: readonly VehicleField[];
  canEdit: boolean;
  updatedBy: string | null;
  updatedAt: string;
}) {
  const field = conditionField(fields);
  const patch = usePatchLinkedRecord(record.customerId);
  const [draft, setDraft] = useState<string | null>(null);
  if (!field) return null;
  const values = (record.values ?? {}) as Record<string, unknown>;
  const current =
    typeof values[field.fieldKey] === "string" ? (values[field.fieldKey] as string) : "";

  const save = async () => {
    if (draft === null) return;
    await patch.mutateAsync({
      recordId: record.id,
      version: record.version,
      body: { values: { ...values, [field.fieldKey]: draft.trim() || null } },
    });
    setDraft(null);
    toast.success("Condition notes saved");
  };

  return (
    <PanelSection
      title="Condition"
      aside={
        canEdit && draft === null ? (
          <button
            type="button"
            onClick={() => setDraft(current)}
            className="cursor-pointer text-[13px] font-bold text-primary"
          >
            {current ? "Edit" : "Add notes"}
          </button>
        ) : null
      }
    >
      {draft !== null ? (
        <div className="grid gap-2">
          <Textarea
            autoFocus
            rows={3}
            value={draft}
            maxLength={field.constraints?.maxLength}
            aria-label={field.label}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDraft(null)}
              disabled={patch.isPending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={patch.isPending}>
              {patch.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : current ? (
        <div className="grid gap-1">
          <p className="text-[13.5px] whitespace-pre-wrap">{current}</p>
          <p className="text-xs text-muted-foreground">
            Updated {updatedAt}
            {updatedBy ? ` by ${updatedBy}` : null}
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">No condition notes.</p>
      )}
    </PanelSection>
  );
}

function OtherFields({
  values,
  fields,
}: {
  values: Record<string, unknown>;
  fields: readonly VehicleField[];
}) {
  const fuel = fuelField(fields);
  const reg = registrationField(fields);
  const rows = detailFields(fields)
    .filter((f) => f !== fuel && f !== reg && !SHOWN_KEYS.has(f.fieldKey))
    .map((f) => ({ f, text: displayValue(f, values[f.fieldKey]) }))
    .filter((r) => r.text);
  const mileage = mileageText(values.mileage);
  if (rows.length === 0 && !mileage) return null;
  return (
    <PanelSection title="Other details">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
        {mileage ? (
          <>
            <dt className="text-muted-foreground">Mileage</dt>
            <dd className="min-w-0 truncate font-semibold">{mileage}</dd>
          </>
        ) : null}
        {rows.map(({ f, text }) => (
          <div key={f.fieldKey} className="contents">
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="min-w-0 font-semibold break-words">{text}</dd>
          </div>
        ))}
      </dl>
    </PanelSection>
  );
}

function displayValue(field: VehicleField, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.dataType === "boolean") return raw ? "Yes" : "No";
  if (field.dataType === "single_select") {
    return field.constraints?.options?.find((o) => o.value === raw)?.label ?? String(raw);
  }
  return String(raw);
}
