import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, newIdempotencyKey, queryKeys, toastApiError } from "@/lib/api";
import { clearPendingBusiness, readPendingBusiness } from "@/lib/auth/pending-business";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth/auth-store";

/** Soft launch: PT-only. Industry picker stays out of the UI for now. */
const DEFAULT_INDUSTRY = "personal_training";

/**
 * First-run onboarding for a signed-in account with no business membership.
 * Calls POST /api/v1/businesses, which provisions the owner membership and
 * applies the personal training industry template.
 */
export function CreateFirstBusiness() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [legalName, setLegalName] = useState("");
  const [tradingName, setTradingName] = useState("");

  // Prefill from the business name captured during registration.
  useEffect(() => {
    const pending = readPendingBusiness();
    if (!pending) return;
    setLegalName(pending.legalName);
    clearPendingBusiness();
  }, []);

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ business?: { id: string } }>(
        "/api/v1/businesses",
        {
          legalName: legalName.trim(),
          ...(tradingName.trim() ? { tradingName: tradingName.trim() } : {}),
          industryTemplateKey: DEFAULT_INDUSTRY,
        },
        { idempotencyKey: newIdempotencyKey() },
      );
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Business created");
      await queryClient.invalidateQueries({ queryKey: queryKeys.myBusinesses() });
      await navigate({ to: "/billing/setup" });
    },
    onError: (err) => toastApiError(err),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h1 className="text-xl font-semibold tracking-tight">Set up your PT business</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account isn't linked to a business yet. Add your studio or trading name to get
            started with sessions, clients and payments.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!legalName.trim()) {
                toast.error("Enter a business name");
                return;
              }
              create.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="legalName">Studio or business name</Label>
              <Input
                id="legalName"
                required
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Peak Performance PT"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tradingName">Trading name (optional)</Label>
              <Input
                id="tradingName"
                value={tradingName}
                onChange={(e) => setTradingName(e.target.value)}
                placeholder="Peak PT"
              />
            </div>

            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create business"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-sm text-muted-foreground hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
