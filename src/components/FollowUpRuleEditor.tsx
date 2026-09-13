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
import {
  FOLLOW_UP_INTERVAL_PRESETS,
  FOLLOW_UP_MAX_INTERVAL_MONTHS,
  FOLLOW_UP_MAX_LABEL_LENGTH,
  FOLLOW_UP_MAX_LEAD_DAYS,
  FOLLOW_UP_MIN_INTERVAL_MONTHS,
  type FollowUpRuleDraft,
} from "@/lib/follow-ups";

/**
 * "Follow-up reminder" section of the service form: a toggle, interval presets (or a
 * custom number of months), how many days ahead to remind, and an optional label the
 * reminder uses instead of the service name. Stacked so it reads on a phone; the
 * parent owns the draft and validates it with `ruleFromDraft` on save.
 */
export function FollowUpRuleEditor({
  draft,
  onChange,
  error,
  serviceNoun = "service",
  idPrefix = "fu",
}: {
  draft: FollowUpRuleDraft;
  onChange: (draft: FollowUpRuleDraft) => void;
  error?: { field: "intervalMonths" | "leadDays" | "label"; message: string } | null;
  /** The business's word for a service, lower case ("job", "session"). */
  serviceNoun?: string;
  idPrefix?: string;
}) {
  const update = (patch: Partial<FollowUpRuleDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="grid gap-3 border-t pt-4 **:min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <Label htmlFor={`${idPrefix}-enabled`}>Follow-up reminder</Label>
          <p className="text-xs text-muted-foreground">
            Remind the client (and you) when this is due again — e.g. a ceramic top-up every 2
            years. Scheduled automatically from each finished {serviceNoun}.
          </p>
        </div>
        <Switch
          id={`${idPrefix}-enabled`}
          checked={draft.enabled}
          onCheckedChange={(enabled) => update({ enabled })}
          aria-label="Follow-up reminder"
        />
      </div>

      {draft.enabled ? (
        <div className="grid gap-3 rounded-xl border p-3">
          <div className="grid gap-1">
            <Label htmlFor={`${idPrefix}-interval`} className="text-xs text-muted-foreground">
              Due again after
            </Label>
            <Select value={draft.preset} onValueChange={(preset) => update({ preset })}>
              <SelectTrigger id={`${idPrefix}-interval`} className="w-full">
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
                  id={`${idPrefix}-custom-months`}
                  type="number"
                  inputMode="numeric"
                  min={FOLLOW_UP_MIN_INTERVAL_MONTHS}
                  max={FOLLOW_UP_MAX_INTERVAL_MONTHS}
                  step={1}
                  value={draft.customMonths}
                  onChange={(e) => update({ customMonths: e.target.value })}
                  placeholder="e.g. 30"
                  aria-label="Custom interval in months"
                  aria-invalid={error?.field === "intervalMonths" || undefined}
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">months</span>
              </div>
            ) : null}
            {error?.field === "intervalMonths" ? (
              <p className="text-xs text-destructive">{error.message}</p>
            ) : null}
          </div>

          <div className="grid gap-1">
            <Label htmlFor={`${idPrefix}-lead`} className="text-xs text-muted-foreground">
              Remind this many days before
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={`${idPrefix}-lead`}
                type="number"
                inputMode="numeric"
                min={0}
                max={FOLLOW_UP_MAX_LEAD_DAYS}
                step={1}
                value={draft.leadDays}
                onChange={(e) => update({ leadDays: e.target.value })}
                aria-invalid={error?.field === "leadDays" || undefined}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            {error?.field === "leadDays" ? (
              <p className="text-xs text-destructive">{error.message}</p>
            ) : null}
          </div>

          <div className="grid gap-1">
            <Label htmlFor={`${idPrefix}-label`} className="text-xs text-muted-foreground">
              What to call it <span className="font-normal">(optional)</span>
            </Label>
            <Input
              id={`${idPrefix}-label`}
              value={draft.label}
              maxLength={FOLLOW_UP_MAX_LABEL_LENGTH}
              onChange={(e) => update({ label: e.target.value })}
              placeholder="e.g. Ceramic top-up"
              aria-invalid={error?.field === "label" || undefined}
            />
            <p className="text-xs text-muted-foreground">
              Used in the reminder instead of the {serviceNoun} name — “your Ceramic top-up is due
              soon”.
            </p>
            {error?.field === "label" ? (
              <p className="text-xs text-destructive">{error.message}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
