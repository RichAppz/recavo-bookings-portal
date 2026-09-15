import { useEffect, useState } from "react";
import { Check, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet, BottomSheetContent, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { ApiError } from "@/lib/api";
import { useJoinPublicWaitlist } from "@/lib/api/hooks";
import type { PublicWaitlistReceipt, WaitlistTimeOfDay } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { TIME_OF_DAY_LABELS, WEEKDAYS } from "@/lib/waitlist";

export type JoinWaitlistContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

/**
 * "Can't find a time? Join the waitlist." A short bottom sheet on the public booking
 * page: who they are, roughly when they could do it, a note. The studio gets the
 * entry and rings them — there is no promise of an automatic booking.
 */
export function JoinWaitlistSheet({
  open,
  onOpenChange,
  businessId,
  serviceId,
  serviceName,
  locationId,
  date,
  contact,
  studioName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  serviceId: string;
  serviceName: string;
  locationId?: string | null;
  /** The day they were looking at — becomes the start of their window. */
  date?: string;
  /** Whatever the visitor has already typed (or their account details). */
  contact: JoinWaitlistContact;
  studioName: string | null;
}) {
  const join = useJoinPublicWaitlist(businessId);
  const [firstName, setFirstName] = useState(contact.firstName);
  const [lastName, setLastName] = useState(contact.lastName);
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone);
  const [from, setFrom] = useState(date ?? "");
  const [to, setTo] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<WaitlistTimeOfDay>("any");
  const [notes, setNotes] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<PublicWaitlistReceipt | null>(null);

  // Fresh each time it opens, seeded from what the page already knows.
  useEffect(() => {
    if (!open) return;
    setFirstName(contact.firstName);
    setLastName(contact.lastName);
    setEmail(contact.email);
    setPhone(contact.phone);
    setFrom(date ?? "");
    setTo("");
    setDays([]);
    setTimeOfDay("any");
    setNotes("");
    setErrors({});
    setDone(null);
    // Only when the sheet opens; typing into the page behind it must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleDay = (value: number) =>
    setDays((d) => (d.includes(value) ? d.filter((x) => x !== value) : [...d, value].sort()));

  const submit = () => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = "Please tell us your first name";
    if (!email.trim() && !phone.trim()) next.email = "We need an email or a mobile to reach you";
    if (from && to && to < from) next.to = "The window can't end before it starts";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    join.mutate(
      {
        serviceId,
        locationId: locationId ?? null,
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        preferences: {
          from: from || null,
          to: to || null,
          days: days.length > 0 ? days : null,
          timeOfDay,
        },
        notes: notes.trim() || null,
        marketingConsent,
      },
      {
        onSuccess: setDone,
        onError: (err) => {
          if (err instanceof ApiError && err.fieldErrors.length > 0) {
            const fieldErrors: Record<string, string> = {};
            for (const fe of err.fieldErrors) {
              if (fe.field) fieldErrors[fe.field] = fe.message || fe.code || "Invalid";
            }
            setErrors(fieldErrors);
            toast.error(err.title || "Please check your details");
            return;
          }
          toast.error(err instanceof ApiError ? err.title : "Something went wrong");
        },
      },
    );
  };

  const who = studioName ?? "the team";

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent aria-describedby={undefined} className="sm:mx-auto sm:max-w-lg">
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <BottomSheetTitle className="text-base font-semibold">
              {done ? "You're on the list" : "Join the waitlist"}
            </BottomSheetTitle>
            {done ? null : (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {serviceName} · {who} will be in touch when a slot opens up.
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {done ? "Done" : "Cancel"}
          </Button>
        </header>

        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="size-6" />
            </span>
            <p className="text-lg font-semibold">
              {done.alreadyOnList ? "You're already on the list" : "You're on the list"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {who} will get in touch when a {serviceName.toLowerCase()} slot opens that suits you.
              Nothing is booked yet — they'll confirm a time with you first.
            </p>
            <Button className="mt-2" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="wl-first">First name</Label>
                  <Input
                    id="wl-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jamie"
                    aria-invalid={Boolean(errors.firstName)}
                    autoComplete="given-name"
                  />
                  {errors.firstName ? (
                    <p className="text-xs text-destructive">{errors.firstName}</p>
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wl-last">Last name</Label>
                  <Input
                    id="wl-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Ellis"
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="wl-email">Email</Label>
                  <Input
                    id="wl-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jamie@example.co.uk"
                    aria-invalid={Boolean(errors.email)}
                    autoComplete="email"
                  />
                  {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wl-phone">Mobile</Label>
                  <Input
                    id="wl-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07700 900000"
                    aria-invalid={Boolean(errors.phone)}
                    autoComplete="tel"
                  />
                  {errors.phone ? <p className="text-xs text-destructive">{errors.phone}</p> : null}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>When could you do it?</Label>
                <div className="grid grid-cols-2 gap-2">
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
                      aria-invalid={Boolean(errors.to)}
                    />
                  </div>
                </div>
                {errors.to ? <p className="text-xs text-destructive">{errors.to}</p> : null}
                <p className="text-xs text-muted-foreground">Leave blank if any time soon works.</p>
              </div>

              <div className="grid gap-1.5">
                <Label>Days that suit</Label>
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
              </div>

              <div className="grid gap-1.5">
                <Label>Time of day</Label>
                <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Time of day">
                  {(Object.keys(TIME_OF_DAY_LABELS) as WaitlistTimeOfDay[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={timeOfDay === k}
                      onClick={() => setTimeOfDay(k)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                        timeOfDay === k
                          ? "border-primary bg-primary-soft text-primary"
                          : "text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      {TIME_OF_DAY_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="wl-notes">Anything we should know? (optional)</Label>
                <Textarea
                  id="wl-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                  rows={2}
                  maxLength={2000}
                />
              </div>

              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  checked={marketingConsent}
                  onCheckedChange={(v) => setMarketingConsent(v === true)}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  Keep me posted about offers and news from {who}.
                </span>
              </label>
            </div>
            <div className="border-t p-4">
              <Button size="xl" className="w-full" onClick={submit} disabled={join.isPending}>
                <Hourglass className="size-4" />
                {join.isPending ? "Joining…" : "Join the waitlist"}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                No payment, no booking yet — {who} will confirm a time with you.
              </p>
            </div>
          </>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
