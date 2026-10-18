import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { RELEASE_NOTES } from "@/content/release-notes";
import { LAST_SEEN_KEY, SEEN_EVENT, unseenReleases } from "@/lib/release-notes";
import { cn } from "@/lib/utils";

/** Releases newer than the last visit to What's new; 0 once the page has been opened. */
function useUnseenReleases(): number {
  const read = () => {
    try {
      return unseenReleases(RELEASE_NOTES, window.localStorage.getItem(LAST_SEEN_KEY));
    } catch {
      return 0;
    }
  };
  // Start at 0 so the server render and first client paint agree; count after mount.
  const [unseen, setUnseen] = useState(0);
  useEffect(() => {
    setUnseen(read());
    const refresh = () => setUnseen(read());
    window.addEventListener(SEEN_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SEEN_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return unseen;
}

/**
 * Sidebar footer link to the release log, with a count while there's something
 * unread. `compact` renders just the icon (and count) for the collapsed footer.
 */
export function WhatsNewNavLink({
  onClick,
  compact = false,
}: {
  onClick?: () => void;
  compact?: boolean;
}) {
  const unseen = useUnseenReleases();
  const active = useRouterState({ select: (s) => s.location.pathname }) === "/whats-new";
  const countLabel = `${unseen} new ${unseen === 1 ? "update" : "updates"}`;

  if (compact) {
    return (
      <Link
        to="/whats-new"
        onClick={onClick}
        title="What's new"
        aria-label={unseen > 0 ? `What's new — ${countLabel}` : "What's new"}
        className={cn(
          "flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold tabular-nums transition-colors",
          active || unseen > 0
            ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        )}
      >
        <Sparkles className={cn("size-4", unseen > 0 && "text-sidebar-primary")} aria-hidden />
        {unseen > 0 ? <span className="text-sidebar-primary">{unseen}</span> : null}
      </Link>
    );
  }

  return (
    <Link
      to="/whats-new"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition-colors lg:py-2.5 lg:text-sm",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Sparkles
        className={cn("size-5 lg:size-4.5", active && "text-sidebar-primary")}
        aria-hidden
      />
      What's new
      {unseen > 0 ? (
        <span
          className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[11px] font-semibold text-sidebar-primary-foreground"
          aria-label={countLabel}
        >
          {unseen}
        </span>
      ) : null}
    </Link>
  );
}
