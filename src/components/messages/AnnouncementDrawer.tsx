import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useIsPhone } from "@/hooks/use-media-query";
import { ApiError, describeApiError } from "@/lib/api/errors";
import {
  useCustomerTagsCatalogue,
  useLocationsList,
  useServices,
  useSmsCredits,
} from "@/lib/api/hooks";
import {
  useBroadcastAudienceCounts,
  useBroadcastOptions,
  useBroadcastPreview,
  useBroadcasts,
  useCancelBroadcast,
  useSendBroadcast,
  useSendBroadcastTest,
  type Broadcast,
  type BroadcastAudience,
  type BroadcastInput,
  type BroadcastResults,
} from "@/lib/api/messages";
import { formatInTz } from "@/lib/format";
import {
  announcementCounter,
  laterLabel,
  type BroadcastAudienceKind,
  type BroadcastChannelMode,
} from "@/lib/messages";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const AUDIENCES: { kind: BroadcastAudienceKind; label: string; description: string }[] = [
  { kind: "all", label: "All clients", description: "Everyone who can be messaged" },
  {
    kind: "upcoming_30d",
    label: "Booked in the next 30 days",
    description: "Clients with an upcoming booking",
  },
  {
    kind: "lapsed_6m",
    label: "Not seen in 6 months",
    description: "Last visit over 6 months ago, nothing booked",
  },
  { kind: "list", label: "Pick a list", description: "By service, tag, vehicle make or location" },
];

const CHANNELS: { mode: BroadcastChannelMode; label: string }[] = [
  { mode: "sms_else_email", label: "Text, else email" },
  { mode: "email", label: "Email only" },
  { mode: "sms", label: "Text only" },
];

const FIRST_NAME = "{first name}";
const BOOKING_LINK = "{booking link}";

/** "Send announcement": a right drawer on desktop, full screen on a phone. */
export function AnnouncementDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const phone = useIsPhone();
  const [view, setView] = useState<"new" | "history">("new");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex flex-col gap-0 p-0",
          phone ? "h-dvh w-full max-w-none border-0" : "w-full sm:max-w-[480px]",
        )}
      >
        <SheetHeader className="border-b px-4 sm:px-6 pt-6 pb-4 text-left">
          <SheetTitle className="text-[22px] font-extrabold tracking-tight">
            Send announcement
          </SheetTitle>
          <SheetDescription>
            One message to a group of clients. Replies come back to your inbox.
          </SheetDescription>
          <div role="tablist" aria-label="Announcements" className="mt-2 flex gap-1.5">
            {(
              [
                ["new", "New"],
                ["history", "Scheduled and sent"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => setView(value)}
                className={cn(
                  "h-[30px] cursor-pointer rounded-full px-3 text-[13px] font-bold",
                  view === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-foreground/75 hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </SheetHeader>
        {open ? (
          view === "new" ? (
            <Composer onDone={() => onOpenChange(false)} />
          ) : (
            <History />
          )
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Composer({ onDone }: { onDone: () => void }) {
  const { business } = useTenant();
  const tz = business?.defaultTimezone ?? "Europe/London";
  const isCarDetailing = business?.industryTemplateKey === "car_detailing";
  const [kind, setKind] = useState<BroadcastAudienceKind>("all");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [channelMode, setChannelMode] = useState<BroadcastChannelMode>("sms_else_email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [confirm, setConfirm] = useState<null | { at: string | null }>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const ids = { body: useId(), subject: useId(), counter: useId(), schedule: useId() };

  const audience: BroadcastAudience = useMemo(
    () =>
      kind === "list"
        ? {
            kind,
            ...(serviceIds.length ? { serviceIds } : {}),
            ...(tagIds.length ? { tagIds } : {}),
            ...(makes.length ? { makes } : {}),
            ...(locationIds.length ? { locationIds } : {}),
          }
        : { kind },
    [kind, serviceIds, tagIds, makes, locationIds],
  );
  const input: BroadcastInput = {
    audience,
    channelMode,
    body: body.trim(),
    ...(channelMode !== "sms" ? { subject: subject.trim() || null } : {}),
  };
  const previewInput = useDebouncedValue(
    useMemo(() => ({ audience, channelMode, body: body.trim() }), [audience, channelMode, body]),
    300,
  );

  const counts = useBroadcastAudienceCounts(channelMode, true);
  const preview = useBroadcastPreview(previewInput, true);
  const credits = useSmsCredits();
  const send = useSendBroadcast();
  const test = useSendBroadcastTest();

  const p = preview.data;
  const now = new Date();
  const texts = channelMode !== "email";
  const balance = credits.data?.balance ?? 0;
  const unlimited = credits.data?.unlimited ?? false;
  const needCredits = p?.estimatedCredits ?? 0;
  const short = texts && !unlimited && needCredits > balance ? needCredits - balance : 0;
  const counter = texts && p ? announcementCounter(body, p.smsFrame, p.bookingLink) : null;
  const subjectMissing = channelMode !== "sms" && !subject.trim();
  const recipients = p?.recipients ?? 0;
  const smsClosed = texts && (p?.sms ?? 0) > 0 && p?.smsWindow.open === false;
  const scheduleIso = scheduleAt ? new Date(scheduleAt).toISOString() : null;
  const limited = p?.nextAllowedAt && !(scheduleIso && scheduleIso >= p.nextAllowedAt);

  useEffect(() => setProblem(null), [body, subject, channelMode, audience, scheduleAt]);

  const insertField = (token: string) => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const explain = (err: unknown): string => {
    if (err instanceof ApiError) {
      const reason = err.extensions.reason;
      if (reason === "BROADCAST_LIMIT" && typeof err.extensions.nextAllowedAt === "string") {
        return `One announcement per 24 hours. You can send another at ${laterLabel(err.extensions.nextAllowedAt, new Date(), tz)}.`;
      }
      if (reason === "OUTSIDE_SMS_HOURS" && typeof err.extensions.nextOpenAt === "string") {
        return `Texts only go between 08:00 and 20:00. Schedule it for ${laterLabel(err.extensions.nextOpenAt, new Date(), tz)}, or send by email only.`;
      }
      if (reason === "NO_OPT_OUT_LINK")
        return "Announcements aren't set up yet. Please contact support.";
      const field = err.fieldErrors[0];
      if (field?.field === "scheduledFor") {
        return field.code === "TOO_FAR_AHEAD"
          ? "Pick a time within the next 90 days."
          : "Pick a time at least a few minutes from now.";
      }
    }
    return describeApiError(err, "Couldn't send the announcement");
  };

  const doSend = async (at: string | null) => {
    try {
      await send.mutateAsync({ ...input, scheduledFor: at });
      toast.success(
        at
          ? `Scheduled for ${formatInTz(at, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
          : `Sending to ${recipients} client${recipients === 1 ? "" : "s"}`,
      );
      onDone();
    } catch (err) {
      setProblem(explain(err));
    }
  };

  let primary: { label: string; disabled: boolean; action: () => void; buy?: boolean };
  if (!body.trim()) primary = { label: "Write a message", disabled: true, action: () => {} };
  else if (subjectMissing) primary = { label: "Add a subject", disabled: true, action: () => {} };
  else if (!p || preview.isFetching)
    primary = { label: "Checking…", disabled: true, action: () => {} };
  else if (recipients === 0)
    primary = { label: "No one to send to", disabled: true, action: () => {} };
  else if (short)
    primary = {
      label: `Buy ${short} more credits to send`,
      disabled: false,
      action: () => {},
      buy: true,
    };
  else if (scheduling) {
    primary = {
      label: scheduleIso ? `Schedule for ${recipients}` : "Pick a time",
      disabled: !scheduleIso || Boolean(limited),
      action: () => setConfirm({ at: scheduleIso }),
    };
  } else if (limited && p.nextAllowedAt) {
    primary = {
      label: `You can send another at ${laterLabel(p.nextAllowedAt, now, tz)}`,
      disabled: true,
      action: () => {},
    };
  } else if (smsClosed) {
    primary = {
      label: `Send at ${laterLabel(p.smsWindow.nextOpenAt, now, tz).replace(" today", "")}`,
      disabled: false,
      action: () => setConfirm({ at: p.smsWindow.nextOpenAt }),
    };
  } else {
    primary = {
      label: `Send to ${recipients}`,
      disabled: false,
      action: () => setConfirm({ at: null }),
    };
  }

  const countFor = (k: BroadcastAudienceKind) =>
    k === "list" ? (kind === "list" && p ? p.recipients : null) : (counts.data?.[k] ?? null);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <fieldset>
          <legend className="mb-2 text-[13.5px] font-extrabold">Who to send to</legend>
          <div
            role="radiogroup"
            aria-label="Who to send to"
            className="overflow-hidden rounded-[14px] border bg-secondary"
          >
            {AUDIENCES.map((a) => {
              const n = countFor(a.kind);
              return (
                <label
                  key={a.kind}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b px-3.5 py-3 last:border-b-0",
                    kind === a.kind && "bg-panel",
                  )}
                >
                  <input
                    type="radio"
                    name="announcement-audience"
                    value={a.kind}
                    checked={kind === a.kind}
                    onChange={() => setKind(a.kind)}
                    className="size-4 accent-[#10172a] dark:accent-[#6ee7b0]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold">{a.label}</span>
                    <span className="block text-[12.5px] text-muted-foreground">
                      {a.kind === "list" && !isCarDetailing
                        ? "By service, tag or location"
                        : a.description}
                    </span>
                  </span>
                  <span className="text-[13px] font-extrabold tabular-nums">
                    {n === null ? "" : n}
                  </span>
                </label>
              );
            })}
          </div>
          {kind === "list" ? (
            <ListFilters
              serviceIds={serviceIds}
              setServiceIds={setServiceIds}
              tagIds={tagIds}
              setTagIds={setTagIds}
              makes={makes}
              setMakes={setMakes}
              locationIds={locationIds}
              setLocationIds={setLocationIds}
              matched={p?.recipients ?? null}
            />
          ) : null}
        </fieldset>

        <fieldset className="mt-6">
          <legend className="mb-2 text-[13.5px] font-extrabold">Send by</legend>
          <div role="radiogroup" aria-label="Send by" className="grid grid-cols-3 gap-2">
            {CHANNELS.map((c) => (
              <label
                key={c.mode}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border px-2 text-center text-[13px] font-bold has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  channelMode === c.mode
                    ? "border-foreground bg-foreground text-background"
                    : "bg-panel hover:bg-secondary",
                )}
              >
                <input
                  type="radio"
                  name="announcement-channel"
                  value={c.mode}
                  checked={channelMode === c.mode}
                  onChange={() => setChannelMode(c.mode)}
                  className="sr-only"
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 grid gap-3">
          {channelMode !== "sms" ? (
            <div className="grid gap-1.5">
              <Label htmlFor={ids.subject}>Email subject</Label>
              <Input
                id={ids.subject}
                value={subject}
                maxLength={200}
                placeholder={`News from ${business?.tradingName ?? business?.legalName ?? "us"}`}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <div className="flex items-end justify-between gap-2">
              <Label htmlFor={ids.body}>Message</Label>
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                Insert
                <InsertChip onClick={() => insertField(FIRST_NAME)}>First name</InsertChip>
                <InsertChip onClick={() => insertField(BOOKING_LINK)}>Booking link</InsertChip>
              </span>
            </div>
            <Textarea
              id={ids.body}
              ref={bodyRef}
              value={body}
              maxLength={2000}
              onChange={(e) => setBody(e.target.value)}
              aria-describedby={counter ? ids.counter : undefined}
              className="min-h-24"
              placeholder={`Hi ${FIRST_NAME}, we've got a few spaces left this month. Book here: ${BOOKING_LINK}`}
            />
            {counter ? (
              <p
                id={ids.counter}
                className="text-right text-[12px] text-muted-foreground tabular-nums"
              >
                {counter.units} / {counter.limit} · {counter.segments} text
                {counter.segments === 1 ? "" : "s"} each
              </p>
            ) : null}
          </div>
        </div>

        {p ? (
          <CostBox
            recipients={p.recipients}
            sms={p.sms}
            email={p.email}
            credits={p.estimatedCredits}
            balance={balance}
            unlimited={unlimited}
            texts={texts}
          />
        ) : null}

        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Only sent to clients who agreed to marketing.
          {p && p.excludedNoConsent > 0
            ? ` ${p.excludedNoConsent} client${p.excludedNoConsent === 1 ? "" : "s"} who didn't ${p.excludedNoConsent === 1 ? "is" : "are"} left out.`
            : ""}
          {p && p.unreachable > 0
            ? ` ${p.unreachable} can't be reached by the way you picked.`
            : ""}{" "}
          An unsubscribe link is added for you.
        </p>
        {texts ? (
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Texts go between 08:00 and 20:00. One announcement per 24 hours.
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] text-muted-foreground">One announcement per 24 hours.</p>
        )}

        {scheduling ? (
          <div className="mt-5 grid gap-1.5 rounded-[14px] border bg-secondary p-3.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={ids.schedule}>Send on</Label>
              <button
                type="button"
                onClick={() => {
                  setScheduling(false);
                  setScheduleAt("");
                }}
                className="flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-background"
                aria-label="Don't schedule"
              >
                <X className="size-4" />
              </button>
            </div>
            <Input
              id={ids.schedule}
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="bg-background"
            />
          </div>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {p ? `${p.recipients} clients will get this.` : ""}
        </p>
        {problem ? (
          <p
            role="alert"
            className="mt-4 rounded-[10px] bg-destructive/10 px-3.5 py-2.5 text-[13px] font-semibold text-destructive"
          >
            {problem}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t bg-panel px-4 sm:px-6 pt-4 pb-safe-5">
        <Button
          variant="outline"
          size="sm"
          disabled={!body.trim() || subjectMissing || test.isPending}
          onClick={async () => {
            const res = await test.mutateAsync(input);
            if (res.delivered)
              toast.success(
                res.channel === "sms" ? "Test text sent to you" : "Test email sent to you",
              );
            else toast.error(res.error ?? "The test didn't go through");
          }}
        >
          Send me a test
        </Button>
        {!scheduling ? (
          <Button variant="outline" size="sm" onClick={() => setScheduling(true)}>
            <CalendarClock className="size-4" /> Schedule
          </Button>
        ) : null}
        {primary.buy ? (
          <Button asChild className="w-full">
            <Link to="/billing/sms-credits">{primary.label}</Link>
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={primary.disabled || send.isPending}
            onClick={primary.action}
          >
            <Send className="size-4" /> {primary.label}
          </Button>
        )}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.at
                ? `Send to ${recipients} client${recipients === 1 ? "" : "s"} at ${laterLabel(confirm.at, now, tz)}?`
                : `Send to ${recipients} client${recipients === 1 ? "" : "s"} now?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {p
                ? [
                    p.sms ? `${p.sms} by text` : null,
                    p.email ? `${p.email} by email` : null,
                    p.estimatedCredits ? `uses ${p.estimatedCredits} text credits` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : ""}
              . This can't be undone once it starts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doSend(confirm?.at ?? null)}>
              {confirm?.at ? "Schedule" : "Send now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function InsertChip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 cursor-pointer items-center rounded-full border bg-panel px-2.5 text-[12px] font-semibold text-foreground/80 hover:bg-secondary"
    >
      {children}
    </button>
  );
}

function CostBox({
  recipients,
  sms,
  email,
  credits,
  balance,
  unlimited,
  texts,
}: {
  recipients: number;
  sms: number;
  email: number;
  credits: number;
  balance: number;
  unlimited: boolean;
  texts: boolean;
}) {
  const short = texts && !unlimited && credits > balance;
  const split = [sms ? `${sms} by text` : null, email ? `${email} by email` : null]
    .filter(Boolean)
    .join(", ");
  return (
    <div
      className={cn(
        "mt-5 rounded-[14px] px-3.5 py-3 text-[13.5px]",
        short
          ? "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]"
          : "border bg-secondary",
      )}
    >
      <p>
        <strong>
          {recipients} client{recipients === 1 ? "" : "s"}
        </strong>
        {split ? ` · ${split}` : ""}
      </p>
      {texts && credits > 0 ? (
        <p className="mt-0.5">
          {unlimited
            ? `Uses ${credits} text credits.`
            : short
              ? `Uses ${credits} text credits. You have ${balance}. `
              : `Uses ${credits} text credits. You'll have ${balance - credits} left.`}
          {short ? (
            <Link to="/billing/sms-credits" className="font-bold underline">
              Buy credits
            </Link>
          ) : null}
        </p>
      ) : (
        <p className="mt-0.5 text-muted-foreground">Emails are free.</p>
      )}
    </div>
  );
}

function ListFilters({
  serviceIds,
  setServiceIds,
  tagIds,
  setTagIds,
  makes,
  setMakes,
  locationIds,
  setLocationIds,
  matched,
}: {
  serviceIds: string[];
  setServiceIds: (v: string[]) => void;
  tagIds: string[];
  setTagIds: (v: string[]) => void;
  makes: string[];
  setMakes: (v: string[]) => void;
  locationIds: string[];
  setLocationIds: (v: string[]) => void;
  matched: number | null;
}) {
  const services = useServices();
  const tags = useCustomerTagsCatalogue({ status: "active" });
  const locations = useLocationsList();
  const options = useBroadcastOptions();
  const serviceOptions = (services.data ?? []).map((s) => ({ id: s.id, label: s.name }));
  const tagOptions = (tags.data ?? []).map((t) => ({ id: t.id, label: t.name }));
  const makeOptions = (options.data?.makes ?? []).map((m) => ({ id: m, label: m }));
  const locationOptions = (locations.data ?? []).map((l) => ({ id: l.id, label: l.name }));
  return (
    <div className="mt-3 grid gap-3 rounded-[14px] border p-3.5">
      <FilterGroup
        label="Had a service"
        options={serviceOptions}
        value={serviceIds}
        onChange={setServiceIds}
      />
      <FilterGroup label="Tag" options={tagOptions} value={tagIds} onChange={setTagIds} />
      <FilterGroup label="Vehicle make" options={makeOptions} value={makes} onChange={setMakes} />
      {locationOptions.length > 1 ? (
        <FilterGroup
          label="Location"
          options={locationOptions}
          value={locationIds}
          onChange={setLocationIds}
        />
      ) : null}
      <p className="text-[12.5px] font-semibold" aria-live="polite">
        {matched === null ? "Counting…" : `${matched} client${matched === 1 ? "" : "s"} match`}
      </p>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-[11.5px] font-extrabold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
              className={cn(
                "h-7 cursor-pointer rounded-full border px-2.5 text-[12.5px] font-semibold",
                on
                  ? "border-foreground bg-foreground text-background"
                  : "bg-panel hover:bg-secondary",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const AUDIENCE_LABEL: Record<BroadcastAudienceKind, string> = {
  all: "All clients",
  upcoming_30d: "Booked in the next 30 days",
  lapsed_6m: "Not seen in 6 months",
  list: "A picked list",
};

function History() {
  const { business } = useTenant();
  const tz = business?.defaultTimezone ?? "Europe/London";
  const list = useBroadcasts();
  const cancel = useCancelBroadcast();
  const rows = list.data ?? [];
  const scheduled = rows.filter((r) => r.broadcast.status === "scheduled");
  const done = rows.filter((r) => r.broadcast.status !== "scheduled");

  if (list.isLoading)
    return <p className="px-4 sm:px-6 py-5 text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0) {
    return (
      <p className="px-4 sm:px-6 py-8 text-center text-[13.5px] text-muted-foreground">
        Announcements you schedule or send show here, with how they did.
      </p>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6 py-5">
      {scheduled.length ? (
        <section aria-label="Scheduled">
          <h3 className="mb-2 text-[13.5px] font-extrabold">Scheduled</h3>
          <ul className="grid gap-2.5">
            {scheduled.map(({ broadcast }) => (
              <li key={broadcast.id} className="rounded-[14px] border bg-secondary p-3.5">
                <BroadcastSummary broadcast={broadcast} tz={tz} />
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2.5"
                  disabled={cancel.isPending}
                  onClick={async () => {
                    await cancel.mutateAsync(broadcast.id);
                    toast.success("Announcement cancelled");
                  }}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {done.length ? (
        <section aria-label="Sent" className={scheduled.length ? "mt-6" : undefined}>
          <h3 className="mb-2 text-[13.5px] font-extrabold">Sent</h3>
          <ul className="grid gap-2.5">
            {done.map(({ broadcast, results }) => (
              <li key={broadcast.id} className="rounded-[14px] border p-3.5">
                <BroadcastSummary broadcast={broadcast} tz={tz} />
                {broadcast.status === "cancelled" ? (
                  <p className="mt-2 text-[12.5px] font-semibold text-muted-foreground">
                    Cancelled
                  </p>
                ) : (
                  <ResultsLine broadcast={broadcast} results={results} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function BroadcastSummary({ broadcast, tz }: { broadcast: Broadcast; tz: string }) {
  const when = broadcast.sentAt ?? broadcast.scheduledFor ?? broadcast.createdAt;
  return (
    <>
      <p className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span>{AUDIENCE_LABEL[broadcast.audience.kind]}</span>
        <span>
          {broadcast.status === "sending" ? "Sending… · " : ""}
          {formatInTz(when, tz, {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </p>
      {broadcast.subject ? (
        <p className="mt-1 text-[13.5px] font-bold">{broadcast.subject}</p>
      ) : null}
      <p className="mt-0.5 line-clamp-3 text-[13.5px] whitespace-pre-wrap">{broadcast.body}</p>
    </>
  );
}

function ResultsLine({ broadcast, results }: { broadcast: Broadcast; results: BroadcastResults }) {
  const items: [string, number][] = [
    ["Sent", broadcast.recipientCount],
    ["Delivered", results.delivered],
    ["Failed", results.failed],
    ["Replies", results.replies],
    ["Bookings in 7 days", results.bookings],
  ];
  return (
    <dl className="mt-2.5 grid grid-cols-5 gap-1 text-center">
      {items.map(([label, n]) => (
        <div key={label} className="rounded-lg bg-secondary px-1 py-1.5">
          <dt className="text-[10.5px] leading-tight text-muted-foreground">{label}</dt>
          <dd className="text-[14px] font-extrabold tabular-nums">{n}</dd>
        </div>
      ))}
    </dl>
  );
}
