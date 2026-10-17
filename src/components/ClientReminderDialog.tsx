import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
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
import {
  useCreateFollowUp,
  useCustomer,
  useCustomerFollowUps,
  useCustomerLinkedRecords,
  useCustomers,
  useLinkedRecordDefinition,
} from "@/lib/api/hooks";
import type { CatalogueService } from "@/lib/api/types";
import {
  FOLLOW_UP_DEFAULT_LEAD_DAYS,
  FOLLOW_UP_INTERVAL_PRESETS,
  FOLLOW_UP_MAX_INTERVAL_MONTHS,
  FOLLOW_UP_MAX_LABEL_LENGTH,
  FOLLOW_UP_MAX_LEAD_DAYS,
  FOLLOW_UP_MIN_INTERVAL_MONTHS,
  clientReminderFromDraft,
  existingOpenReminder,
  followUpIntervalLabel,
  todayIn,
  type ClientReminderDraft,
  type ClientReminderField,
} from "@/lib/follow-ups";
import { formatInTz } from "@/lib/format";
import { useTenant } from "@/lib/tenant/tenant-context";

export type ClientReminderDefaults = {
  customerId?: string;
  serviceId?: string;
  linkedRecordId?: string | null;
};

function blankDraft(defaults: ClientReminderDefaults | undefined): ClientReminderDraft {
  return {
    customerId: defaults?.customerId ?? "",
    serviceId: defaults?.serviceId ?? "",
    linkedRecordId: defaults?.linkedRecordId ?? null,
    lastDone: "",
    preset: "2",
    customMonths: "",
    leadDays: String(FOLLOW_UP_DEFAULT_LEAD_DAYS),
    label: "",
  };
}

/**
 * "Remind a client": a follow-up for one person that no finished job scheduled — the
 * work was done before RECAVO, or elsewhere, or the owner simply wants Lee chased in
 * two months. Picking a service with a reminder rule pre-fills its interval, notice
 * and label; the due date and reminder day are shown before saving.
 */
export function ClientReminderDialog({
  open,
  onOpenChange,
  services,
  serviceNoun,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: CatalogueService[];
  /** The business's word for a service, lower case ("session", "service"). */
  serviceNoun: string;
  /** Pre-filled from the client's page or a follow-up row. */
  defaults?: ClientReminderDefaults;
}) {
  const tenant = useTenant();
  const timezone = tenant.business?.defaultTimezone || "Europe/London";
  const create = useCreateFollowUp();
  const customers = useCustomers();
  const definition = useLinkedRecordDefinition();

  const [draft, setDraft] = useState<ClientReminderDraft>(() => blankDraft(defaults));
  const [error, setError] = useState<{ field: ClientReminderField; message: string } | null>(null);
  const [addClientOpen, setAddClientOpen] = useState(false);

  const chosen = useCustomer(draft.customerId || undefined);
  const records = useCustomerLinkedRecords(draft.customerId || undefined);
  const existing = useCustomerFollowUps(draft.customerId || undefined);

  // Fresh form each time it opens, seeded from the defaults.
  useEffect(() => {
    if (!open) return;
    setDraft(blankDraft(defaults));
    setError(null);
    setAddClientOpen(false);
    // Re-seed only on open, not as the caller's defaults object identity churns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choices = useMemo(
    () =>
      services
        .filter((s) => s.active || s.id === draft.serviceId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [services, draft.serviceId],
  );
  const service = services.find((s) => s.id === draft.serviceId);
  const customerList = customers.data?.items ?? [];
  const selectedCustomer =
    customerList.find((c) => c.id === draft.customerId) ?? chosen.data ?? null;
  const customerName = selectedCustomer
    ? [selectedCustomer.firstName, selectedCustomer.lastName].filter(Boolean).join(" ") ||
      "this client"
    : "this client";
  const hasRecords = Boolean(definition.data?.definition);
  const recordTerm = tenant.terminology.linkedRecord;
  const activeRecords = (records.data ?? []).filter(
    (r) => r.status === "active" || r.id === draft.linkedRecordId,
  );

  // A service with a rule already knows how often it is due: start from that.
  const pickService = (serviceId: string) => {
    const next = services.find((s) => s.id === serviceId);
    const rule = next?.followUps.slice().sort((a, b) => a.intervalMonths - b.intervalMonths)[0];
    setDraft((d) => {
      const preset = rule
        ? FOLLOW_UP_INTERVAL_PRESETS.find((p) => p.months === rule.intervalMonths)
        : undefined;
      return {
        ...d,
        serviceId,
        ...(rule
          ? {
              preset: preset ? String(preset.months) : "custom",
              customMonths: preset ? "" : String(rule.intervalMonths),
              leadDays: String(rule.leadDays),
              label: rule.label ?? "",
            }
          : {}),
      };
    });
    setError(null);
  };

  const preview = useMemo(
    () => (open ? clientReminderFromDraft(draft, { timezone }) : null),
    [draft, timezone, open],
  );
  const duplicate = draft.serviceId
    ? existingOpenReminder(existing.data, draft.serviceId, draft.linkedRecordId)
    : null;

  const save = async () => {
    const result = clientReminderFromDraft(draft, { timezone });
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      return;
    }
    setError(null);
    try {
      const created = await create.mutateAsync(result.body);
      toast.success(
        `Reminder set — ${created.title} for ${customerName}, due ${formatInTz(created.dueAt, timezone, { dateStyle: "medium" })}`,
      );
      onOpenChange(false);
    } catch {
      // The hook toasted the reason; the form stays open so nothing typed is lost.
    }
  };

  const busy = create.isPending;
  const fieldError = (field: ClientReminderField) =>
    error?.field === field ? <p className="text-xs text-destructive">{error.message}</p> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remind a client</DialogTitle>
          <DialogDescription>
            A one-off reminder for one client — work done before you used RECAVO, or something you
            simply want to chase. They (and you) are told ahead of the date, and booking the{" "}
            {serviceNoun} again closes it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4 **:min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-1.5">
            <Label>Client</Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <CustomerSearchPicker
                  value={selectedCustomer}
                  suggestions={customerList}
                  placeholder="Choose or search for a client"
                  onSelect={(c) => {
                    setDraft((d) => ({ ...d, customerId: c.id, linkedRecordId: null }));
                    setError(null);
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
            {fieldError("customerId")}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="client-reminder-service">
              {serviceNoun.charAt(0).toUpperCase() + serviceNoun.slice(1)}
            </Label>
            <Select value={draft.serviceId} onValueChange={pickService}>
              <SelectTrigger
                id="client-reminder-service"
                className="w-full"
                aria-invalid={error?.field === "serviceId" || undefined}
              >
                <SelectValue placeholder={`Pick a ${serviceNoun}`} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("serviceId")}
          </div>

          {hasRecords && draft.customerId && activeRecords.length > 0 ? (
            <div className="grid gap-1.5">
              <Label htmlFor="client-reminder-record">{recordTerm}</Label>
              <Select
                value={draft.linkedRecordId ?? "none"}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, linkedRecordId: v === "none" ? null : v }))
                }
              >
                <SelectTrigger id="client-reminder-record" className="w-full">
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
            <div className="grid gap-1.5">
              <Label htmlFor="client-reminder-last-done">Last done</Label>
              <Input
                id="client-reminder-last-done"
                type="date"
                value={draft.lastDone}
                max={todayIn(timezone)}
                placeholder="Today"
                onChange={(e) => {
                  setDraft((d) => ({ ...d, lastDone: e.target.value }));
                  setError(null);
                }}
                aria-invalid={error?.field === "lastDone" || undefined}
              />
              {fieldError("lastDone") ?? (
                <p className="text-xs text-muted-foreground">Leave blank for today.</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="client-reminder-interval">Due again after</Label>
              <Select
                value={draft.preset}
                onValueChange={(preset) => {
                  setDraft((d) => ({ ...d, preset }));
                  setError(null);
                }}
              >
                <SelectTrigger id="client-reminder-interval" className="w-full">
                  <SelectValue placeholder="Pick an interval" />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_INTERVAL_PRESETS.map((p) => (
                    <SelectItem key={p.months} value={String(p.months)}>
                      {p.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
              {draft.preset === "custom" ? (
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="client-reminder-custom-months"
                    type="number"
                    inputMode="numeric"
                    min={FOLLOW_UP_MIN_INTERVAL_MONTHS}
                    max={FOLLOW_UP_MAX_INTERVAL_MONTHS}
                    step={1}
                    value={draft.customMonths}
                    onChange={(e) => setDraft((d) => ({ ...d, customMonths: e.target.value }))}
                    placeholder="e.g. 30"
                    aria-label="Custom interval in months"
                    aria-invalid={error?.field === "intervalMonths" || undefined}
                    className="w-28"
                  />
                  <span className="text-base text-muted-foreground md:text-sm">months</span>
                </div>
              ) : null}
              {fieldError("intervalMonths")}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="client-reminder-lead">Remind this many days before</Label>
            <div className="flex items-center gap-2">
              <Input
                id="client-reminder-lead"
                type="number"
                inputMode="numeric"
                min={0}
                max={FOLLOW_UP_MAX_LEAD_DAYS}
                step={1}
                value={draft.leadDays}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, leadDays: e.target.value }));
                  setError(null);
                }}
                aria-invalid={error?.field === "leadDays" || undefined}
                className="w-28"
              />
              <span className="text-base text-muted-foreground md:text-sm">days</span>
            </div>
            {fieldError("leadDays")}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="client-reminder-label">
              What to call it <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="client-reminder-label"
              value={draft.label}
              maxLength={FOLLOW_UP_MAX_LABEL_LENGTH}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder={service ? `e.g. ${service.name} top-up` : "e.g. Maintenance wash"}
              aria-invalid={error?.field === "label" || undefined}
            />
            {fieldError("label")}
          </div>

          <div
            className="rounded-lg border bg-secondary/40 px-3 py-2 text-sm"
            data-testid="client-reminder-preview"
            aria-live="polite"
          >
            {preview?.ok ? (
              <>
                <span className="font-medium">
                  Due {formatInTz(preview.dueAt.toISOString(), timezone, { dateStyle: "medium" })}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {customerName} is reminded{" "}
                  {preview.remindAt.getTime() <= Date.now()
                    ? "straight away"
                    : `on ${formatInTz(preview.remindAt.toISOString(), timezone, { dateStyle: "medium" })}`}
                  {service
                    ? ` · ${service.name} ${followUpIntervalLabel(preview.body.intervalMonths)}`
                    : ""}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Pick a client and a {serviceNoun} to see when they will be reminded.
              </span>
            )}
          </div>

          {duplicate ? (
            <p
              className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-foreground"
              data-testid="client-reminder-duplicate"
            >
              {customerName} already has an open reminder for{" "}
              {service?.name ?? `this ${serviceNoun}`}
              {duplicate.linkedRecord ? ` on ${duplicate.linkedRecord.label}` : ""}, due{" "}
              {formatInTz(duplicate.dueAt, timezone, { dateStyle: "medium" })}. Saving adds a second
              one; dismiss the other from “Who is due” if it is no longer wanted.
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Set reminder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <AddClientDialog
        open={open && addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onCreated={(c) => {
          setDraft((d) => ({ ...d, customerId: c.id, linkedRecordId: null }));
          setError(null);
        }}
      />
    </Dialog>
  );
}
