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

function ReferralsPage() {
  const program = useReferralProgram();
  const shareUrl = program.data ? absoluteShareUrl(program.data.sharePath) : "";

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
      <PageHeader
        title="Referrals"
        description="When they pay after their 14-day trial, you get one free month. Monthly plans: next invoice is free. Annual plans: renewal moves by one month."
      />

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
            description="Share this with another PT. They enter it when they create their Recavo business."
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

          <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              label="Pending reward"
              value={String(program.data.stats.pendingRewardCount)}
              hint="Free month still being applied"
              icon={<Clock className="size-4.5" />}
            />
            <StatCard
              label="Rewarded"
              value={String(program.data.stats.rewardedCount)}
              hint="Free months applied to your plan"
              icon={<BadgeCheck className="size-4.5" />}
            />
          </div>
        </div>
      )}
    </Can>
  );
}
