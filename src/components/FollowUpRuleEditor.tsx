import { Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  FOLLOW_UP_INTERVAL_PRESETS,
  FOLLOW_UP_MAX_INTERVAL_MONTHS,
  FOLLOW_UP_MAX_LABEL_LENGTH,
  FOLLOW_UP_MAX_LEAD_DAYS,
  FOLLOW_UP_MAX_RULES,
  FOLLOW_UP_MIN_INTERVAL_MONTHS,
  newFollowUpDraft,
  type FollowUpRuleDraft,
  type FollowUpRuleField,
} from "@/lib/follow-ups";

export type FollowUpRuleError = { index: number; field: FollowUpRuleField; message: string };

/**
 * "Follow-up reminders" section of the service form: a toggle, then one card per
 * reminder — interval presets (or a custom number of months), how many days ahead to
 * remind, and an optional label the reminder uses instead of the service name — with
 * "Add another" so a coating can carry a one-year valet *and* a two-year top-up.
 * Stacked so it reads on a phone; the parent owns the drafts and validates them with
 * `rulesFromDrafts` on save.
 */
export function FollowUpRuleEditor({
  drafts,
  onChange,
  error,
  serviceNoun = "service",
  idPrefix = "fu",
}: {
  drafts: FollowUpRuleDraft[];
  onChange: (drafts: FollowUpRuleDraft[]) => void;
  error?: FollowUpRuleError | null;
  /** The business's word for a service, lower case ("job", "session"). */
  serviceNoun?: string;
  idPrefix?: string;
}) {
  const enabled = drafts.length > 0;
  const update = (index: number, patch: Partial<FollowUpRuleDraft>) =>
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  const remove = (index: number) => onChange(drafts.filter((_, i) => i !== index));
  const add = () => onChange([...drafts, newFollowUpDraft(drafts)]);

  return (
    <div className="grid gap-3 border-t pt-4 **:min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <Label htmlFor={`${idPrefix}-enabled`}>Follow-up reminders</Label>
          <p className="text-xs text-muted-foreground">
            Remind the client (and you) when this is due again — e.g. a valet after a year and a
            ceramic top-up every 2 years. Each is scheduled automatically from every finished{" "}
            {serviceNoun}.
          </p>
        </div>
        <Switch
          id={`${idPrefix}-enabled`}
          checked={enabled}
          onCheckedChange={(on) => onChange(on ? [newFollowUpDraft([])] : [])}
          aria-label="Follow-up reminders"
        />
      </div>

      {enabled ? (
        <div className="grid gap-3">
          {drafts.map((draft, index) => {
            const err = error?.index === index ? error : null;
            const id = `${idPrefix}-${index}`;
            return (
              <div
                key={draft.key}
                className="grid gap-3 rounded-xl border p-3"
                data-testid="follow-up-rule"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Reminder {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground"
                    onClick={() => remove(index)}
                    aria-label={`Remove reminder ${index + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                    Remove
                  </Button>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor={`${id}-interval`} className="text-xs text-muted-foreground">
                    Due again after
                  </Label>
                  <Select
                    value={draft.preset}
                    onValueChange={(preset) => update(index, { preset })}
                  >
                    <SelectTrigger id={`${id}-interval`} className="w-full">
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
                        id={`${id}-custom-months`}
                        type="number"
                        inputMode="numeric"
                        min={FOLLOW_UP_MIN_INTERVAL_MONTHS}
                        max={FOLLOW_UP_MAX_INTERVAL_MONTHS}
                        step={1}
                        value={draft.customMonths}
                        onChange={(e) => update(index, { customMonths: e.target.value })}
                        placeholder="e.g. 30"
                        aria-label="Custom interval in months"
                        aria-invalid={err?.field === "intervalMonths" || undefined}
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">months</span>
                    </div>
                  ) : null}
                  {err?.field === "intervalMonths" ? (
                    <p className="text-xs text-destructive">{err.message}</p>
                  ) : null}
                </div>

                <div className="grid gap-1">
                  <Label htmlFor={`${id}-lead`} className="text-xs text-muted-foreground">
                    Remind this many days before
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${id}-lead`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={FOLLOW_UP_MAX_LEAD_DAYS}
                      step={1}
                      value={draft.leadDays}
                      onChange={(e) => update(index, { leadDays: e.target.value })}
                      aria-invalid={err?.field === "leadDays" || undefined}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">days</span>
                  </div>
                  {err?.field === "leadDays" ? (
                    <p className="text-xs text-destructive">{err.message}</p>
                  ) : null}
                </div>

                <div className="grid gap-1">
                  <Label htmlFor={`${id}-label`} className="text-xs text-muted-foreground">
                    What to call it <span className="font-normal">(optional)</span>
                  </Label>
                  <Input
                    id={`${id}-label`}
                    value={draft.label}
                    maxLength={FOLLOW_UP_MAX_LABEL_LENGTH}
                    onChange={(e) => update(index, { label: e.target.value })}
                    placeholder={index === 0 ? "e.g. Ceramic top-up" : "e.g. Maintenance valet"}
                    aria-invalid={err?.field === "label" || undefined}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in the reminder instead of the {serviceNoun} name — “your Ceramic top-up is
                    due soon”.
                  </p>
                  {err?.field === "label" ? (
                    <p className="text-xs text-destructive">{err.message}</p>
                  ) : null}
                </div>
              </div>
            );
          })}

          {drafts.length < FOLLOW_UP_MAX_RULES ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={add}
            >
              <Plus className="size-4" />
              Add another reminder
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              That is the most reminders one {serviceNoun} can carry.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
