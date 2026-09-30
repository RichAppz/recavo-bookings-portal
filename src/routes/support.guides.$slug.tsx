import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, BookOpen, Clock, LifeBuoy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ContactSupportDialog } from "@/components/ContactSupportDialog";
import { GuideBody, GuideCard, GuideImage } from "@/components/guides";
import { useGuideCopy, useGuideVertical } from "@/lib/use-guides";
import { EmptyState, PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { GUIDES } from "@/content/guides";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { findGuide, GUIDE_CATEGORIES, type Guide } from "@/lib/guides";
import type { VerticalKey } from "@/lib/verticals";

export const Route = createFileRoute("/support/guides/$slug")({
  head: ({ params }) => {
    const guide = findGuide(GUIDES, params.slug);
    const title = guide
      ? typeof guide.title === "string"
        ? guide.title
        : (guide.title.default ?? Object.values(guide.title)[0] ?? "Guide")
      : "Guide";
    return { meta: [{ title: `${title} — RECAVO guides` }] };
  },
  component: () => (
    <RequireAuth>
      <AppShell>
        <GuidePage />
      </AppShell>
    </RequireAuth>
  ),
});

function GuidePage() {
  const { slug } = Route.useParams();
  const { vertical } = useGuideVertical();
  const guide = findGuide(GUIDES, slug);

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/support/guides">
        <ArrowLeft className="size-4" /> All guides
      </Link>
    </Button>
  );

  if (!guide || !guide.verticals.includes(vertical)) {
    return (
      <>
        {back}
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title={guide ? "That guide isn't for your kind of business" : "That guide isn't here"}
          description={
            guide
              ? "It covers a feature your business doesn't use. The full list has everything that applies to you."
              : "It may have moved or been renamed. The full list has everything that applies to you."
          }
          action={
            <Button asChild>
              <Link to="/support/guides">Browse all guides</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      {back}
      <GuideArticle guide={guide} vertical={vertical} />
    </>
  );
}

function GuideArticle({ guide, vertical }: { guide: Guide; vertical: VerticalKey }) {
  const t = useGuideCopy(vertical);
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const category = GUIDE_CATEGORIES.find((c) => c.key === guide.category);
  const related = (guide.related ?? [])
    .map((s) => findGuide(GUIDES, s))
    .filter((g): g is Guide => Boolean(g && g.verticals.includes(vertical)));

  return (
    <>
      <PageHeader title={t(guide.title)} description={t(guide.summary)} />
      <p className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {category ? <span>{category.label}</span> : null}
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" /> {guide.minutes} min read
        </span>
        <span>
          {guide.steps.length} {guide.steps.length === 1 ? "step" : "steps"}
        </span>
      </p>

      <article className="mx-auto w-full max-w-3xl">
        <ol className="space-y-8">
          {guide.steps.map((step, i) => (
            <li key={i} className="grid grid-cols-[2rem_1fr] gap-x-3 sm:gap-x-4">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 space-y-3 pt-1">
                <h2 className="text-base font-semibold">{t(step.heading)}</h2>
                <GuideBody value={step.body} vertical={vertical} />
                {step.image ? (
                  <GuideImage guide={guide} image={step.image} vertical={vertical} />
                ) : null}
                {step.link ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={step.link.to} search={step.link.search}>
                      {step.link.label} <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 space-y-6 border-t pt-6">
          {related.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Read next</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {related.map((g) => (
                  <GuideCard key={g.slug} guide={g} vertical={vertical} compact />
                ))}
              </div>
            </section>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Still stuck?</p>
              <p className="text-xs text-muted-foreground">
                Tell us what you were trying to do. We reply here and by email.
              </p>
            </div>
            <Button size="sm" onClick={() => setAsking(true)}>
              <LifeBuoy className="size-4" /> Contact support
            </Button>
          </div>
        </div>
      </article>

      <ContactSupportDialog
        open={asking}
        onOpenChange={setAsking}
        onCreated={(request) => {
          void navigate({ to: "/support/$requestId", params: { requestId: request.id } });
        }}
      />
    </>
  );
}
