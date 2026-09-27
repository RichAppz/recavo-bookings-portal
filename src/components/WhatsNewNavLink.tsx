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

/** Sidebar footer link to the release log, with a count while there's something unread. */
export function WhatsNewNavLink({ onClick }: { onClick?: () => void }) {
  const unseen = useUnseenReleases();
  const active = useRouterState({ select: (s) => s.location.pathname }) === "/whats-new";
  return (
    <Link
      to="/whats-new"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Sparkles className={cn("size-4.5", active && "text-sidebar-primary")} aria-hidden />
      What's new
      {unseen > 0 ? (
        <span
          className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[11px] font-semibold text-sidebar-primary-foreground"
          aria-label={`${unseen} new ${unseen === 1 ? "update" : "updates"}`}
        >
          {unseen}
        </span>
      ) : null}
    </Link>
  );
}
