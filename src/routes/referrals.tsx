import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, Clock, Copy, Gift, Receipt } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui-bits";
import { StatsGhost } from "@/components/ghost";
import { Button } from "@/components/ui/button";
import { useReferralProgram } from "@/lib/api/hooks";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { PERMISSIONS } from "@/lib/permissions";
import { Can } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/referrals")({
  head: () => ({
    meta: [
      { title: "Referrals — RECAVO" },
      {
        name: "description",
        content: "Share your Recavo referral code and track businesses you have referred.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <ReferralsPage />
      </AppShell>
    </RequireAuth>
  ),
});

function absoluteShareUrl(sharePath: string): string {
  if (/^https?:\/\//i.test(sharePath)) return sharePath;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${sharePath.startsWith("/") ? "" : "/"}${sharePath}`;
}

async function copyText(value: string, success: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(success);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it yourself.");
  }
}

const COPY = {
  standard: {
    header:
      "When they pay after their 14-day trial, you get one free month. Monthly plans: next invoice is free. Annual plans: renewal moves by one month.",
    code: "Share this with another business — a personal trainer, a detailer, anyone who takes bookings. They enter it when they create their Recavo business.",
    pendingLabel: "Pending reward",
    pendingHint: "Free month still being applied",
    rewardedLabel: "Rewarded",
    rewardedHint: "Free months applied to your plan",
  },
  partner: {
    header:
      "You're on the partner programme: the businesses you refer get the discount. Monthly plans: 20% off for their first six months. Annual plans: 10% off their first year.",
    code: "Share this with the businesses you work with. They enter it when they create their Recavo business and the discount is applied at checkout — nothing for them to claim.",
    pendingLabel: "Awaiting payment",
    pendingHint: "Signed up, not yet paid",
    rewardedLabel: "Discount applied",
    rewardedHint: "Businesses paying at the partner rate",
  },
} as const;

function ReferralsPage() {
  const program = useReferralProgram();
  const shareUrl = program.data ? absoluteShareUrl(program.data.sharePath) : "";
  const copy = COPY[program.data?.program === "partner" ? "partner" : "standard"];

  return (
    <Can
      permission={PERMISSIONS.BUSINESS_READ}
      fallback={
        <EmptyState
          title="Referrals are restricted"
          description="Ask a business owner to grant you access to this workspace."
        />
      }
    >
      <PageHeader title="Referrals" description={copy.header} />

      {program.isLoading ? (
        <StatsGhost />
      ) : program.isError || !program.data ? (
        <EmptyState
          title="Couldn't load your referral code"
          description="Please try again shortly."
        />
      ) : (
        <div className="space-y-6">
          <SectionCard
            title="Your code"
            description={copy.code}
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(program.data.code, "Code copied")}
                >
                  <Copy className="size-4" /> Copy code
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void copyText(shareUrl, "Link copied")}
                >
                  <Copy className="size-4" /> Copy link
                </Button>
              </div>
            }
          >
            <div className="space-y-3 p-4 sm:p-5">
              <p className="font-mono text-3xl font-semibold tracking-[0.2em]">
                {program.data.code}
              </p>
              <p className="break-all text-sm text-muted-foreground">{shareUrl}</p>
            </div>
          </SectionCard>

          <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Attributed"
              value={String(program.data.stats.attributedCount)}
              hint="Businesses that used your code"
              icon={<Gift className="size-4.5" />}
            />
            <StatCard
              label="Converted"
              value={String(program.data.stats.convertedCount)}
              hint="First paid invoice after trial"
              icon={<Receipt className="size-4.5" />}
            />
            <StatCard
              label={copy.pendingLabel}
              value={String(
                program.data.program === "partner"
                  ? program.data.stats.attributedCount - program.data.stats.convertedCount
                  : program.data.stats.pendingRewardCount,
              )}
              hint={copy.pendingHint}
              icon={<Clock className="size-4.5" />}
            />
            <StatCard
              label={copy.rewardedLabel}
              value={String(program.data.stats.rewardedCount)}
              hint={copy.rewardedHint}
              icon={<BadgeCheck className="size-4.5" />}
            />
          </div>
        </div>
      )}
    </Can>
  );
}
