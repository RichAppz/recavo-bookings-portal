import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, newIdempotencyKey, queryKeys, toastApiError } from "@/lib/api";
import { buildCreateBusinessPayload } from "@/lib/api/business-payload";
import {
  clearPendingBusiness,
  clearSignUpBusinessMetadata,
  pendingBusinessFromMetadata,
  readPendingBusiness,
} from "@/lib/auth/pending-business";
import {
  clearPendingReferral,
  displayReferralCode,
  readPendingReferral,
} from "@/lib/auth/pending-referral";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BusinessDetailsFields } from "@/components/BusinessDetailsFields";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/lib/auth/auth-store";
import { DEFAULT_VERTICAL, VERTICALS, type VerticalKey } from "@/lib/verticals";

function referralFieldError(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const field = error.fieldErrors.find((fe) => fe.field === "referralCode");
  if (field?.code === "INVALID") return "That referral code isn't valid";
  if (field?.code === "FORBIDDEN") return "You can't use your own referral code";
  return null;
}

/**
 * First-run onboarding for a signed-in account with no business membership.
 * Calls POST /api/v1/businesses, which provisions the owner membership and
 * applies the personal training industry template.
 */
type CreateVars = {
  legalName: string;
  tradingName?: string;
  industryTemplateKey: string;
  referralCode?: string;
};

export function CreateFirstBusiness() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { signOut, supabaseUser } = useAuth();
  const [legalName, setLegalName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [vertical, setVertical] = useState<VerticalKey>(DEFAULT_VERTICAL);
  const [referralCode, setReferralCode] = useState("");
  // What registration captured: the localStorage stash when the user came back
  // in the same browser, else the sign-up user_metadata (works across devices —
  // e.g. signed up on a laptop, confirmed the email on a phone).
  const readCarriedBusiness = () =>
    readPendingBusiness() ?? pendingBusinessFromMetadata(supabaseUser?.user_metadata);
  // Show the "setting up…" state immediately (no form flash) when registration
  // already captured a complete business.
  const [autoCreating, setAutoCreating] = useState(() => {
    const pending = readCarriedBusiness();
    return Boolean(pending && pending.legalName.trim());
  });
  const initDone = useRef(false);

  const create = useMutation({
    mutationFn: async (vars: CreateVars) => {
      const res = await api.post<{ business?: { id: string } }>(
        "/api/v1/businesses",
        buildCreateBusinessPayload(vars),
        { idempotencyKey: newIdempotencyKey() },
      );
      return res.data;
    },
    onSuccess: async () => {
      clearPendingBusiness();
      void clearSignUpBusinessMetadata();
      clearPendingReferral();
      toast.success("Business created");
      await queryClient.invalidateQueries({ queryKey: queryKeys.myBusinesses() });
      await navigate({ to: "/billing" });
    },
    onError: (err) => {
      // Auto-provision failed: drop the stash (and its user_metadata copy) so we
      // don't retry a bad payload on every mount, and fall back to the
      // (prefilled) form for a manual fix.
      setAutoCreating(false);
      clearPendingBusiness();
      void clearSignUpBusinessMetadata();
      const referralMessage = referralFieldError(err);
      if (referralMessage) {
        toast.error(referralMessage);
        return;
      }
      toastApiError(err);
    },
  });

  // Carry over everything from registration: prefill the form and, when the
  // business is fully specified, provision it straight away.
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const pendingReferral = readPendingReferral();
    const referralDisplay = pendingReferral ? displayReferralCode(pendingReferral) : "";
    if (referralDisplay) setReferralCode(referralDisplay);

    const pending = readCarriedBusiness();
    if (!pending) return;

    setLegalName(pending.legalName);
    if (pending.industryTemplateKey in VERTICALS) {
      setVertical(pending.industryTemplateKey as VerticalKey);
    }

    if (pending.legalName.trim()) {
      setAutoCreating(true);
      create.mutate({
        legalName: pending.legalName,
        industryTemplateKey: pending.industryTemplateKey,
        referralCode: referralDisplay || undefined,
      });
    }
    // create is stable for the component's lifetime; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (autoCreating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="flex justify-center">
            <Wordmark />
          </div>
          <div className="rounded-2xl border bg-card p-8 text-center">
            <Loader2 className="mx-auto size-6 animate-spin text-primary" />
            <h1 className="mt-4 text-lg font-semibold tracking-tight">Setting up your business…</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Finishing what you started at sign-up — this only takes a moment.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h1 className="text-xl font-semibold tracking-tight">Set up your business</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account isn't linked to a business yet. Pick your trade and add your name to get
            started with bookings, clients and payments.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!legalName.trim()) {
                toast.error("Enter a business name");
                return;
              }
              create.mutate({
                legalName,
                tradingName,
                industryTemplateKey: vertical,
                referralCode,
              });
            }}
          >
            <BusinessDetailsFields
              vertical={vertical}
              onVerticalChange={setVertical}
              legalName={legalName}
              onLegalNameChange={setLegalName}
              tradingName={tradingName}
              onTradingNameChange={setTradingName}
              disabled={create.isPending}
            />

            <div className="space-y-2">
              <Label htmlFor="referralCode">Referral code (optional)</Label>
              <Input
                id="referralCode"
                autoComplete="off"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="ABCD-EFGH"
              />
              <p className="text-xs text-muted-foreground">
                You&apos;ll get the normal 14-day trial. Leave this blank if nobody referred you.
              </p>
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
