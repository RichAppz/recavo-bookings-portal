import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, LifeBuoy, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GuideCard, VerticalSwitch } from "@/components/guides";
import { useGuideCopy, useGuideVertical } from "@/lib/use-guides";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GUIDES } from "@/content/guides";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  GUIDE_CATEGORIES,
  guidesInCategory,
  searchGuides,
  type GuideCategoryKey,
} from "@/lib/guides";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/support/guides/")({
  head: () => ({
    meta: [
      { title: "Guides — RECAVO" },
      {
        name: "description",
        content: "Step-by-step guides with screenshots for everything in RECAVO.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <GuidesPage />
      </AppShell>
    </RequireAuth>
  ),
});

function GuidesPage() {
  const { vertical, canSwitch, setVertical } = useGuideVertical();
  const t = useGuideCopy(vertical);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GuideCategoryKey | "all">("all");

  const searching = query.trim().length > 0;
  const results = searching ? searchGuides(GUIDES, vertical, query) : [];
  const sections = GUIDE_CATEGORIES.map((c) => ({
    ...c,
    guides: guidesInCategory(GUIDES, vertical, c.key),
  })).filter((s) => s.guides.length > 0 && (category === "all" || s.key === category));

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
        <Link to="/support">
          <ArrowLeft className="size-4" /> Support
        </Link>
      </Button>
      <PageHeader
        title="Guides"
        description={
          canSwitch
            ? "Step-by-step, with screenshots that match the screen you're on."
            : "Step-by-step, with screenshots that match the screen you're on. Still stuck? Contact support from the Support page."
        }
        actions={canSwitch ? <VerticalSwitch value={vertical} onChange={setVertical} /> : null}
      />

      <div className="space-y-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides — “reschedule”, “deposit”, “offline”…"
            aria-label="Search guides"
            className="bg-card pl-9"
          />
        </div>

        {!searching ? (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <Chip active={category === "all"} onClick={() => setCategory("all")}>
              All
            </Chip>
            {GUIDE_CATEGORIES.filter(
              (c) => guidesInCategory(GUIDES, vertical, c.key).length > 0,
            ).map((c) => (
              <Chip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>

      {searching ? (
        results.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-6" />}
            title="No guide matches that"
            description="Try another word, or ask us directly — we reply here and by email."
            action={
              <Button variant="outline" asChild>
                <Link to="/support">
                  <LifeBuoy className="size-4" /> Contact support
                </Link>
              </Button>
            }
          />
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {results.length} {results.length === 1 ? "guide" : "guides"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((g) => (
                <GuideCard key={g.slug} guide={g} vertical={vertical} />
              ))}
            </div>
          </section>
        )
      ) : (
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.key} className="space-y-3">
              <div>
                <h2 className="text-base font-semibold">{s.label}</h2>
                <p className="text-sm text-muted-foreground">{t(s.description)}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {s.guides.map((g) => (
                  <GuideCard key={g.slug} guide={g} vertical={vertical} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
