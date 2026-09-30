import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-store";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "ending";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h left` : `${hours} h ${rest} min left`;
}

/**
 * Always-visible strip while this tab is a platform support session, so nobody
 * mistakes what they are looking at for their own account. Ends the session on the
 * server and in the tab; the "log in as" token is dead the moment it returns.
 */
export function ImpersonationBanner() {
  const { impersonation, user, endImpersonation } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!impersonation) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [impersonation]);

  if (!impersonation) return null;

  const remaining = new Date(impersonation.expiresAt).getTime() - now;

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-100 px-3 py-1.5 pt-safe-1.5 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-50"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <ShieldAlert className="size-3.5" />
        Support session
      </span>
      <span>
        Signed in as <strong>{user?.name ?? user?.email ?? "a member"}</strong>
        {user?.name && user.email ? ` (${user.email})` : ""} · {formatRemaining(remaining)}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-6 border-amber-400 bg-white/70 px-2 text-xs hover:bg-white dark:bg-amber-950/40 dark:hover:bg-amber-950/70"
        disabled={ending}
        onClick={async () => {
          setEnding(true);
          await endImpersonation();
        }}
      >
        {ending ? <Loader2 className="size-3 animate-spin" /> : null}
        End session
      </Button>
    </div>
  );
}
