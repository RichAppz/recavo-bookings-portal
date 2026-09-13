import { useEffect, useState } from "react";
import { BellRing, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
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
import { ApiError } from "@/lib/api";
import { useUpdateConfiguration } from "@/lib/api/hooks";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import { PERMISSIONS } from "@/lib/permissions";
import {
  CHANNEL_LABELS,
  describeOffset,
  newRow,
  REMINDER_LIMITS,
  rowsFromRules,
  rulesFromRows,
  validateRows,
  type ReminderChannel,
  type ReminderUnit,
  type RowIssue,
  type RuleRow,
} from "@/lib/reminders/rule-form";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const ISSUE_TEXT: Record<RowIssue, string> = {
  INVALID: "Enter a whole number.",
  OUT_OF_RANGE: "Between 5 minutes and 30 days before.",
  DUPLICATE: "Two reminders can't go at the same time.",
};

/**
 * Booking reminder rules (RECA-530): when reminders go out and by which channel.
 * Saving replaces the whole set; the API then rebuilds open reminders for upcoming
 * bookings without resending any already sent. SMS is allowed on every plan (ADR
 * 0020): whether a reminder actually goes by text is settled at send time from the
 * credit balance, so the editor just says what that balance is.
 */
export function BookingRemindersSetting({ className }: { className?: string }) {
  const tenant = useTenant();
  const update = useUpdateConfiguration();
  const smsCredits = useSmsCreditsSummary();
  const saved = tenant.configuration?.reminders?.rules;

  const [rows, setRows] = useState<RuleRow[]>(() => rowsFromRules(saved));
  const [dirty, setDirty] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Adopt saved rules once configuration loads, but never clobber in-progress edits.
  const savedSnapshot = JSON.stringify(saved ?? null);
  useEffect(() => {
    if (dirty) return;
    setRows(rowsFromRules(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSnapshot]);

  const patch = (key: string, changes: Partial<RuleRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)));
    setDirty(true);
    setInlineError(null);
  };
  const remove = (key: string) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setDirty(true);
    setInlineError(null);
  };
  const add = () => {
    setRows((rs) => [...rs, newRow()]);
    setDirty(true);
    setInlineError(null);
  };

  const setChannel = (key: string, channel: ReminderChannel) => patch(key, { channel });

  const issues = validateRows(rows);
  const canSave = dirty && issues.size === 0 && !update.isPending;
  const savedCount = saved?.length ?? 0;

  const save = async () => {
    try {
      const rules = rulesFromRows(rows);
      await update.mutateAsync({ reminders: { rules } });
      setDirty(false);
      toast.success(
        rules.length === 0
          ? "Automatic reminders are off"
          : `Reminders saved — ${rules.map((r) => describeOffset(r.minutesBefore)).join(", ")}`,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setInlineError("Your role can't change reminders — ask an admin.");
          return;
        }
        const fieldErr = err.fieldErrors.find((fe) => fe.field.startsWith("reminders"));
        if (fieldErr) {
          setInlineError(fieldErr.message ?? "Check the reminders and try again.");
          return;
        }
      }
      // useUpdateConfiguration already toasts other API errors.
    }
  };

  return (
    <section className={cn("rounded-xl border p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <BellRing className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold tracking-tight">Booking reminders</p>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase",
                  savedCount > 0 ? "bg-primary text-primary-foreground" : "bg-secondary",
                )}
              >
                {savedCount > 0 ? `${savedCount} on` : "Off"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Automatic reminders to clients before each booking. Changes apply to upcoming bookings
              straight away; reminders already sent are never repeated.
            </p>
          </div>
        </div>
      </div>

      <Can
        permission={PERMISSIONS.BUSINESS_UPDATE}
        fallback={
          <ul className="mt-4 grid gap-1 text-sm">
            {(saved ?? []).map((r) => (
              <li key={r.minutesBefore}>
                {describeOffset(r.minutesBefore)} · {CHANNEL_LABELS[r.channel]}
              </li>
            ))}
            {savedCount === 0 ? (
              <li className="text-muted-foreground">No automatic reminders.</li>
            ) : null}
            <li className="text-xs text-muted-foreground">An admin can change this.</li>
          </ul>
        }
      >
        <div className="mt-4 grid gap-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No automatic reminders. Add one to remind clients before their booking.
            </p>
          ) : null}
          {rows.map((row, i) => {
            const issue = issues.get(row.key);
            return (
              <div key={row.key} className="grid gap-1.5">
                <div className="grid grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[5rem_8rem_minmax(0,1fr)_auto]">
                  <div className="grid gap-1.5">
                    {i === 0 ? <Label htmlFor={`rem-amount-${row.key}`}>Send</Label> : null}
                    <Input
                      id={`rem-amount-${row.key}`}
                      inputMode="numeric"
                      value={row.amount}
                      aria-invalid={issue ? true : undefined}
                      onChange={(e) => patch(row.key, { amount: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    {i === 0 ? <Label>&nbsp;</Label> : null}
                    <Select
                      value={row.unit}
                      onValueChange={(v) => patch(row.key, { unit: v as ReminderUnit })}
                    >
                      <SelectTrigger aria-label="Unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minutes">minutes before</SelectItem>
                        <SelectItem value="hours">hours before</SelectItem>
                        <SelectItem value="days">days before</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 grid gap-1.5 sm:col-span-1">
                    {i === 0 ? <Label className="hidden sm:block">By</Label> : null}
                    <Select
                      value={row.channel}
                      onValueChange={(v) => setChannel(row.key, v as ReminderChannel)}
                    >
                      <SelectTrigger aria-label="Channel">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preferred">{CHANNEL_LABELS.preferred}</SelectItem>
                        <SelectItem value="email">{CHANNEL_LABELS.email}</SelectItem>
                        <SelectItem value="sms">{CHANNEL_LABELS.sms}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    {i === 0 ? <Label className="hidden sm:block">&nbsp;</Label> : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove reminder"
                      onClick={() => remove(row.key)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {issue ? <p className="text-xs text-destructive">{ISSUE_TEXT[issue]}</p> : null}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={add}
              disabled={rows.length >= REMINDER_LIMITS.maxRules}
            >
              <Plus className="size-4" /> Add reminder
            </Button>
            {rows.length >= REMINDER_LIMITS.maxRules ? (
              <span className="text-xs text-muted-foreground">
                Up to {REMINDER_LIMITS.maxRules} reminders.
              </span>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>Client's preference</strong> follows each client's contact setting.{" "}
            <strong>SMS</strong> texts clients who have a mobile number and haven't opted out —
            anyone else gets an email instead.
          </p>
          {smsCredits.credits ? (
            <p
              className={cn(
                "text-xs",
                smsCredits.level === "empty"
                  ? "text-destructive"
                  : smsCredits.level === "low"
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground",
              )}
            >
              {smsCredits.note}
              {smsCredits.level !== "unlimited" ? (
                <>
                  {" "}
                  <Link to="/billing/sms-credits" className="underline underline-offset-2">
                    {smsCredits.level === "empty" ? "Buy texts" : "Text credits"}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}

          {inlineError ? <p className="text-sm text-destructive">{inlineError}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={save} disabled={!canSave}>
              {update.isPending ? "Saving…" : "Save reminders"}
            </Button>
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRows(rowsFromRules(saved));
                  setDirty(false);
                  setInlineError(null);
                }}
              >
                Discard changes
              </Button>
            ) : null}
          </div>
        </div>
      </Can>
    </section>
  );
}
