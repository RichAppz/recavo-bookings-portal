import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { BrandMark } from "@/components/AuthShell";
import { useAuth } from "@/lib/auth/auth-store";

export const Route = createFileRoute("/impersonate")({
  component: ImpersonatePage,
  head: () => ({
    meta: [{ title: "Support session — RECAVO" }, { name: "robots", content: "noindex" }],
  }),
});

/**
 * Landing page for a platform support session opened from the internal console.
 *
 * The console sends the browser to `/impersonate#token=…&business=…`. The auth store
 * takes the handoff out of the fragment on mount, so by the time this renders the
 * work is either done (→ go to the console as that member) or the link was not a
 * live session (→ say so). There is nothing to click here.
 */
function ImpersonatePage() {
  const { status, impersonation } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mounted && status === "authenticated" && impersonation) {
    return <Navigate to="/" replace />;
  }

  const settled = mounted && status !== "loading";

  return (
    <div className="screen-center bg-background px-safe-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <BrandMark tone="light" />
        </div>
        {!settled ? (
          <div className="space-y-3">
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
            <h1 className="text-lg font-semibold">Opening support session…</h1>
            <p className="text-sm text-muted-foreground">
              Signing you in as the member the internal console chose.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <ShieldAlert className="mx-auto size-8 text-amber-600" />
            <h1 className="text-lg font-semibold">This support session has ended</h1>
            <p className="text-sm text-muted-foreground">
              The link has expired, was already used, or the session was closed. Start another one
              from the internal console. You can close this tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
