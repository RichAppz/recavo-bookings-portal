import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { useUpdateService } from "@/lib/api/hooks";
import type { CatalogueService, ServiceFollowUpRule } from "@/lib/api/types";
import {
  FOLLOW_UP_DEFAULT_LEAD_DAYS,
  FOLLOW_UP_INTERVAL_PRESETS,
  FOLLOW_UP_MAX_INTERVAL_MONTHS,
  FOLLOW_UP_MAX_LABEL_LENGTH,
  FOLLOW_UP_MAX_LEAD_DAYS,
  FOLLOW_UP_MAX_RULES,
  FOLLOW_UP_MIN_INTERVAL_MONTHS,
  draftFromRule,
  draftsFromRules,
  followUpRuleSummary,
  rulesFromDrafts,
  rulesWithSaved,
  rulesWithout,
  type FollowUpRuleDraft,
  type FollowUpRuleField,
} from "@/lib/follow-ups";

export type ReminderRuleTarget =
  | { mode: "add"; serviceId?: string }
  | { mode: "edit"; serviceId: string; rule: ServiceFollowUpRule };

function blankDraft(): FollowUpRuleDraft {
  return {
    key: "reminder-dialog",
    id: null,
    preset: "2",
    customMonths: "",
    leadDays: String(FOLLOW_UP_DEFAULT_LEAD_DAYS),
    label: "",
  };
}

/**
 * Add or change one follow-up reminder from the Reminders page, without opening the
 * service form: pick the service, how often it is due again, how far ahead to remind,
 * and what to call it. Saves by sending the service's full `followUps` list back with
 * this rule swapped in (or appended), so the others keep their ids and the follow-ups
 * already scheduled from them.
 */
export function ReminderRuleDialog({
  target,
  onOpenChange,
  services,
  serviceNoun,
}: {
  /** Null when closed. */
  target: ReminderRuleTarget | null;
  onOpenChange: (open: boolean) => void;
  services: CatalogueService[];
  /** The business's word for a service, lower case ("session", "service"). */
  serviceNoun: string;
}) {
  const updateService = useUpdateService();
  const open = target !== null;
  const editing = target?.mode === "edit" ? target.rule : null;

  const [serviceId, setServiceId] = useState("");
  const [draft, setDraft] = useState<FollowUpRuleDraft>(blankDraft);
  const [error, setError] = useState<{
    field: FollowUpRuleField | "service";
    message: string;
  } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Fresh form each time it opens: the rule being edited, or a blank 2-month reminder
  // against the chosen (or only) service.
  useEffect(() => {
    if (!target) return;
    setError(null);
    setConfirmRemove(false);
    if (target.mode === "edit") {
      setServiceId(target.serviceId);
      setDraft(draftFromRule(target.rule));
      return;
    }
    const active = services.filter((s) => s.active);
    setServiceId(target.serviceId ?? (active.length === 1 ? active[0]!.id : ""));
    setDraft(blankDraft());
    // Only re-seed when the dialog opens or its target changes, not as the catalogue refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const service = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const choices = useMemo(
    () =>
      services
        .filter((s) => s.active || s.id === serviceId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [services, serviceId],
  );
  const full = !editing && service !== undefined && service.followUps.length >= FOLLOW_UP_MAX_RULES;

  const save = async () => {
    if (!service) {
      setError({ field: "service", message: `Pick the ${serviceNoun} this reminder is for.` });
      return;
    }
    if (full) {
      setError({
        field: "service",
        message: `That ${serviceNoun} already carries ${FOLLOW_UP_MAX_RULES} reminders — change one of those instead.`,
      });
      return;
    }
    // Validate this rule alongside the service's others so a duplicate interval is
    // caught here rather than by the API.
    const others = draftsFromRules(service.followUps).filter((d) => d.id !== editing?.id);
    const result = rulesFromDrafts([...others, { ...draft, id: editing?.id ?? null }]);
    if (!result.ok) {
      const mine = result.index === others.length;
      setError({
        field: mine ? result.field : "service",
        message: mine
          ? result.message.replace(/^Reminder \d+ already uses/, "This service is already reminded")
          : result.message,
      });
      return;
    }
    const saved = result.rules[others.length]!;
    setError(null);
    try {
      await updateService.mutateAsync({
        serviceId: service.id,
        version: service.version,
        body: { followUps: rulesWithSaved(service.followUps, saved) },
      });
      toast.success(
        editing
          ? "Reminder updated"
          : `Reminder added — ${followUpRuleSummary(saved)} on ${service.name}`,
      );
      onOpenChange(false);
    } catch {
      // The mutation hook has already toasted the reason (and refetched on a 409);
      // the dialog stays open so nothing typed is lost.
    }
  };

  const remove = async () => {
    if (!service || !editing) return;
    try {
      await updateService.mutateAsync({
        serviceId: service.id,
        version: service.version,
        body: { followUps: rulesWithout(service.followUps, editing.id) },
      });
      toast.success("Reminder removed");
      onOpenChange(false);
    } catch {
      // Toasted by the hook.
    }
  };

  const busy = updateService.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit reminder" : "Add a reminder"}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Clients who have had ${service?.name ?? `this ${serviceNoun}`} are reminded when it is due again.`
              : `After each finished ${serviceNoun}, the client (and you) are reminded when it is due again — a maintenance wash every 2 months, a coating top-up every 2 years.`}
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
            <Label htmlFor="reminder-service">
              {serviceNoun.charAt(0).toUpperCase() + serviceNoun.slice(1)}
            </Label>
            <Select
              value={serviceId}
              onValueChange={(v) => {
                setServiceId(v);
                setError(null);
              }}
              disabled={Boolean(editing)}
            >
              <SelectTrigger
                id="reminder-service"
                className="w-full"
                aria-invalid={error?.field === "service" || undefined}
              >
                <SelectValue placeholder={`Pick a ${serviceNoun}`} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.followUps.length > 0 ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {s.followUps.length} {s.followUps.length === 1 ? "reminder" : "reminders"}
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error?.field === "service" ? (
              <p className="text-xs text-destructive">{error.message}</p>
            ) : full ? (
              <p className="text-xs text-destructive">
                That {serviceNoun} already carries {FOLLOW_UP_MAX_RULES} reminders — edit one of
                those instead.
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reminder-interval">Due again after</Label>
            <Select
              value={draft.preset}
              onValueChange={(preset) => {
                setDraft((d) => ({ ...d, preset }));
                setError(null);
              }}
            >
              <SelectTrigger id="reminder-interval" className="w-full">
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
                  id="reminder-custom-months"
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
            {error?.field === "intervalMonths" ? (
              <p className="text-xs text-destructive">{error.message}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reminder-lead">Remind this many days before</Label>
            <div className="flex items-center gap-2">
              <Input
                id="reminder-lead"
                type="number"
                inputMode="numeric"
                min={0}
                max={FOLLOW_UP_MAX_LEAD_DAYS}
                step={1}
                value={draft.leadDays}
                onChange={(e) => setDraft((d) => ({ ...d, leadDays: e.target.value }))}
                aria-invalid={error?.field === "leadDays" || undefined}
                className="w-28"
              />
              <span className="text-base text-muted-foreground md:text-sm">days</span>
            </div>
            {error?.field === "leadDays" ? (
              <p className="text-xs text-destructive">{error.message}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reminder-label">
              What to call it <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="reminder-label"
              value={draft.label}
              maxLength={FOLLOW_UP_MAX_LABEL_LENGTH}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="e.g. Maintenance wash"
              aria-invalid={error?.field === "label" || undefined}
            />
            <p className="text-xs text-muted-foreground">
              Used in the reminder instead of the {serviceNoun} name — “your Maintenance wash is due
              soon”.
            </p>
            {error?.field === "label" ? (
              <p className="text-xs text-destructive">{error.message}</p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              confirmRemove ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    Remove reminder
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmRemove(false)}
                  >
                    Keep
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={busy}
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 className="size-4" />
                  Remove
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || full}>
                {busy ? "Saving…" : editing ? "Save" : "Add reminder"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
