import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Plus, Users, UserRound } from "lucide-react";
import { toast } from "sonner";
import { DiscardChangesDialog } from "@/components/DiscardChangesDialog";
import { CustomerSearchPicker } from "@/components/LinkedRecordDialogs";
import { AddClientDialog } from "@/components/QuickActions";
import { NumberPlate } from "@/components/vehicles/NumberPlate";
import { useVehicleFields } from "@/components/vehicles/use-vehicles-data";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
import {
  useAllOpenFollowUps,
  useClientStatsBookings,
  useCreateFollowUp,
  useCustomer,
  useCustomerFollowUps,
  useCustomerLinkedRecords,
  useCustomers,
  useDismissFollowUps,
  useLinkedRecordDefinition,
  useUpdateService,
} from "@/lib/api/hooks";
import type {
  CatalogueService,
  Customer,
  ServiceFollowUp,
  ServiceFollowUpRule,
} from "@/lib/api/types";
import {
  FOLLOW_UP_MAX_RULES,
  dateAtMidday,
  existingOpenReminder,
  followUpIntervalLabel,
  followUpNames,
  followUpRuleList,
  followUpsForRule,
  rulesWithSaved,
  rulesWithout,
  todayIn,
} from "@/lib/follow-ups";
import { formatDuration, formatMoney } from "@/lib/format";
import {
  DEFAULT_INTERVAL_MONTHS,
  DEFAULT_LEAD_DAYS,
  INTERVAL_PICKS,
  LEAD_PICKS,
  MAX_NAME_LENGTH,
  customIntervalMonths,
  formatReminderWhen,
  leadFits,
  pastClientsFor,
  timeline,
} from "@/lib/service-reminders";
import { registrationOf, vehicleTitle } from "@/lib/vehicles";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

function money(minor: number, currency: string | null | undefined): string {
  try {
    return formatMoney(minor, currency || "GBP");
  } catch {
    return "—";
  }
}

export type ReminderDrawerTarget =
  | {
      mode: "add";
      who?: "everyone" | "one";
      customerId?: string;
      serviceId?: string;
      linkedRecordId?: string | null;
    }
  | { mode: "edit"; serviceId: string; rule: ServiceFollowUpRule };

type Who = "everyone" | "one";
type Interval =
  { kind: "pick"; months: number } | { kind: "other"; value: string; unit: "months" | "years" };
type Errors = Partial<
  Record<"customer" | "service" | "lastDone" | "interval" | "lead" | "name", string>
>;

const DAY_MS = 86_400_000;

function intervalFrom(months: number): Interval {
  if (INTERVAL_PICKS.some((p) => p.months === months)) return { kind: "pick", months };
  return months % 12 === 0
    ? { kind: "other", value: String(months / 12), unit: "years" }
    : { kind: "other", value: String(months), unit: "months" };
}

const fullName = (c: Pick<Customer, "firstName" | "lastName"> | null | undefined) =>
  c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || "Client" : "";

/**
 * "Add reminder": one drawer for both kinds. **Everyone** puts a repeat reminder on a
 * service (every finished job of it reminds that client when it's due again);
 * **One client** sets a one-off for a single person — work done before RECAVO, say.
 * Editing a repeat reminder uses the same drawer. Repeat reminders are saved by
 * sending the service's whole rule list back with this one swapped in, so the others
 * keep their ids and what they've already scheduled.
 */
export function ReminderDrawer({
  target,
  onClose,
  services,
  canStopScheduled,
  onShowExisting,
  onCreated,
}: {
  /** Null when closed. */
  target: ReminderDrawerTarget | null;
  onClose: () => void;
  services: CatalogueService[];
  /** Whether this person may dismiss follow-ups (needed to stop what a deleted rule scheduled). */
  canStopScheduled: boolean;
  /** "Show it" on the already-has-one warning. */
  onShowExisting?: (followUp: ServiceFollowUp) => void;
  /** After a one-off is saved. */
  onCreated?: (followUp: ServiceFollowUp) => void;
}) {
  const tenant = useTenant();
  const timezone = tenant.business?.defaultTimezone || "Europe/London";
  const serviceNoun = (
    tenant.terminology.service.replace(/\s+type$/i, "").trim() || "Service"
  ).toLowerCase();
  const recordTerm = tenant.terminology.linkedRecord;
  const open = target !== null;
  const editing = target?.mode === "edit" ? target.rule : null;

  const updateService = useUpdateService();
  const createFollowUp = useCreateFollowUp();
  const dismiss = useDismissFollowUps();
  const definition = useLinkedRecordDefinition();
  const hasRecords = Boolean(definition.data?.definition);
  const { fields } = useVehicleFields();

  const [who, setWho] = useState<Who>("everyone");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [linkedRecordId, setLinkedRecordId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [lastDone, setLastDone] = useState("");
  const [interval, setInterval] = useState<Interval>({
    kind: "pick",
    months: DEFAULT_INTERVAL_MONTHS,
  });
  const [leadDays, setLeadDays] = useState(DEFAULT_LEAD_DAYS);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const showingExisting = useRef(false);

  useEffect(() => {
    if (!target) return;
    setErrors({});
    setDirty(false);
    setConfirmDelete(false);
    setConfirmDiscard(false);
    setAddClientOpen(false);
    setLastDone(todayIn(timezone));
    if (target.mode === "edit") {
      setWho("everyone");
      setServiceId(target.serviceId);
      setInterval(intervalFrom(target.rule.intervalMonths));
      setLeadDays(target.rule.leadDays);
      setName(target.rule.label ?? "");
      setCustomer(null);
      setCustomerId("");
      setLinkedRecordId(null);
      return;
    }
    setWho(target.who ?? (target.customerId ? "one" : "everyone"));
    setCustomer(null);
    setCustomerId(target.customerId ?? "");
    setLinkedRecordId(target.linkedRecordId ?? null);
    setServiceId(target.serviceId ?? "");
    setInterval({ kind: "pick", months: DEFAULT_INTERVAL_MONTHS });
    setLeadDays(DEFAULT_LEAD_DAYS);
    setName("");
    // Re-seed only when the drawer opens or its target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const touch = () => setDirty(true);

  const customers = useCustomers();
  const chosen = useCustomer(customerId || undefined);
  const selectedCustomer = customer ?? chosen.data ?? null;
  const firstName = selectedCustomer?.firstName || "the client";
  const records = useCustomerLinkedRecords(who === "one" && customerId ? customerId : undefined);
  const clientFollowUps = useCustomerFollowUps(
    who === "one" && customerId ? customerId : undefined,
  );
  const openForRules = useAllOpenFollowUps({ enabled: Boolean(editing) && canStopScheduled });
  const history = useClientStatsBookings(
    open && !editing && who === "everyone" && Boolean(serviceId),
  );

  const service = services.find((s) => s.id === serviceId);
  const choices = useMemo(
    () =>
      services
        .filter((s) => s.active || s.id === serviceId)
        .slice()
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [services, serviceId],
  );
  const vehicles = (records.data ?? []).filter(
    (r) => r.status === "active" || r.id === linkedRecordId,
  );

  const months =
    interval.kind === "pick"
      ? interval.months
      : (customIntervalMonths(interval.value, interval.unit) ??
        (editing &&
        Number(interval.value) * (interval.unit === "years" ? 12 : 1) === editing.intervalMonths
          ? editing.intervalMonths
          : null));

  const serviceRules = followUpRuleList(service);
  const full =
    who === "everyone" &&
    !editing &&
    service !== undefined &&
    serviceRules.length >= FOLLOW_UP_MAX_RULES;
  const sameInterval =
    who === "everyone" && service && months
      ? serviceRules.find((r) => r.id !== editing?.id && r.intervalMonths === months)
      : undefined;
  const matchingRule =
    who === "one" && service
      ? (serviceRules.find((r) => r.intervalMonths === months) ?? serviceRules[0])
      : undefined;

  const pastClients = useMemo(() => {
    const historyBookings = history.data?.bookings;
    if (editing || who !== "everyone" || !service || !months || !historyBookings) return 0;
    return pastClientsFor(historyBookings, service.id, months);
  }, [editing, who, service, months, history.data]);

  const duplicate =
    who === "one" && serviceId
      ? existingOpenReminder(clientFollowUps.data, serviceId, linkedRecordId)
      : null;
  const scheduled = useMemo(
    () =>
      editing && canStopScheduled ? followUpsForRule(openForRules.data, serviceId, editing.id) : [],
    [editing, canStopScheduled, openForRules.data, serviceId],
  );

  const doneDate =
    who === "one" ? dateAtMidday(lastDone || todayIn(timezone)) : dateAtMidday(todayIn(timezone));
  const plan = doneDate && months ? timeline(doneDate, months, leadDays) : null;
  const day = (d: Date, withYear = who === "one") =>
    formatReminderWhen(Number.isNaN(d.getTime()) ? null : d.toISOString(), timezone, {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    });

  // What's still needed, in the order the form asks for it.
  const missing = (): { field: keyof Errors; message: string; label: string } | null => {
    if (who === "one" && !customerId)
      return { field: "customer", message: "Pick a client.", label: "Pick a client" };
    if (!service)
      return {
        field: "service",
        message: `Pick a ${serviceNoun}.`,
        label: `Pick a ${serviceNoun}`,
      };
    if (full)
      return {
        field: "service",
        message: `That ${serviceNoun} already has ${FOLLOW_UP_MAX_RULES} reminders. Change one of those instead.`,
        label: `Pick another ${serviceNoun}`,
      };
    if (!months)
      return {
        field: "interval",
        message: "Enter a whole number between 1 month and 5 years.",
        label: "Set when it's due again",
      };
    if (sameInterval)
      return {
        field: "interval",
        message: `${service.name} already has a reminder ${followUpIntervalLabel(months)}. Pick a different gap or edit that one.`,
        label: "Pick a different gap",
      };
    if (!leadFits(leadDays, months))
      return {
        field: "lead",
        message: "The reminder must go out before the due date. Pick a shorter notice.",
        label: "Pick a shorter notice",
      };
    if (who === "one") {
      if (!doneDate)
        return {
          field: "lastDone",
          message: "Enter the date it was last done.",
          label: "Add last done",
        };
      if (doneDate.getTime() > Date.now() + DAY_MS)
        return {
          field: "lastDone",
          message: "Last done can't be in the future.",
          label: "Fix last done",
        };
      if (plan && plan.due.getTime() <= Date.now())
        return {
          field: "interval",
          message: "That would already be due. Pick a longer gap or a later last-done date.",
          label: "Pick a longer gap",
        };
    }
    if (name.trim().length > MAX_NAME_LENGTH && name.trim() !== (editing?.label ?? ""))
      return {
        field: "name",
        message: `Keep it to ${MAX_NAME_LENGTH} characters.`,
        label: "Shorten the name",
      };
    return null;
  };
  const need = missing();

  const busy = updateService.isPending || createFollowUp.isPending || dismiss.isPending;

  const save = async () => {
    if (need) {
      setErrors({ [need.field]: need.message });
      document.getElementById(`rd-${need.field}`)?.focus();
      return;
    }
    if (!service || !months) return;
    setErrors({});
    if (who === "everyone") {
      const label = name.trim() || null;
      try {
        await updateService.mutateAsync({
          serviceId: service.id,
          version: service.version,
          body: {
            followUps: rulesWithSaved(followUpRuleList(service), {
              ...(editing ? { id: editing.id } : {}),
              intervalMonths: months,
              leadDays,
              label,
            }),
          },
        });
      } catch {
        return;
      }
      const title = label ?? service.name;
      toast.success(
        editing
          ? `${title} updated.`
          : pastClients > 0
            ? `${title} added. ${pastClients} past ${pastClients === 1 ? "client" : "clients"} will be reminded.`
            : `${title} added.`,
      );
      onClose();
      return;
    }
    if (!doneDate || !plan) return;
    try {
      const created = await createFollowUp.mutateAsync({
        customerId,
        serviceId: service.id,
        linkedRecordId,
        lastDoneAt: doneDate.toISOString(),
        intervalMonths: months,
        leadDays,
        label: matchingRule?.label ?? null,
      });
      const remind = new Date(created.remindAt);
      toast.success(
        remind.getTime() <= Date.now()
          ? `${firstName} will be reminded shortly.`
          : `${firstName} will be reminded on ${day(remind, true)}.`,
      );
      onCreated?.(created);
      onClose();
    } catch {
      // Toasted by the hook; the drawer stays open so nothing typed is lost.
    }
  };

  const remove = async (alsoDismiss: boolean) => {
    if (!service || !editing) return;
    try {
      await updateService.mutateAsync({
        serviceId: service.id,
        version: service.version,
        body: { followUps: rulesWithout(followUpRuleList(service), editing.id) },
      });
    } catch {
      return;
    }
    let stopped = 0;
    if (alsoDismiss && canStopScheduled) {
      const fresh = await openForRules.refetch();
      const targets = fresh.data ? followUpsForRule(fresh.data, service.id, editing.id) : scheduled;
      if (targets.length > 0) {
        const { failed } = await dismiss.mutateAsync(targets);
        stopped = targets.length - failed.length;
        if (failed.length > 0) {
          toast.error(
            `Reminder deleted, but ${followUpNames(failed.map((f) => f.item))} couldn't be dismissed. Dismiss them from the list.`,
          );
          setConfirmDelete(false);
          onClose();
          return;
        }
      }
    }
    toast.success(
      stopped > 0
        ? `Reminder deleted. ${stopped} waiting ${stopped === 1 ? "client" : "clients"} dismissed.`
        : "Reminder deleted.",
    );
    setConfirmDelete(false);
    onClose();
  };

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const serviceLabel = (s: CatalogueService) =>
    [s.name, money(s.basePriceMinor, s.currency), formatDuration(s.durationMinutes)].join(" · ");

  const primary = busy
    ? "Saving…"
    : editing
      ? "Save"
      : (need?.label ?? (who === "everyone" ? "Add reminder" : "Set reminder"));

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => (o ? undefined : requestClose())}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]"
          onCloseAutoFocus={(e) => {
            if (!showingExisting.current) return;
            showingExisting.current = false;
            e.preventDefault();
          }}
        >
          <SheetHeader className="border-b px-4 sm:px-6 pt-6 pb-4 text-left">
            <SheetTitle className="text-[22px] font-extrabold tracking-tight">
              {editing ? "Edit reminder" : "Add reminder"}
            </SheetTitle>
            <SheetDescription>
              Bring a client back when a {serviceNoun} is due again.
            </SheetDescription>
          </SheetHeader>

          <form
            id="reminder-form"
            noValidate
            className="no-scrollbar grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-4 sm:px-6 py-5 **:min-w-0"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {editing ? null : (
              <Section title="Who is it for?">
                <RadioCards
                  label="Who is it for?"
                  value={who}
                  onChange={(v) => {
                    touch();
                    setWho(v);
                    setErrors({});
                  }}
                  options={[
                    {
                      value: "everyone",
                      icon: <Users className="size-4" />,
                      title: "Everyone",
                      hint: `Each time the ${serviceNoun} is done`,
                    },
                    {
                      value: "one",
                      icon: <UserRound className="size-4" />,
                      title: "One client",
                      hint: "Work done before RECAVO, or a one-off",
                    },
                  ]}
                />
              </Section>
            )}

            {who === "one" ? (
              <Section title="Client" required>
                {selectedCustomer ? (
                  <div className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5">
                    <Initials name={fullName(selectedCustomer)} />
                    <div className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-bold">
                        {fullName(selectedCustomer)}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {selectedCustomer.emailDisplay ?? selectedCustomer.phoneDisplay ?? ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 cursor-pointer text-[13px] font-bold text-primary"
                      onClick={() => {
                        touch();
                        setCustomer(null);
                        setCustomerId("");
                        setLinkedRecordId(null);
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-2" id="rd-customer" tabIndex={-1}>
                    <CustomerSearchPicker
                      value={null}
                      suggestions={customers.data?.items ?? []}
                      placeholder="Search for a client"
                      onSelect={(c) => {
                        touch();
                        setCustomer(c);
                        setCustomerId(c.id);
                        setLinkedRecordId(null);
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
                <FieldError message={errors.customer} />
              </Section>
            ) : null}

            {who === "one" && hasRecords && customerId && vehicles.length > 0 ? (
              <Section title={recordTerm} optional>
                <Select
                  value={linkedRecordId ?? "none"}
                  onValueChange={(v) => {
                    touch();
                    setLinkedRecordId(v === "none" ? null : v);
                  }}
                >
                  <SelectTrigger className="h-11 w-full" aria-label={recordTerm}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {vehicles.map((r) => {
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
              </Section>
            ) : null}

            <Section title={serviceNoun.charAt(0).toUpperCase() + serviceNoun.slice(1)} required>
              <Select
                value={serviceId}
                disabled={Boolean(editing)}
                onValueChange={(v) => {
                  touch();
                  setServiceId(v);
                  setErrors((e) => ({ ...e, service: undefined, interval: undefined }));
                }}
              >
                <SelectTrigger
                  id="rd-service"
                  className="h-11 w-full"
                  aria-invalid={errors.service ? true : undefined}
                >
                  <SelectValue placeholder={`Pick a ${serviceNoun}`} />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((s) => {
                    const isFull =
                      who === "everyone" &&
                      !editing &&
                      followUpRuleList(s).length >= FOLLOW_UP_MAX_RULES;
                    return (
                      <SelectItem key={s.id} value={s.id} disabled={isFull}>
                        {serviceLabel(s)}
                        {isFull ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {FOLLOW_UP_MAX_RULES} reminders already
                          </span>
                        ) : null}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError message={errors.service} />
            </Section>

            {who === "one" ? (
              <Section title="Last done" required>
                <Input
                  id="rd-lastDone"
                  type="date"
                  className="h-11"
                  value={lastDone}
                  max={todayIn(timezone)}
                  onChange={(e) => {
                    touch();
                    setLastDone(e.target.value);
                    setErrors((er) => ({ ...er, lastDone: undefined }));
                  }}
                  aria-invalid={errors.lastDone ? true : undefined}
                />
                {errors.lastDone ? (
                  <FieldError message={errors.lastDone} />
                ) : (
                  <p className="text-xs text-muted-foreground">Can be before RECAVO.</p>
                )}
              </Section>
            ) : null}

            <Section title="Due again after">
              <ChoiceChips
                id="rd-interval"
                label="Due again after"
                value={interval.kind === "pick" ? String(interval.months) : "other"}
                onChange={(v) => {
                  touch();
                  setErrors((e) => ({ ...e, interval: undefined, lead: undefined }));
                  if (v === "other") {
                    setInterval((cur) =>
                      cur.kind === "other" ? cur : { kind: "other", value: "", unit: "months" },
                    );
                  } else {
                    setInterval({ kind: "pick", months: Number(v) });
                  }
                }}
                options={[
                  ...INTERVAL_PICKS.map((p) => ({ value: String(p.months), label: p.label })),
                  { value: "other", label: "Other" },
                ]}
              />
              {interval.kind === "other" ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    className="h-11 w-24"
                    aria-label="How many"
                    value={interval.value}
                    onChange={(e) => {
                      touch();
                      setInterval({ ...interval, value: e.target.value });
                    }}
                  />
                  <Select
                    value={interval.unit}
                    onValueChange={(u) => {
                      touch();
                      setInterval({ ...interval, unit: u as "months" | "years" });
                    }}
                  >
                    <SelectTrigger className="h-11 w-32" aria-label="Months or years">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="months">months</SelectItem>
                      <SelectItem value="years">years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <FieldError message={errors.interval} />
            </Section>

            <Section title="Remind them">
              <ChoiceChips
                id="rd-lead"
                label="Remind them"
                value={String(leadDays)}
                onChange={(v) => {
                  touch();
                  setLeadDays(Number(v));
                  setErrors((e) => ({ ...e, lead: undefined }));
                }}
                options={[
                  ...LEAD_PICKS.map((p) => ({
                    value: String(p.days),
                    label: p.label,
                    disabled: months ? !leadFits(p.days, months) : false,
                  })),
                  ...(LEAD_PICKS.some((p) => p.days === leadDays)
                    ? []
                    : [{ value: String(leadDays), label: `${leadDays} days before` }]),
                ]}
              />
              <FieldError message={errors.lead} />
            </Section>

            {who === "everyone" ? (
              <Section title="Call it" optional>
                <Input
                  id="rd-name"
                  className="h-11"
                  value={name}
                  maxLength={Math.max(MAX_NAME_LENGTH, editing?.label?.length ?? 0)}
                  placeholder={service ? `${service.name} top-up` : "e.g. Coating top-up"}
                  onChange={(e) => {
                    touch();
                    setName(e.target.value);
                  }}
                  aria-invalid={errors.name ? true : undefined}
                />
                {errors.name ? (
                  <FieldError message={errors.name} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Clients see this instead of the {serviceNoun} name.
                  </p>
                )}
              </Section>
            ) : null}

            <section className="rounded-xl bg-secondary/60 px-4 py-3" aria-live="polite">
              <h3 className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
                How it works
              </h3>
              {plan ? (
                <ol className="mt-2 grid gap-2 text-sm">
                  <TimelineRow
                    dot="hollow"
                    text={
                      who === "one" ? "Last done" : `${service?.name ?? `The ${serviceNoun}`} done`
                    }
                    date={who === "one" ? day(plan.done) : `e.g. ${day(plan.done)}`}
                  />
                  <TimelineRow
                    dot="mint"
                    text={who === "one" ? `We remind ${firstName}` : "We remind the client"}
                    date={
                      who === "one" && plan.remind.getTime() <= Date.now()
                        ? "Straight away"
                        : day(plan.remind)
                    }
                  />
                  <TimelineRow dot="amber" text="Due again" date={day(plan.due)} />
                </ol>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Pick when it&rsquo;s due again to see the dates.
                </p>
              )}
            </section>

            {who === "everyone" && !editing && pastClients > 0 ? (
              <p className="rounded-xl border px-4 py-3 text-sm" data-testid="past-clients">
                <span className="font-bold">
                  {pastClients} past {pastClients === 1 ? "client" : "clients"} will be reminded
                  too.
                </span>{" "}
                <span className="text-muted-foreground">
                  They had a {service?.name ?? serviceNoun} recently and haven&rsquo;t booked it
                  again. Anyone more than 6 months overdue is left alone.
                </span>
              </p>
            ) : null}

            {duplicate ? (
              <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-[13px] text-warning-foreground sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1">
                  {firstName} already has a reminder for {service?.name ?? `this ${serviceNoun}`}
                  {duplicate.linkedRecord ? ` on ${duplicate.linkedRecord.label}` : ""}, due{" "}
                  {formatReminderWhen(duplicate.dueAt, timezone, { dateStyle: "medium" })}. Saving
                  adds a second one.
                </p>
                {onShowExisting ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 self-start sm:self-center"
                    onClick={() => {
                      showingExisting.current = true;
                      onClose();
                      onShowExisting(duplicate);
                    }}
                  >
                    Show it
                  </Button>
                ) : null}
              </div>
            ) : null}

            {editing ? (
              <button
                type="button"
                className="w-fit cursor-pointer text-[13px] font-bold text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                Delete this reminder
              </button>
            ) : null}
          </form>

          <footer className="flex gap-2 border-t px-4 sm:px-6 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="max-sm:hidden"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="reminder-form"
              className="max-sm:h-12 max-sm:flex-1"
              disabled={busy}
            >
              {primary}
            </Button>
          </footer>
        </SheetContent>
      </Sheet>

      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        what="this reminder"
        onDiscard={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(o) => (busy ? undefined : setConfirmDelete(o))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reminder?</AlertDialogTitle>
            <AlertDialogDescription>
              {!canStopScheduled
                ? "Clients already waiting on it will still be reminded unless someone who manages bookings dismisses them."
                : scheduled.length > 0
                  ? `${scheduled.length} ${scheduled.length === 1 ? "client is" : "clients are"} waiting on it (${followUpNames(scheduled)}). Keep their reminders, or dismiss them so nothing goes out.`
                  : "Nobody is waiting on it yet."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            {canStopScheduled && scheduled.length > 0 ? (
              <>
                <Button variant="outline" disabled={busy} onClick={() => void remove(false)}>
                  Delete and keep them
                </Button>
                <Button variant="destructive" disabled={busy} onClick={() => void remove(true)}>
                  Delete and dismiss them
                </Button>
              </>
            ) : (
              <Button variant="destructive" disabled={busy} onClick={() => void remove(false)}>
                Delete
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddClientDialog
        open={open && addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onCreated={(c) => {
          touch();
          setCustomer(c);
          setCustomerId(c.id);
          setLinkedRecordId(null);
          setErrors((e) => ({ ...e, customer: undefined }));
        }}
      />
    </>
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
      <Label className="text-[13px] font-bold">
        {title}
        {required ? <span className="text-destructive"> *</span> : null}
        {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
      </Label>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-xs text-destructive">
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

function TimelineRow({
  dot,
  text,
  date,
}: {
  dot: "hollow" | "mint" | "amber";
  text: string;
  date: string;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          dot === "hollow" && "border-2 border-muted-foreground",
          dot === "mint" && "bg-[#2ee6a6]",
          dot === "amber" && "bg-warning",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <span className="shrink-0 font-bold tabular-nums">{date}</span>
    </li>
  );
}

/** Arrow keys move the choice, like a native radio group. */
function radioKeys<T extends string>(
  e: KeyboardEvent<HTMLElement>,
  values: readonly { value: T; disabled?: boolean }[],
  current: T,
  onChange: (v: T) => void,
) {
  const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  const enabled = values.filter((v) => !v.disabled);
  const at = Math.max(
    0,
    enabled.findIndex((v) => v.value === current),
  );
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
  const next = enabled[(at + step + enabled.length) % enabled.length];
  if (!next) return;
  onChange(next.value);
  const group = e.currentTarget;
  requestAnimationFrame(() =>
    group.querySelector<HTMLElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus(),
  );
}

function RadioCards<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; icon: ReactNode; title: string; hint: string }[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-cols-2 gap-2"
      onKeyDown={(e) => radioKeys(e, options, value, onChange)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "grid cursor-pointer gap-1 rounded-xl border p-3 text-left transition-colors",
              on
                ? "border-primary bg-primary-soft ring-[1.5px] ring-primary"
                : "hover:bg-secondary/50",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              {o.icon}
              {o.title}
            </span>
            <span className="text-xs text-muted-foreground">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

function ChoiceChips({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  const focusable = options.some((o) => o.value === value && !o.disabled)
    ? value
    : options.find((o) => !o.disabled)?.value;
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-2"
      onKeyDown={(e) => radioKeys(e, options, value, onChange)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={o.disabled || undefined}
            disabled={o.disabled}
            tabIndex={o.value === focusable ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-10 cursor-pointer rounded-full border px-3.5 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-secondary/60",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
