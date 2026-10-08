import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookOpen, LifeBuoy, MessageSquareReply, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ContactSupportDialog } from "@/components/ContactSupportDialog";
import { GuideCard } from "@/components/guides";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { GUIDES } from "@/content/guides";
import { ApiError } from "@/lib/api";
import { useSupportRequests } from "@/lib/api/support";
import type { SupportRequest } from "@/lib/api/types";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { relativeTimeAgo } from "@/lib/booking-reminders";
import { guidesFor } from "@/lib/guides";
import { categoryLabel, lastActivity } from "@/lib/support";
import { useGuideVertical } from "@/lib/use-guides";
import { cn } from "@/lib/utils";

/** The guides most people need first; shown on the Support page above the requests. */
const FEATURED_GUIDES = [
  "add-a-booking",
  "reschedule-a-booking",
  "record-a-payment",
  "working-offline",
];

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
  const { vertical } = useGuideVertical();
  const forVertical = guidesFor(GUIDES, vertical);
  const featured = FEATURED_GUIDES.map((slug) => forVertical.find((g) => g.slug === slug)).filter(
    (g) => g !== undefined,
  );

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

      {featured.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="size-4 text-primary" /> Guides
            </h2>
            <Button variant="ghost" size="sm" asChild className="-mr-2">
              <Link to="/support/guides">
                All {forVertical.length} guides <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((g) => (
              <GuideCard key={g.slug} guide={g} vertical={vertical} compact />
            ))}
          </div>
        </section>
      ) : null}

      <h2 className="text-sm font-semibold">Your requests</h2>
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
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openNew}>
                <Plus className="size-4" /> New request
              </Button>
              <Button variant="outline" asChild>
                <Link to="/support/guides">
                  <BookOpen className="size-4" /> Read the guides
                </Link>
              </Button>
            </div>
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
