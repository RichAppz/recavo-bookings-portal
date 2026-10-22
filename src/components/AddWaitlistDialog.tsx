import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, TriangleAlert } from "lucide-react";
import { CustomerSearchPicker } from "@/components/LinkedRecordDialogs";
import { AddClientDialog } from "@/components/QuickActions";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { useVehicleFields } from "@/components/vehicles/use-vehicles-data";
import { DayToggles, TimeOfDayButtons } from "@/components/waitlist/parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsPhone } from "@/hooks/use-media-query";
import {
  useCreateWaitlistEntry,
  useCustomer,
  useCustomerLinkedRecords,
  useCustomerWaitlist,
  useCustomers,
  useLinkedRecordDefinition,
  useLocationsList,
  useServices,
  useStaffList,
  useUpdateWaitlistEntry,
  type WaitlistEntryInput,
} from "@/lib/api/hooks";
import type { WaitlistEntry, WaitlistTimeOfDay } from "@/lib/api/types";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { registrationOf, vehicleTitle } from "@/lib/vehicles";
import { dayDate, describePreferences, displayPhone, shortDate } from "@/lib/waitlist";

export type WaitlistDialogDefaults = {
  customerId?: string;
  serviceId?: string;
  linkedRecordId?: string;
  locationId?: string;
  staffId?: string;
  /** `YYYY-MM-DD` the client wanted — becomes the start of their preferred window. */
  from?: string;
  /** Opened from "Add to waitlist instead" on Add booking: say what was copied. */
  copiedFromBooking?: boolean;
};

type Field = "customer" | "service" | "to";

/**
 * Add a client to the waitlist, or edit an open entry, in a right-hand drawer (full
 * screen on a phone). Who + what are fixed once an entry exists (the API keys "one open
 * entry" on them); everything else can change. If they're already waiting for that
 * service the drawer says so and offers their entry instead of a second one.
 */
export function AddWaitlistDialog({
  open,
  onOpenChange,
  defaults,
  entry,
  onSaved,
  onOpenExisting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: WaitlistDialogDefaults;
  /** Edit mode: the entry to change. */
  entry?: WaitlistEntry | null;
  onSaved?: (entry: WaitlistEntry) => void;
  /** "Open Sam's entry" on the duplicate box. Defaults to the Waitlist page. */
  onOpenExisting?: (entry: WaitlistEntry) => void;
}) {
  const tenant = useTenant();
  const phone = useIsPhone();
  const navigate = useNavigate();
  const editing = Boolean(entry);
  const [customerId, setCustomerId] = useState("");
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [variantId, setVariantId] = useState("none");
  const [linkedRecordId, setLinkedRecordId] = useState("none");
  const [locationId, setLocationId] = useState("any");
  const [staffId, setStaffId] = useState("any");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<WaitlistTimeOfDay>("any");
  const [highPriority, setHighPriority] = useState(false);
  const [notes, setNotes] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const services = useServices();
  const locations = useLocationsList();
  const staff = useStaffList();
  const customers = useCustomers();
  const definition = useLinkedRecordDefinition();
  const { fields } = useVehicleFields();
  const records = useCustomerLinkedRecords(customerId || undefined);
  const chosen = useCustomer(customerId || undefined);
  const theirs = useCustomerWaitlist(!editing && customerId ? customerId : undefined);
  const create = useCreateWaitlistEntry();
  const update = useUpdateWaitlistEntry();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (entry) {
      setCustomerId(entry.customerId);
      setServiceId(entry.serviceId);
      setVariantId(entry.variantId ?? "none");
      setLinkedRecordId(entry.linkedRecordId ?? "none");
      setLocationId(entry.locationId ?? "any");
      setStaffId(entry.staffId ?? "any");
      setFrom(entry.preferences.from ?? "");
      setTo(entry.preferences.to ?? "");
      setDays(entry.preferences.days ?? []);
      setTimeOfDay(entry.preferences.timeOfDay);
      setHighPriority(entry.priority === "high");
      setNotes(entry.notes ?? "");
      setNotifyClient(false);
      return;
    }
    setCustomerId(defaults?.customerId ?? "");
    setServiceId(defaults?.serviceId ?? "");
    setVariantId("none");
    setLinkedRecordId(defaults?.linkedRecordId ?? "none");
    // The location filter's "all" is not a location; sending it to the API was a 500.
    const currentLocation =
      tenant.currentLocationId && tenant.currentLocationId !== "all"
        ? tenant.currentLocationId
        : "any";
    setLocationId(defaults?.locationId ?? currentLocation);
    setStaffId(defaults?.staffId ?? "any");
    setFrom(defaults?.from ?? "");
    setTo("");
    setDays([]);
    setTimeOfDay("any");
    setHighPriority(false);
    setNotes("");
    setNotifyClient(false);
  }, [open, entry, defaults, tenant.currentLocationId]);

  const serviceList = useMemo(
    () => (services.data ?? []).filter((s) => s.active || s.id === serviceId),
    [services.data, serviceId],
  );
  const service = serviceList.find((s) => s.id === serviceId) ?? null;
  const locationList = locations.data ?? [];
  const staffList = useMemo(
    () =>
      (staff.data ?? []).filter(
        (s) =>
          !service ||
          s.eligibleServiceIds.length === 0 ||
          s.eligibleServiceIds.includes(service.id),
      ),
    [staff.data, service],
  );
  const customerList = customers.data?.items ?? [];
  const selectedCustomer = customerList.find((c) => c.id === customerId) ?? chosen.data ?? null;
  const hasRecords = Boolean(definition.data?.definition);
  const recordTerm = tenant.terminology.linkedRecord;
  const activeRecords = (records.data ?? []).filter(
    (r) => r.status === "active" || r.id === linkedRecordId,
  );
  const staffNoun = tenant.terminology.staff.trim() || "Staff";
  const serviceNoun = (
    tenant.terminology.service.replace(/\s+type$/i, "").trim() || "Service"
  ).toLowerCase();
  const clientName = selectedCustomer
    ? [selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ") || "Client"
    : "";
  const clientFirst = selectedCustomer?.firstName?.trim() || "them";

  const duplicate = useMemo(
    () =>
      !editing && serviceId
        ? ((theirs.data ?? []).find((e) => e.serviceId === serviceId && e.status === "waiting") ??
          null)
        : null,
    [editing, serviceId, theirs.data],
  );

  const missing = (): { field: Field; message: string; label: string } | null => {
    if (!customerId)
      return { field: "customer", message: "Pick a client.", label: "Pick a client" };
    if (!serviceId)
      return {
        field: "service",
        message: `Pick a ${serviceNoun}.`,
        label: `Pick a ${serviceNoun}`,
      };
    if (from && to && to < from)
      return { field: "to", message: "Until can't be before From.", label: "Fix the dates" };
    return null;
  };
  const need = missing();

  const busy = create.isPending || update.isPending;

  const openExisting = (e: WaitlistEntry) => {
    onOpenChange(false);
    if (onOpenExisting) onOpenExisting(e);
    else void navigate({ to: "/waitlist", search: { entry: e.id } });
  };

  const submit = async () => {
    if (duplicate) return openExisting(duplicate);
    if (need) {
      setErrors({ [need.field]: need.message });
      document.getElementById(`wl-${need.field}`)?.focus();
      return;
    }
    const shared: Omit<WaitlistEntryInput, "customerId" | "serviceId"> = {
      variantId: variantId === "none" ? null : variantId,
      linkedRecordId: linkedRecordId === "none" ? null : linkedRecordId,
      // Only a real location goes over the wire; "any"/"all" mean no preference.
      locationId: locationList.some((l) => l.id === locationId) ? locationId : null,
      staffId: staffId === "any" ? null : staffId,
      preferences: {
        from: from || null,
        to: to || null,
        days: days.length > 0 && days.length < 7 ? days : null,
        timeOfDay,
      },
      notes: notes.trim() || null,
      priority: highPriority ? "high" : "normal",
    };
    try {
      const saved = entry
        ? await update.mutateAsync({ entryId: entry.id, patch: shared })
        : await create.mutateAsync({
            customerId,
            serviceId,
            ...shared,
            ...(notifyClient ? { notifyClient: true } : {}),
          });
      if (entry) {
        toast.success("Waitlist entry updated");
      } else {
        const who = saved.customer?.firstName ?? "Client";
        toast.success(`${who} added to the waitlist`, {
          description: `We'll show you when a ${saved.service?.name ?? serviceNoun} slot fits.`,
        });
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch {
      // Toasted by the hook.
    }
  };

  const primary = busy
    ? "Saving…"
    : duplicate
      ? `Open ${clientFirst}'s entry`
      : editing
        ? "Save changes"
        : (need?.label ?? "Add to waitlist");

  return (
    <Sheet open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <SheetContent
        side="right"
        className={cn("flex w-full flex-col gap-0 p-0", phone ? "max-w-none" : "sm:max-w-[480px]")}
      >
        <SheetHeader className="border-b px-4 sm:px-6 pt-6 pb-4 text-left">
          <SheetTitle className="text-[22px] font-extrabold tracking-tight">
            {editing ? "Edit waitlist entry" : "Add to waitlist"}
          </SheetTitle>
          <SheetDescription>
            {editing
              ? "Change when and where they can do it. Who and what stay the same."
              : "Note who wants what and roughly when. We'll show you who fits when a slot frees."}
          </SheetDescription>
        </SheetHeader>

        <form
          id="waitlist-form"
          noValidate
          className="no-scrollbar grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-4 sm:px-6 py-5 **:min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {!editing && defaults?.copiedFromBooking && defaults.from ? (
            <p className="rounded-xl bg-secondary/70 px-3.5 py-2.5 text-[13px] text-muted-foreground">
              Nothing free on {dayDate(defaults.from)}, so we&rsquo;ve copied the details from the
              booking.
            </p>
          ) : null}

          <Section title="Who" required>
            {selectedCustomer ? (
              <div className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5">
                <Initials name={clientName} />
                <div className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-bold">{clientName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {displayPhone(selectedCustomer.phoneDisplay) ??
                      selectedCustomer.emailDisplay ??
                      ""}
                  </span>
                </div>
                {editing ? null : (
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer text-[13px] font-bold text-primary"
                    onClick={() => {
                      setCustomerId("");
                      setLinkedRecordId("none");
                    }}
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-2" id="wl-customer" tabIndex={-1}>
                <CustomerSearchPicker
                  value={null}
                  suggestions={customerList}
                  placeholder="Search for a client"
                  onSelect={(c) => {
                    setCustomerId(c.id);
                    setLinkedRecordId("none");
                    setErrors((e) => ({ ...e, customer: undefined }));
                  }}
                />
                <button
                  type="button"
                  onClick={() => setAddClientOpen(true)}
                  className="inline-flex w-fit cursor-pointer items-center gap-1 text-[13px] font-bold text-primary"
                >
                  <Plus className="size-3.5" /> New client
                </button>
              </div>
            )}
            <FieldError message={errors.customer} id="wl-customer-error" />
          </Section>

          <Section title="What" required>
            <Select
              value={serviceId}
              disabled={editing}
              onValueChange={(v) => {
                setServiceId(v);
                setVariantId("none");
                setErrors((e) => ({ ...e, service: undefined }));
              }}
            >
              <SelectTrigger
                id="wl-service"
                className="h-11 w-full"
                aria-label={serviceNoun}
                aria-invalid={errors.service ? true : undefined}
                aria-describedby={errors.service ? "wl-service-error" : undefined}
              >
                <SelectValue placeholder={`Pick a ${serviceNoun}`} />
              </SelectTrigger>
              <SelectContent>
                {serviceList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={errors.service} id="wl-service-error" />
            {service && service.variants.length > 0 ? (
              <Select value={variantId} onValueChange={setVariantId}>
                <SelectTrigger className="h-11 w-full" aria-label="Option">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any option</SelectItem>
                  {service.variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {hasRecords && customerId && activeRecords.length > 0 ? (
              <Select value={linkedRecordId} onValueChange={setLinkedRecordId}>
                <SelectTrigger className="h-11 w-full" aria-label={recordTerm}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{recordTerm}: not specified</SelectItem>
                  {activeRecords.map((r) => {
                    const plate = registrationOf(r.values, fields);
                    return (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="flex items-center gap-2">
                          {plate ? <NumberPlate registration={plate} size="small" /> : null}
                          {vehicleTitle(r, fields)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : null}
            {duplicate ? (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl bg-[#fdf0dc] px-3.5 py-3 text-[#5c3800] dark:bg-[rgba(233,146,57,0.16)] dark:text-[#f3d2a8]"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="grid min-w-0 flex-1 gap-0.5 text-[13px]">
                  <span className="font-bold">
                    {clientFirst} is already waiting for{" "}
                    {/^[aeiou]/i.test(duplicate.service?.name ?? "") ? "an" : "a"}{" "}
                    {duplicate.service?.name ?? serviceNoun}.
                  </span>
                  <span>
                    Added {shortDate(duplicate.createdAt.slice(0, 10))} ·{" "}
                    {describePreferences(duplicate.preferences)}
                  </span>
                </div>
                <button
                  type="button"
                  className="shrink-0 cursor-pointer text-[13px] font-bold underline underline-offset-2"
                  onClick={() => openExisting(duplicate)}
                >
                  Open it
                </button>
              </div>
            ) : null}
          </Section>

          {locationList.length > 1 || staffList.length > 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {locationList.length > 1 ? (
                <Section title="Where">
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger className="h-11 w-full" aria-label="Where">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Anywhere</SelectItem>
                      {locationList.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Section>
              ) : null}
              {staffList.length > 1 ? (
                <Section title={staffNoun}>
                  <Select value={staffId} onValueChange={setStaffId}>
                    <SelectTrigger className="h-11 w-full" aria-label={staffNoun}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Anyone</SelectItem>
                      {staffList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Section>
              ) : null}
            </div>
          ) : null}

          <Section title="When">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs text-muted-foreground">
                From
                <Input
                  type="date"
                  className="h-11"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setErrors((er) => ({ ...er, to: undefined }));
                  }}
                />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Until
                <Input
                  id="wl-to"
                  type="date"
                  className={cn("h-11", errors.to && "border-destructive")}
                  value={to}
                  aria-invalid={errors.to ? true : undefined}
                  aria-describedby={errors.to ? "wl-to-error" : undefined}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setErrors((er) => ({ ...er, to: undefined }));
                  }}
                />
              </label>
            </div>
            {errors.to ? (
              <FieldError message={errors.to} id="wl-to-error" />
            ) : !from && !to ? (
              <p className="text-xs text-muted-foreground">
                Leave both blank for as soon as possible.
              </p>
            ) : null}
            <p className="mt-2 text-[13px] font-bold">
              Days they can do{" "}
              <span className="font-normal text-muted-foreground">· none means any day</span>
            </p>
            <DayToggles value={days} onChange={setDays} short={phone} />
            <p className="mt-2 text-[13px] font-bold">Time of day</p>
            <TimeOfDayButtons value={timeOfDay} onChange={setTimeOfDay} />
          </Section>

          <div className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3">
            <div className="grid">
              <Label htmlFor="wl-priority" className="text-sm font-bold">
                High priority
              </Label>
              <span className="text-xs text-muted-foreground">Shown first when a slot frees.</span>
            </div>
            <Switch id="wl-priority" checked={highPriority} onCheckedChange={setHighPriority} />
          </div>

          <Section title="Notes" optional>
            <Textarea
              id="wl-notes"
              aria-label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Prefers a text. Needs the car back by 3pm."
              rows={3}
              maxLength={2000}
            />
          </Section>

          {editing ? null : (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3">
              <Checkbox
                checked={notifyClient}
                onCheckedChange={(v) => setNotifyClient(v === true)}
                className="mt-0.5"
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-bold">Let the client know</span>
                <span className="text-xs text-muted-foreground">
                  Send {selectedCustomer ? clientFirst : "them"} a text or email to say
                  they&rsquo;re on the list.
                </span>
              </span>
            </label>
          )}
        </form>

        <footer className="flex gap-2 border-t px-4 sm:px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="max-sm:hidden"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="waitlist-form"
            className="max-sm:h-12 max-sm:flex-1"
            disabled={busy}
          >
            {primary}
          </Button>
        </footer>
      </SheetContent>
      <AddClientDialog
        open={open && addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onCreated={(c) => {
          setCustomerId(c.id);
          setLinkedRecordId("none");
          setErrors((e) => ({ ...e, customer: undefined }));
        }}
      />
    </Sheet>
  );
}

function Section({
  title,
  required,
  optional,
  children,
}: {
  title: string;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-[13px] font-extrabold">
        {title}
        {required ? <span className="text-destructive"> *</span> : null}
        {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
      </h3>
      {children}
    </section>
  );
}

function FieldError({ message, id }: { message?: string; id: string }) {
  return message ? (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

function Initials({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-extrabold text-primary"
    >
      {letters || "?"}
    </span>
  );
}
