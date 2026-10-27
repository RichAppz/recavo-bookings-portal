import { useEffect, useState } from "react";
import { Check, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet, BottomSheetContent, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { DayToggles, TimeOfDayButtons } from "@/components/waitlist/parts";
import { useIsPhone } from "@/hooks/use-media-query";
import { ApiError } from "@/lib/api";
import { useJoinPublicWaitlist } from "@/lib/api/hooks";
import type { PublicWaitlistReceipt, WaitlistTimeOfDay } from "@/lib/api/types";
import { describeForClient } from "@/lib/waitlist";

export type JoinWaitlistContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type Field = "firstName" | "contact" | "to";

/**
 * "None of these work? Join the waitlist." A short bottom sheet on the public booking
 * page: who they are, roughly when they could do it, a note. The business gets the
 * entry and gets in touch; nothing is booked automatically.
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
  /** The day they were looking at; becomes the start of their window. */
  date?: string;
  /** Whatever the visitor has already typed (or their account details). */
  contact: JoinWaitlistContact;
  studioName: string | null;
}) {
  const join = useJoinPublicWaitlist(businessId);
  const isPhone = useIsPhone();
  const [firstName, setFirstName] = useState(contact.firstName);
  const [lastName, setLastName] = useState(contact.lastName);
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone);
  const [showEmail, setShowEmail] = useState(Boolean(contact.email));
  const [from, setFrom] = useState(date ?? "");
  const [to, setTo] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<WaitlistTimeOfDay>("any");
  const [notes, setNotes] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [done, setDone] = useState<PublicWaitlistReceipt | null>(null);

  // Fresh each time it opens, seeded from what the page already knows.
  useEffect(() => {
    if (!open) return;
    setFirstName(contact.firstName);
    setLastName(contact.lastName);
    setEmail(contact.email);
    setPhone(contact.phone);
    setShowEmail(Boolean(contact.email));
    setFrom(date ?? "");
    setTo("");
    setDays([]);
    setTimeOfDay("any");
    setNotes("");
    setMarketingConsent(false);
    setErrors({});
    setDone(null);
    // Only when the sheet opens; typing into the page behind it must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const clearError = (field: Field) =>
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  const submit = () => {
    const next: Partial<Record<Field, string>> = {};
    if (!firstName.trim()) next.firstName = "Please tell us your first name";
    if (!email.trim() && !phone.trim()) next.contact = "We need a mobile or an email to reach you";
    if (from && to && to < from) next.to = "Until can't be before From";
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
            const fieldErrors: Partial<Record<Field, string>> = {};
            for (const fe of err.fieldErrors) {
              const message = fe.message || fe.code || "Please check this";
              if (fe.field === "firstName") fieldErrors.firstName = message;
              else if (fe.field === "email" || fe.field === "phone") fieldErrors.contact = message;
              else if (fe.field?.startsWith("preferences")) fieldErrors.to = message;
            }
            setErrors(fieldErrors);
            if (Object.keys(fieldErrors).length > 0) return;
          }
          toast.error(err instanceof ApiError ? err.title : "Something went wrong");
        },
      },
    );
  };

  const who = studioName ?? "The team";
  const whoLower = studioName ?? "the team";

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent aria-describedby={undefined} className="sm:mx-auto sm:max-w-lg">
        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-6 text-center">
            <BottomSheetTitle className="sr-only">
              {done.alreadyOnList ? "You're already on the list" : "You're on the list"}
            </BottomSheetTitle>
            <span className="flex size-[60px] items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-7" strokeWidth={3} aria-hidden />
            </span>
            <p className="text-[21px] font-extrabold tracking-tight">
              {done.alreadyOnList ? "You're already on the list" : "You're on the list"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {who} will get in touch when a {serviceName} time opens that suits you. Nothing is
              booked yet.
            </p>
            <div className="w-full max-w-sm rounded-xl border bg-secondary/40 px-4 py-3 text-left">
              <p className="text-sm font-bold">{serviceName}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {describeForClient(done.preferences)}
              </p>
            </div>
            {done.notifiedBy ? (
              <p className="text-xs text-muted-foreground">
                {done.notifiedBy === "sms"
                  ? "We've sent you a text to confirm."
                  : "We've sent you an email to confirm."}
              </p>
            ) : null}
            <Button size="xl" className="mt-2 w-full max-w-sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <BottomSheetTitle className="text-[21px] font-extrabold tracking-tight">
                  Join the waitlist
                </BottomSheetTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {serviceName} · {who} will be in touch when a time opens up.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </header>

            <div className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="wl-first">First name</Label>
                  <Input
                    id="wl-first"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      clearError("firstName");
                    }}
                    aria-invalid={Boolean(errors.firstName)}
                    aria-describedby={errors.firstName ? "wl-first-error" : undefined}
                    autoComplete="given-name"
                  />
                  {errors.firstName ? (
                    <p id="wl-first-error" className="text-xs text-destructive">
                      {errors.firstName}
                    </p>
                  ) : null}
                </div>
                <div className="grid content-start gap-1.5">
                  <Label htmlFor="wl-last">Last name</Label>
                  <Input
                    id="wl-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="wl-phone">Mobile</Label>
                <Input
                  id="wl-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    clearError("contact");
                  }}
                  placeholder="07700 900000"
                  aria-invalid={Boolean(errors.contact)}
                  aria-describedby={errors.contact ? "wl-contact-error" : undefined}
                  autoComplete="tel"
                />
                {showEmail ? (
                  <div className="mt-1.5 grid gap-1.5">
                    <Label htmlFor="wl-email">Email</Label>
                    <Input
                      id="wl-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearError("contact");
                      }}
                      aria-invalid={Boolean(errors.contact)}
                      aria-describedby={errors.contact ? "wl-contact-error" : undefined}
                      autoComplete="email"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Or{" "}
                    <button
                      type="button"
                      onClick={() => setShowEmail(true)}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      add an email
                    </button>{" "}
                    instead. We need one way to reach you.
                  </p>
                )}
                {errors.contact ? (
                  <p id="wl-contact-error" className="text-xs text-destructive">
                    {errors.contact}
                  </p>
                ) : null}
              </div>

              <fieldset className="grid gap-3">
                <legend className="mb-1 text-sm font-semibold">When could you do it?</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="wl-from" className="text-xs text-muted-foreground">
                      From
                    </Label>
                    <Input
                      id="wl-from"
                      type="date"
                      value={from}
                      onChange={(e) => {
                        setFrom(e.target.value);
                        clearError("to");
                      }}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="wl-to" className="text-xs text-muted-foreground">
                      Until
                    </Label>
                    <div className="relative">
                      <Input
                        id="wl-to"
                        type="date"
                        value={to}
                        min={from || undefined}
                        onChange={(e) => {
                          setTo(e.target.value);
                          clearError("to");
                        }}
                        className={to ? "peer" : "peer text-transparent focus:text-foreground"}
                        aria-invalid={Boolean(errors.to)}
                        aria-describedby={errors.to ? "wl-to-error" : undefined}
                      />
                      {to ? null : (
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground peer-focus:hidden">
                          Any time soon
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {errors.to ? (
                  <p id="wl-to-error" className="text-xs text-destructive">
                    {errors.to}
                  </p>
                ) : null}
                <div className="grid gap-1.5">
                  <span className="text-xs text-muted-foreground">Days that suit</span>
                  <DayToggles
                    value={days}
                    onChange={setDays}
                    short={isPhone}
                    label="Days that suit"
                  />
                </div>
                <div className="grid gap-1.5">
                  <span className="text-xs text-muted-foreground">Time of day</span>
                  <TimeOfDayButtons value={timeOfDay} onChange={setTimeOfDay} />
                </div>
              </fieldset>

              <div className="grid gap-1.5">
                <Label htmlFor="wl-notes">Anything we should know? (optional)</Label>
                <Textarea
                  id="wl-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. any days or times you definitely can't do"
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
                  Keep me posted about offers and news from {whoLower}.
                </span>
              </label>
            </div>
            <div className="border-t p-4">
              <Button
                size="xl"
                className="h-[50px] w-full"
                onClick={submit}
                disabled={join.isPending}
              >
                <Hourglass className="size-4" aria-hidden />
                {join.isPending ? "Joining…" : "Join the waitlist"}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Nothing is booked yet. {who} will confirm a time with you.
              </p>
            </div>
          </>
        )}
      </BottomSheetContent>
    </BottomSheet>
  );
}
