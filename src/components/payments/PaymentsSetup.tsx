import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, CreditCard, Landmark, ShieldBan, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  stripeHidden,
  useConnectAccount,
  usePaymentsHold,
  useStartConnectOnboarding,
  type PaymentsHoldNotice,
} from "@/lib/api/hooks";
import type { ConnectAccount } from "@/lib/api/types";
import { isOnlinePaymentRequired } from "@/lib/booking-payment";
import { connectRejection, type ConnectRejection } from "@/lib/connect-rejection";
import { openHostedFlow } from "@/lib/native";
import { requirementLabels } from "@/lib/payments-page";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

type CardState = "active" | "setting_up" | "not_set_up" | "on_hold" | "rejected";

export type PaymentsProblem = "none" | "needs" | "hold" | "rejected" | null;

export type PaymentsSetup = {
  loading: boolean;
  account: ConnectAccount | null;
  hold: PaymentsHoldNotice | null;
  rejection: ConnectRejection | null;
  hideStripe: boolean;
  card: CardState;
  bankOn: boolean;
  onlineOn: boolean;
  problem: PaymentsProblem;
  requirements: string[];
  canManageConnect: boolean;
};

/** Where card payments, bank transfer and online payment stand, and what needs doing. */
export function usePaymentsSetup(): PaymentsSetup {
  const tenant = useTenant();
  const connect = useConnectAccount();
  const holdQuery = usePaymentsHold();
  const account = connect.data ?? null;
  const hold = holdQuery.data ?? null;
  const rejection = connectRejection(account);
  const hideStripe = stripeHidden(hold) && !connect.isLoading && !account;
  const bankOn = tenant.configuration?.bankTransfer?.enabled === true;
  const onlineOn = isOnlinePaymentRequired(tenant.configuration);
  const card: CardState = hold
    ? "on_hold"
    : rejection
      ? "rejected"
      : !account || account.onboardingState === "not_started"
        ? "not_set_up"
        : account.chargesEnabled && account.payoutsEnabled
          ? "active"
          : "setting_up";
  const requirements = rejection ? [] : requirementLabels(account?.requirementsDue ?? []);
  const loading = connect.isLoading || tenant.isLoading;
  const chargesReady = account?.chargesEnabled === true && !hold;
  const problem: PaymentsProblem = loading
    ? null
    : hold && !hideStripe
      ? "hold"
      : rejection
        ? "rejected"
        : account && requirements.length > 0
          ? "needs"
          : !chargesReady && !bankOn
            ? "none"
            : null;
  return {
    loading,
    account,
    hold,
    rejection,
    hideStripe,
    card,
    bankOn,
    onlineOn,
    problem,
    requirements,
    canManageConnect: tenant.can(PERMISSIONS.CONNECT_MANAGE),
  };
}

const CARD_WORDS: Record<CardState, string> = {
  active: "Active",
  setting_up: "Setting up",
  not_set_up: "Not set up",
  on_hold: "On hold",
  rejected: "Rejected",
};

function Dot({ tone }: { tone: "ok" | "off" | "bad" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        tone === "ok"
          ? "bg-[#2ee6a6]"
          : tone === "bad"
            ? "bg-destructive"
            : "bg-muted-foreground/40",
      )}
    />
  );
}

/** The three-cell status strip shown when nothing needs action. */
export function PaymentsSetupStrip({ setup }: { setup: PaymentsSetup }) {
  const cells: { label: string; value: string; tone: "ok" | "off" | "bad" }[] = [
    ...(setup.hideStripe
      ? []
      : [
          {
            label: "Card payments",
            value: CARD_WORDS[setup.card],
            tone:
              setup.card === "active"
                ? ("ok" as const)
                : setup.card === "on_hold" || setup.card === "rejected"
                  ? ("bad" as const)
                  : ("off" as const),
          },
        ]),
    {
      label: "Bank transfer",
      value: setup.bankOn ? "On" : "Off",
      tone: setup.bankOn ? "ok" : "off",
    },
    {
      label: "Take payment online",
      value: setup.onlineOn ? "On" : "Off",
      tone: setup.onlineOn ? "ok" : "off",
    },
  ];
  return (
    <section
      aria-label="How clients pay you"
      className="flex flex-col overflow-hidden rounded-[14px] border bg-card sm:flex-row sm:items-stretch"
    >
      <dl className="grid flex-1 divide-y sm:grid-flow-col sm:auto-cols-fr sm:divide-x sm:divide-y-0">
        {cells.map((c) => (
          <div key={c.label} className="flex items-center gap-2.5 px-4 py-3">
            <Dot tone={c.tone} />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{c.label}</dt>
              <dd className="text-sm font-bold">{c.value}</dd>
            </div>
          </div>
        ))}
      </dl>
      <Link
        to="/settings/$page"
        params={{ page: "get-paid" }}
        className="flex items-center justify-center gap-1 border-t px-4 py-3 text-[13px] font-bold text-muted-foreground hover:text-foreground sm:border-t-0 sm:border-l"
      >
        Payment settings <ChevronRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

/** One-line version for phones: "Card payments: Stripe needs 2 things ›". */
export function PaymentsSetupLine({ setup }: { setup: PaymentsSetup }) {
  const text =
    setup.problem === "needs"
      ? `Card payments: Stripe needs ${setup.requirements.length} ${
          setup.requirements.length === 1 ? "thing" : "things"
        }`
      : setup.problem === "hold"
        ? "Online payments are switched off"
        : setup.problem === "rejected"
          ? "Stripe has rejected this account"
          : setup.problem === "none"
            ? "Set up how clients pay you"
            : [
                setup.hideStripe ? null : `card payments ${setup.card === "active" ? "on" : "off"}`,
                `bank transfer ${setup.bankOn ? "on" : "off"}`,
                `online payment ${setup.onlineOn ? "on" : "off"}`,
              ]
                .filter(Boolean)
                .join(", ")
                .replace(/^./, (c) => c.toUpperCase());
  return (
    <Link
      to="/settings/$page"
      params={{ page: "get-paid" }}
      className={cn(
        "inline-flex items-center gap-1 text-[13px] font-semibold",
        setup.problem ? "text-[#8a5300] dark:text-[#f3b878]" : "text-muted-foreground",
      )}
    >
      {text} <ChevronRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function ProblemShell({
  tone,
  icon,
  title,
  children,
  foot,
  action,
}: {
  tone: "neutral" | "amber" | "red";
  icon: ReactNode;
  title: string;
  children: ReactNode;
  foot?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-[14px] border p-4 sm:flex-row sm:items-start sm:p-5",
        tone === "amber" &&
          "border-[#f3d29b] bg-[#fdf6ea] dark:border-[rgba(233,146,57,0.35)] dark:bg-[rgba(233,146,57,0.08)]",
        tone === "red" && "border-destructive/40 bg-destructive/5",
        tone === "neutral" && "bg-card",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-xl",
          tone === "amber" &&
            "bg-[#fdf0dc] text-[#8a5300] dark:bg-[rgba(233,146,57,0.18)] dark:text-[#f3b878]",
          tone === "red" && "bg-destructive/10 text-destructive",
          tone === "neutral" && "bg-secondary text-foreground",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className={cn("text-[15px] font-extrabold", tone === "red" && "text-destructive")}>
          {title}
        </h2>
        <div className="text-sm text-muted-foreground">{children}</div>
        {foot ? <p className="text-xs text-muted-foreground">{foot}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}

const ASK_ADMIN = "Ask an owner or admin to finish this.";

function useStripeOnboarding() {
  const start = useStartConnectOnboarding();
  return {
    pending: start.isPending,
    run: async () => {
      const result = await start.mutateAsync();
      if (result.onboardingUrl) void openHostedFlow(result.onboardingUrl);
    },
  };
}

/**
 * The card that replaces the strip when something needs doing. `context="settings"`
 * leaves out the "no way to get paid" card, since Get paid is where that is set up.
 */
export function PaymentsProblemCard({
  setup,
  context = "payments",
}: {
  setup: PaymentsSetup;
  context?: "payments" | "settings";
}) {
  const onboarding = useStripeOnboarding();
  const since = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

  switch (setup.problem) {
    case "hold":
      return (
        <ProblemShell
          tone="red"
          icon={<ShieldBan className="size-5" />}
          title="Online payments are switched off"
          foot={setup.hold ? `Since ${since(setup.hold.since)}` : null}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/support">Contact support</Link>
            </Button>
          }
        >
          RECAVO has paused online payments for this business. Stripe onboarding and new card
          payments are unavailable until this is reviewed. Existing payouts and refunds are not
          affected. Contact RECAVO support for help.
        </ProblemShell>
      );
    case "rejected": {
      const r = setup.rejection;
      return (
        <ProblemShell
          tone="red"
          icon={<AlertTriangle className="size-5" />}
          title="Stripe has rejected this account"
          foot={
            <>
              {r?.rejectedAt ? `Rejected ${since(r.rejectedAt)} · ` : null}
              Clients can still pay by bank transfer or on the day.
            </>
          }
          action={
            <Button asChild variant="outline" size="sm">
              <a
                href="https://support.stripe.com/contact"
                target="_blank"
                rel="noopener noreferrer"
              >
                Contact Stripe
              </a>
            </Button>
          }
        >
          Card payments and payouts have stopped.
          {r?.reasonLabel ? (
            <>
              {" "}
              The reason given was <span className="text-foreground">{r.reasonLabel}</span>
              {r.detail ? <>, {r.detail}</> : null}.
            </>
          ) : null}{" "}
          This is Stripe&rsquo;s decision, not ours, so we cannot reverse it, but you can ask them
          to look again. Anything already paid out to you is unaffected.
        </ProblemShell>
      );
    }
    case "needs":
      return (
        <ProblemShell
          tone="amber"
          icon={<CreditCard className="size-5" />}
          title="Card payments: almost set up"
          foot={
            setup.canManageConnect
              ? "Card payments work, but payouts are paused until this is done."
              : ASK_ADMIN
          }
          action={
            setup.canManageConnect ? (
              <Button size="sm" disabled={onboarding.pending} onClick={() => void onboarding.run()}>
                Finish in Stripe
              </Button>
            ) : null
          }
        >
          <p>
            Stripe needs {setup.requirements.length} more{" "}
            {setup.requirements.length === 1 ? "thing" : "things"} before it can pay you. It takes
            about 5 minutes.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {setup.requirements.map((label) => (
              <li
                key={label}
                className="rounded-full border bg-background px-2.5 py-0.5 text-xs font-semibold text-foreground"
              >
                {label}
              </li>
            ))}
          </ul>
        </ProblemShell>
      );
    case "none":
      if (context === "settings") return null;
      return (
        <ProblemShell
          tone="neutral"
          icon={<Wallet className="size-5" />}
          title="Set up how clients pay you"
        >
          <p>
            Until you do, clients book now and pay on the day. You can still record cash and card
            machine payments here.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {setup.hideStripe ? null : (
              <div className="flex flex-col gap-2 rounded-xl border bg-background p-3.5">
                <p className="flex items-center gap-2 font-bold text-foreground">
                  <CreditCard className="size-4" aria-hidden /> Card payments
                </p>
                <p className="text-[13px]">
                  Clients pay by card when they book. Stripe pays you. 1.5% + 20p on UK cards, no
                  RECAVO cut.
                </p>
                {setup.canManageConnect ? (
                  <Button
                    size="sm"
                    className="self-start"
                    disabled={onboarding.pending}
                    onClick={() => void onboarding.run()}
                  >
                    Connect Stripe
                  </Button>
                ) : (
                  <p className="text-xs">{ASK_ADMIN}</p>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2 rounded-xl border bg-background p-3.5">
              <p className="flex items-center gap-2 font-bold text-foreground">
                <Landmark className="size-4" aria-hidden /> Bank transfer
              </p>
              <p className="text-[13px]">
                Clients see your bank details and a reference. You mark it paid when it arrives.
                Free.
              </p>
              <Button asChild size="sm" variant="outline" className="self-start">
                <Link to="/settings/$page" params={{ page: "get-paid" }} hash="get-paid-bank">
                  Add bank details
                </Link>
              </Button>
            </div>
          </div>
        </ProblemShell>
      );
    default:
      return null;
  }
}
