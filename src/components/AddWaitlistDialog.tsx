import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { CustomerSearchPicker } from "@/components/LinkedRecordDialogs";
import { AddClientDialog } from "@/components/QuickActions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateWaitlistEntry,
  useCustomer,
  useCustomerLinkedRecords,
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
import { TIME_OF_DAY_LABELS, WEEKDAYS } from "@/lib/waitlist";

export type WaitlistDialogDefaults = {
  customerId?: string;
  serviceId?: string;
  linkedRecordId?: string;
  locationId?: string;
  staffId?: string;
  /** `YYYY-MM-DD` the client wanted — becomes the start of their preferred window. */
  from?: string;
};

/**
 * Add a client to the waitlist, or edit an open entry. Who + what are fixed once an
 * entry exists (the API keys "one open entry" on them); everything else can change.
 */
export function AddWaitlistDialog({
  open,
  onOpenChange,
  defaults,
  entry,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: WaitlistDialogDefaults;
  /** Edit mode: the entry to change. */
  entry?: WaitlistEntry | null;
  onSaved?: (entry: WaitlistEntry) => void;
}) {
  const tenant = useTenant();
  const editing = Boolean(entry);
  const [customerId, setCustomerId] = useState("");
  /** "+" beside the client picker: add someone new without leaving the half-filled form. */
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

  const services = useServices();
  const locations = useLocationsList();
  const staff = useStaffList();
  const customers = useCustomers();
  const definition = useLinkedRecordDefinition();
  const records = useCustomerLinkedRecords(customerId || undefined);
  const chosen = useCustomer(customerId || undefined);
  const create = useCreateWaitlistEntry();
  const update = useUpdateWaitlistEntry();

  // Reset to the defaults (or the entry) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
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

  const toggleDay = (value: number) =>
    setDays((d) => (d.includes(value) ? d.filter((x) => x !== value) : [...d, value].sort()));

  const busy = create.isPending || update.isPending;

  const submit = async () => {
    if (!customerId) return toast.error("Choose a client");
    if (!serviceId) return toast.error("Choose a service");
    if (from && to && to < from) return toast.error("The window can't end before it starts");
    const shared: Omit<WaitlistEntryInput, "customerId" | "serviceId"> = {
      variantId: variantId === "none" ? null : variantId,
      linkedRecordId: linkedRecordId === "none" ? null : linkedRecordId,
      // Only a real location goes over the wire; "any"/"all" mean no preference.
      locationId: locationList.some((l) => l.id === locationId) ? locationId : null,
      staffId: staffId === "any" ? null : staffId,
      preferences: {
        from: from || null,
        to: to || null,
        days: days.length > 0 ? days : null,
        timeOfDay,
      },
      notes: notes.trim() || null,
      priority: highPriority ? "high" : "normal",
    };
    try {
      const saved = entry
        ? await update.mutateAsync({ entryId: entry.id, patch: shared })
        : await create.mutateAsync({ customerId, serviceId, ...shared });
      const who = saved.customer?.firstName ?? "Client";
      toast.success(entry ? "Waitlist entry updated" : `${who} added to the waitlist`, {
        description: entry
          ? undefined
          : `You'll be nudged when a ${saved.service?.name ?? "matching"} slot frees up.`,
      });
      onSaved?.(saved);
      onOpenChange(false);
    } catch {
      // Toasted by the hook.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit waitlist entry" : "Add to waitlist"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Change when and where they can do it. Who and what stay the same."
              : "Couldn't find them a slot? Note who wants what and roughly when — you'll be nudged when a cancellation frees matching time."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 **:min-w-0">
          <div className="grid gap-2">
            <Label>Client</Label>
            {editing ? (
              <p className="rounded-md border bg-secondary/40 px-3 py-2 text-sm">
                {selectedCustomer
                  ? [selectedCustomer.firstName, selectedCustomer.lastName]
                      .filter(Boolean)
                      .join(" ")
                  : "Client"}
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <CustomerSearchPicker
                    value={selectedCustomer}
                    suggestions={customerList}
                    placeholder="Choose or search for a client"
                    onSelect={(c) => {
                      setCustomerId(c.id);
                      setLinkedRecordId("none");
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setAddClientOpen(true)}
                  aria-label="Add a new client"
                  title="Add a new client"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Service</Label>
            <Select
              value={serviceId}
              onValueChange={(v) => {
                setServiceId(v);
                setVariantId("none");
              }}
              disabled={editing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a service" />
              </SelectTrigger>
              <SelectContent>
                {serviceList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {service && service.variants.length > 0 ? (
            <div className="grid gap-2">
              <Label>Option</Label>
              <Select value={variantId} onValueChange={setVariantId}>
                <SelectTrigger>
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
            </div>
          ) : null}

          {hasRecords && customerId && activeRecords.length > 0 ? (
            <div className="grid gap-2">
              <Label>{recordTerm}</Label>
              <Select value={linkedRecordId} onValueChange={setLinkedRecordId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {activeRecords.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.displayLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {locationList.length > 1 ? (
              <div className="grid gap-2">
                <Label>Where</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
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
              </div>
            ) : null}
            {staffList.length > 1 ? (
              <div className="grid gap-2">
                <Label>{staffNoun}</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger>
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
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Roughly when</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">From</span>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Until</span>
                <Input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave both blank for "as soon as possible".
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Days they can do</Label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">None selected means any day.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Time of day</Label>
              <Select value={timeOfDay} onValueChange={(v) => setTimeOfDay(v as WaitlistTimeOfDay)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIME_OF_DAY_LABELS) as WaitlistTimeOfDay[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TIME_OF_DAY_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3 sm:mt-6">
              <div>
                <p className="text-sm font-medium">High priority</p>
                <p className="text-xs text-muted-foreground">Shown first when a slot frees</p>
              </div>
              <Switch checked={highPriority} onCheckedChange={setHighPriority} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="wl-notes">Notes</Label>
            <Textarea
              id="wl-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Prefers a text · needs the car back by 3pm · …"
              rows={2}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add to waitlist"}
          </Button>
        </DialogFooter>
      </DialogContent>
      {/* Stacks over this dialog; the new client is selected on save. */}
      <AddClientDialog
        open={open && addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onCreated={(c) => {
          setCustomerId(c.id);
          setLinkedRecordId("none");
        }}
      />
    </Dialog>
  );
}
