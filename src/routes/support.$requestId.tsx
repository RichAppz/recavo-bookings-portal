import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useReplyToSupportRequest, useSupportRequest } from "@/lib/api/support";
import type { SupportMessage, SupportRequest } from "@/lib/api/types";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { formatInTz } from "@/lib/format";
import { categoryLabel } from "@/lib/support";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const BODY_MAX = 5000;

export const Route = createFileRoute("/support/$requestId")({
  head: () => ({
    meta: [
      { title: "Support request — RECAVO" },
      { name: "description", content: "Your conversation with the RECAVO team." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <SupportThreadPage />
      </AppShell>
    </RequireAuth>
  ),
});

function SupportThreadPage() {
  const { requestId } = Route.useParams();
  const thread = useSupportRequest(requestId);
  const tenant = useTenant();
  const timezone = tenant.business?.defaultTimezone || "Europe/London";

  const back = (
    <Button variant="ghost" size="sm" asChild>
      <Link to="/support">
        <ArrowLeft className="size-4" /> All requests
      </Link>
    </Button>
  );

  if (thread.isLoading) {
    return (
      <>
        {back}
        <div className="mt-4 space-y-3">
          <div className="h-10 w-2/3 animate-pulse rounded-lg bg-secondary" />
          <div className="h-32 animate-pulse rounded-xl bg-secondary" />
          <div className="h-24 animate-pulse rounded-xl bg-secondary" />
        </div>
      </>
    );
  }

  if (thread.isError || !thread.data) {
    const notFound = thread.error instanceof ApiError && thread.error.status === 404;
    return (
      <>
        {back}
        <div className="mt-4">
          <EmptyState
            icon={<LifeBuoy className="size-6" />}
            title={notFound ? "That request isn't here" : "Couldn't load this request"}
            description={
              notFound
                ? "It may belong to another business you're a member of. Switch business and try again."
                : thread.error instanceof ApiError
                  ? thread.error.detail || thread.error.title
                  : "Something went wrong."
            }
            action={
              notFound ? null : (
                <Button variant="outline" onClick={() => void thread.refetch()}>
                  Try again
                </Button>
              )
            }
          />
        </div>
      </>
    );
  }

  const { request, messages } = thread.data;
  const resolved = request.status === "resolved";

  return (
    <>
      {back}
      <PageHeader
        title={request.subject}
        description={`${categoryLabel(request.category)} · sent ${formatInTz(request.createdAt, timezone)}`}
        actions={<StatusBadge status={request.status} className="text-sm" />}
      />

      <div className="mx-auto w-full max-w-3xl space-y-4">
        <ol className="space-y-4">
          <li>
            <Bubble
              who="You"
              at={request.createdAt}
              timezone={timezone}
              body={request.body}
              ours={false}
            />
          </li>
          {messages.map((m) => (
            <li key={m.id}>
              <Bubble
                who={m.authorType === "platform" ? "RECAVO" : "You"}
                at={m.createdAt}
                timezone={timezone}
                body={m.body}
                ours={m.authorType === "platform"}
              />
            </li>
          ))}
          {resolved && request.resolvedAt ? (
            <li className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" />
              Marked resolved {formatInTz(request.resolvedAt, timezone)}
            </li>
          ) : null}
        </ol>

        <ReplyBox request={request} messages={messages} />
      </div>
    </>
  );
}

function Bubble({
  who,
  at,
  timezone,
  body,
  ours,
}: {
  who: string;
  at: string;
  timezone: string;
  body: string;
  ours: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border px-4 py-3 sm:px-5 sm:py-4",
        ours ? "border-primary/30 bg-primary/5" : "bg-card",
      )}
    >
      <header className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <span className={cn("font-semibold", ours ? "text-primary" : "text-foreground")}>
          {who}
        </span>
        <time dateTime={at} className="text-muted-foreground">
          {formatInTz(at, timezone)}
        </time>
      </header>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
    </article>
  );
}

function ReplyBox({ request, messages }: { request: SupportRequest; messages: SupportMessage[] }) {
  const [body, setBody] = useState("");
  const reply = useReplyToSupportRequest(request.id);
  const resolved = request.status === "resolved";
  const trimmed = body.trim();
  const valid = trimmed.length > 0 && trimmed.length <= BODY_MAX;
  const awaitingUs =
    !resolved && (messages.length === 0 || messages[messages.length - 1]?.authorType === "user");

  return (
    <form
      className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || reply.isPending) return;
        reply.mutate(trimmed, {
          onSuccess: () => {
            setBody("");
            toast.success(resolved ? "Reopened and sent" : "Reply sent", {
              description: "The RECAVO team has been notified.",
            });
          },
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="support-reply">{resolved ? "Still need help?" : "Reply"}</Label>
        <p className="text-xs text-muted-foreground">
          {resolved
            ? "Replying reopens this request and lets the team know."
            : awaitingUs
              ? "We've got your message and will reply here and by email. Add anything else below."
              : "Answer the team here; they'll be notified straight away."}
        </p>
      </div>
      <Textarea
        id="support-reply"
        rows={4}
        value={body}
        maxLength={BODY_MAX}
        placeholder="Write your reply…"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}
        </p>
        <Button type="submit" disabled={!valid || reply.isPending}>
          {reply.isPending ? "Sending…" : resolved ? "Reopen and send" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
