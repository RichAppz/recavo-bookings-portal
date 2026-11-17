import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Info, LifeBuoy, Phone, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, SectionCard, StatusBadge } from "@/components/ui-bits";
import { ApiError } from "@/lib/api";
import {
  CLIENT_SUPPORT_CATEGORIES,
  useClientSupportRequests,
  useClientSupportThread,
  useRaiseClientSupportRequest,
  useReplyToClientSupportRequest,
  type ClientSupportCategory,
} from "@/lib/api/client-support";
import { usePublicLocations, type PortalBusinessSummary } from "@/lib/api/hooks";
import { relativeTimeAgo } from "@/lib/booking-reminders";
import { categoryLabel } from "@/lib/support";

/**
 * Help with the booking app, from RECAVO. Clients are told up front that this is for
 * technical problems only: anything about a booking is for the business, and we can't
 * act on it.
 */
export function AccountHelp({
  studios,
  requestId,
  onOpen,
}: {
  studios: PortalBusinessSummary[];
  requestId: string | undefined;
  onOpen: (requestId: string | undefined) => void;
}) {
  const [writing, setWriting] = useState(false);

  if (requestId) {
    return <HelpThread requestId={requestId} onBack={() => onOpen(undefined)} />;
  }

  return (
    <div className="grid max-w-2xl gap-5">
      <TechnicalOnlyNotice studios={studios} />
      {writing ? (
        <NewHelpRequest
          studios={studios}
          onCancel={() => setWriting(false)}
          onSent={(id) => {
            setWriting(false);
            onOpen(id);
          }}
        />
      ) : (
        <div>
          <Button onClick={() => setWriting(true)}>
            <Plus className="size-4" /> Report a problem with the app
          </Button>
        </div>
      )}
      <HelpRequestList onOpen={onOpen} />
    </div>
  );
}

function TechnicalOnlyNotice({ studios }: { studios: PortalBusinessSummary[] }) {
  return (
    <div className="rounded-2xl border border-[var(--account-line)] bg-white p-5">
      <p className="flex items-center gap-2 font-semibold">
        <Info className="size-4 text-primary" aria-hidden /> This is for problems with the app
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        RECAVO runs this booking app. We can help if something isn't working, like signing in, pages
        not loading or a card payment failing.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        We can't change, cancel or refund bookings, or answer questions about your sessions. For
        anything like that, please contact the business directly:
      </p>
      <ul className="mt-3 divide-y divide-[var(--account-line)] rounded-xl border border-[var(--account-line)]">
        {studios.map((studio) => (
          <BusinessContact key={studio.id} studio={studio} />
        ))}
      </ul>
    </div>
  );
}

function BusinessContact({ studio }: { studio: PortalBusinessSummary }) {
  const locations = usePublicLocations(studio.id);
  const phone = locations.data?.find((l) => l.phone?.trim())?.phone?.trim() ?? null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
      <span className="font-medium">{studio.tradingName}</span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {phone ? (
          <a href={`tel:${phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5">
            <Phone className="size-3.5" aria-hidden /> {phone}
          </a>
        ) : null}
        <Link
          to="/$slug"
          params={{ slug: studio.slug }}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Their booking page
        </Link>
      </span>
    </li>
  );
}

function NewHelpRequest({
  studios,
  onCancel,
  onSent,
}: {
  studios: PortalBusinessSummary[];
  onCancel: () => void;
  onSent: (requestId: string) => void;
}) {
  const raise = useRaiseClientSupportRequest();
  const [businessId, setBusinessId] = useState(studios.length === 1 ? studios[0]!.id : "");
  const [category, setCategory] = useState<ClientSupportCategory>("bug");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [technical, setTechnical] = useState(false);

  const ready =
    Boolean(businessId) && subject.trim().length > 0 && body.trim().length > 0 && technical;

  const send = () => {
    if (!ready) return;
    raise.mutate(
      { businessId, category, subject: subject.trim(), body: body.trim() },
      { onSuccess: (request) => onSent(request.id) },
    );
  };

  return (
    <SectionCard title="Report a problem with the app">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {studios.length > 1 ? (
          <div className="grid gap-1.5">
            <Label htmlFor="help-business">Which business were you using?</Label>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger id="help-business">
                <SelectValue placeholder="Choose a business" />
              </SelectTrigger>
              <SelectContent>
                {studios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.tradingName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="help-category">What kind of problem?</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ClientSupportCategory)}>
            <SelectTrigger id="help-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_SUPPORT_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="help-subject">Subject</Label>
          <Input
            id="help-subject"
            value={subject}
            maxLength={200}
            placeholder="For example: the calendar won't load"
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="help-body">What happened?</Label>
          <Textarea
            id="help-body"
            value={body}
            rows={5}
            maxLength={5000}
            placeholder="What were you trying to do, and what did you see? Which phone or browser?"
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-muted/50 p-3 text-sm">
          <Checkbox
            checked={technical}
            onCheckedChange={(v) => setTechnical(v === true)}
            className="mt-0.5"
          />
          <span>
            This is a problem with the app, not about a booking, cancellation or refund. I'll
            contact the business for those.
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!ready || raise.isPending}>
            {raise.isPending ? "Sending…" : "Send to RECAVO"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function HelpRequestList({ onOpen }: { onOpen: (requestId: string) => void }) {
  const requests = useClientSupportRequests();
  if (requests.isPending) {
    return <div className="surface-card h-24 animate-pulse" />;
  }
  if (!requests.data || requests.data.length === 0) {
    return (
      <EmptyState
        icon={<LifeBuoy className="size-5" />}
        title="No problems reported"
        description="If something in the app isn't working, report it here and we'll reply by email and on this page."
      />
    );
  }
  return (
    <SectionCard title="Your reports">
      <ul className="divide-y divide-border">
        {requests.data.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex w-full items-center gap-3 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.subject}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {[r.businessName, relativeTimeAgo(r.lastMessageAt ?? r.createdAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <StatusBadge status={r.status} />
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function HelpThread({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const thread = useClientSupportThread(requestId);
  const reply = useReplyToClientSupportRequest(requestId);
  const [text, setText] = useState("");

  const back = (
    <Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={onBack}>
      <ArrowLeft className="size-4" /> All reports
    </Button>
  );

  if (thread.isPending) {
    return (
      <div className="grid max-w-2xl gap-4">
        {back}
        <div className="surface-card h-40 animate-pulse" />
      </div>
    );
  }
  if (!thread.data) {
    const missing = thread.error instanceof ApiError && thread.error.status === 404;
    return (
      <div className="grid max-w-2xl gap-4">
        {back}
        <EmptyState
          title={missing ? "We couldn't find that report" : "Couldn't load this report"}
          description={missing ? "It may belong to a different account." : "Refresh to try again."}
        />
      </div>
    );
  }

  const { request, messages } = thread.data;
  return (
    <div className="grid max-w-2xl gap-4">
      {back}
      <SectionCard>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{request.subject}</h2>
            <p className="text-[13px] text-muted-foreground">
              {categoryLabel(request.category)} · {relativeTimeAgo(request.createdAt)}
            </p>
          </div>
          <StatusBadge status={request.status} />
        </div>
        <div className="mt-4 grid gap-3">
          <Bubble who="You" at={request.createdAt} body={request.body} mine />
          {messages.map((m) => (
            <Bubble
              key={m.id}
              who={m.authorType === "platform" ? "RECAVO" : "You"}
              at={m.createdAt}
              body={m.body}
              mine={m.authorType !== "platform"}
            />
          ))}
        </div>
        <form
          className="mt-4 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            reply.mutate(text.trim(), { onSuccess: () => setText("") });
          }}
        >
          <Label htmlFor="help-reply">
            {request.status === "resolved" ? "Still not working? Reply to reopen" : "Reply"}
          </Label>
          <Textarea
            id="help-reply"
            rows={3}
            maxLength={5000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" className="self-start" disabled={!text.trim() || reply.isPending}>
            {reply.isPending ? "Sending…" : "Send reply"}
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}

function Bubble({ who, at, body, mine }: { who: string; at: string; body: string; mine: boolean }) {
  return (
    <div className={mine ? "rounded-xl bg-muted/60 p-3" : "rounded-xl bg-primary-soft/60 p-3"}>
      <p className="text-[12px] text-muted-foreground">
        <span className="font-semibold text-foreground">{who}</span> · {relativeTimeAgo(at)}
      </p>
      <p className="mt-1 text-sm whitespace-pre-wrap">{body}</p>
    </div>
  );
}
