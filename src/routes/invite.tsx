import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { useAcceptInvitation } from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/auth-store";
import { toast } from "sonner";

const searchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/invite")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Accept invite — RECAVO" }] }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useSearch();
  const { status } = useAuth();
  const accept = useAcceptInvitation();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !token || done || accept.isPending || accept.isSuccess) {
      return;
    }
    void (async () => {
      try {
        await accept.mutateAsync(token);
        setDone(true);
        toast.success("Invitation accepted");
        void navigate({ to: "/" });
      } catch {
        /* toasted by hook */
      }
    })();
  }, [status, token, done, accept, navigate]);

  if (!token) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Missing invite token</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Open the invite link from your email, or ask your admin to resend it.
        </p>
      </Centered>
    );
  }

  if (status === "unauthenticated" || status === "loading" || status === "unconfigured") {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Accept your invite</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with the invited email address to join this business.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button asChild>
            <Link to="/login" search={{ redirect: `/invite?token=${encodeURIComponent(token)}` }}>
              Sign in
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">Create account</Link>
          </Button>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <h1 className="text-lg font-semibold">{done ? "Invite accepted" : "Accepting invite…"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {done
          ? "Redirecting you to the console."
          : "Please wait while we join you to the business."}
      </p>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        {children}
      </div>
    </div>
  );
}
