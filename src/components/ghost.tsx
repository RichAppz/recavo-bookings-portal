import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Placeholder copy for a list or table that is still fetching. */
export function TableGhost({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <Skeleton className="h-4 flex-[2]" />
          <Skeleton className="hidden h-4 flex-1 sm:block" />
          <Skeleton className="hidden h-4 w-24 lg:block" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function StatsGhost({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[124px] rounded-xl" />
      ))}
    </div>
  );
}

export function CardsGhost({
  count = 3,
  className = "h-[220px]",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn("rounded-xl", className)} />
      ))}
    </div>
  );
}

/** Header, stats and a table — the shape of most staff list pages. */
export function PageGhost() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <StatsGhost />
      <div className="surface-card overflow-hidden">
        <TableGhost />
      </div>
    </div>
  );
}

/** Profile header plus two columns — client records, account pages. */
export function DetailGhost() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-7 w-56 max-w-full" />
          <Skeleton className="h-4 w-40 max-w-full" />
        </div>
      </div>
      <StatsGhost count={3} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card overflow-hidden">
          <TableGhost rows={5} />
        </div>
        <div className="surface-card overflow-hidden">
          <TableGhost rows={5} />
        </div>
      </div>
    </div>
  );
}

/**
 * Staff chrome with ghosted nav and page. Used when auth is still resolving, so
 * the destination looks like the app rather than a blank centred spinner.
 */
export function AppChromeGhost() {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-[264px] flex-col bg-sidebar lg:flex">
        <div className="px-5 py-5">
          <Skeleton className="h-8 w-32 bg-sidebar-accent" />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-xl bg-sidebar-accent/70" />
          ))}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-3">
          <Skeleton className="h-12 rounded-xl bg-sidebar-accent/70" />
          <Skeleton className="h-12 rounded-xl bg-sidebar-accent/70" />
        </div>
      </aside>
      <div className="lg:pl-[264px]">
        <header className="h-16 border-b" />
        <main className="mx-auto w-full max-w-[1440px] p-4 sm:p-6">
          <PageGhost />
        </main>
      </div>
    </div>
  );
}

/** Two-panel auth frame without committing to staff vs customer copy. */
export function AuthChromeGhost() {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="relative hidden overflow-hidden bg-sidebar px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <Skeleton className="h-10 w-36 bg-sidebar-accent" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-64 max-w-full bg-sidebar-accent" />
          <Skeleton className="h-16 w-full max-w-md bg-sidebar-accent/80" />
          <Skeleton className="h-4 w-5/6 bg-sidebar-accent/70" />
          <Skeleton className="h-4 w-4/6 bg-sidebar-accent/70" />
        </div>
        <Skeleton className="h-16 w-full bg-sidebar-accent/60" />
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[26rem] space-y-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="h-4 w-full" />
            <div className="mt-8 space-y-3">
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
