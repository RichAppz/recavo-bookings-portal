import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LifeBuoy, MessageSquareReply, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ContactSupportDialog } from "@/components/ContactSupportDialog";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useSupportRequests } from "@/lib/api/support";
import type { SupportRequest } from "@/lib/api/types";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { relativeTimeAgo } from "@/lib/booking-reminders";
import { categoryLabel, lastActivity } from "@/lib/support";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/support/")({
  head: () => ({
    meta: [
      { title: "Support — RECAVO" },
      { name: "description", content: "Ask the RECAVO team for help and read their replies." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <SupportPage />
      </AppShell>
    </RequireAuth>
  ),
});

function SupportPage() {
  const requests = useSupportRequests();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const openNew = () => setCreating(true);

  return (
    <>
      <PageHeader
        title="Support"
        description="Ask us anything about RECAVO. We reply here and by email; you can answer back on the thread."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> New request
          </Button>
        }
      />

      {requests.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : requests.isError ? (
        <EmptyState
          title="Couldn't load your requests"
          description={
            requests.error instanceof ApiError
              ? requests.error.detail || requests.error.title
              : "Something went wrong."
          }
          action={
            <Button variant="outline" onClick={() => void requests.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !requests.data || requests.data.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy className="size-6" />}
          title="No requests yet"
          description="Stuck on something, spotted a bug, or want a feature? Send us a message and we'll get back to you."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> New request
            </Button>
          }
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {requests.data.map((r) => (
            <SupportRow key={r.id} request={r} />
          ))}
        </ul>
      )}

      <ContactSupportDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(request) => {
          void navigate({ to: "/support/$requestId", params: { requestId: request.id } });
        }}
      />
    </>
  );
}

function SupportRow({ request: r }: { request: SupportRequest }) {
  const activity = lastActivity(r);
  return (
    <li>
      <Link
        to="/support/$requestId"
        params={{ requestId: r.id }}
        className="flex items-start gap-4 px-4 py-4 transition-colors hover:bg-secondary/60 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{r.subject}</span>
            <StatusBadge status={r.status} />
            {activity.ours && r.status !== "resolved" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <MessageSquareReply className="size-3" /> New reply
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{r.body}</p>
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <div>{categoryLabel(r.category)}</div>
          <div className={cn("mt-1", activity.ours && "text-foreground")}>
            {activity.label} {relativeTimeAgo(activity.at)}
          </div>
        </div>
      </Link>
    </li>
  );
}
