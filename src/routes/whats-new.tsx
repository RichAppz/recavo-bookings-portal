import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { LifeBuoy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader, SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { RELEASE_NOTES } from "@/content/release-notes";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  KIND_LABEL,
  LAST_SEEN_KEY,
  SEEN_EVENT,
  latestReleaseDate,
  type ReleaseKind,
  type ReleaseNote,
} from "@/lib/release-notes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/whats-new")({
  head: () => ({
    meta: [
      { title: "What's new — RECAVO" },
      { name: "description", content: "What has shipped to RECAVO recently." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <WhatsNewPage />
      </AppShell>
    </RequireAuth>
  ),
});

const KIND_STYLE: Record<ReleaseKind, string> = {
  new: "bg-primary-soft text-primary",
  improved: "bg-success-soft text-success",
  fixed: "bg-secondary text-secondary-foreground",
};

function WhatsNewPage() {
  // Visiting the page is what clears the "new" dot in the sidebar.
  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, latestReleaseDate(RELEASE_NOTES));
      window.dispatchEvent(new Event(SEEN_EVENT));
    } catch {
      // Storage unavailable — the dot just stays; nothing else depends on it.
    }
  }, []);

  return (
    <>
      <PageHeader
        title="What's new"
        description="We ship small improvements most days. Here's what has changed, newest first."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/support">
              <LifeBuoy className="size-4" /> Suggest something
            </Link>
          </Button>
        }
      />

      <div className="mt-6 space-y-4">
        {RELEASE_NOTES.map((note) => (
          <ReleaseCard key={note.date} note={note} />
        ))}
      </div>
    </>
  );
}

function ReleaseCard({ note }: { note: ReleaseNote }) {
  return (
    <SectionCard
      title={note.title}
      description={format(parseISO(note.date), "EEEE d MMMM yyyy")}
      bodyClassName="p-0"
    >
      <ul className="divide-y">
        {note.items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            <span
              className={cn(
                "mt-0.5 inline-flex w-[4.75rem] shrink-0 items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                KIND_STYLE[item.kind],
              )}
            >
              {KIND_LABEL[item.kind]}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p>{item.text}</p>
              {item.where ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.where}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
