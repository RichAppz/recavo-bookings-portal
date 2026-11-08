import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import QRCode from "qrcode";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Gift,
  Mail,
  MessageCircle,
  MessageSquareText,
  Printer,
  QrCode,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AVATAR_TINTS, TonePill } from "@/components/client-profile/parts";
import { StatsGhost, TableGhost } from "@/components/ghost";
import { EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsPhone, useMediaQuery } from "@/hooks/use-media-query";
import { ApiError } from "@/lib/api/errors";
import {
  REFERRED_PAGE_SIZE,
  useChangeReferralCode,
  useReferralProgram,
  useReferredBusinesses,
  type ReferralProgram,
  type ReferralSummary,
  type ReferredBusiness,
} from "@/lib/api/hooks";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { avatarTintIndex } from "@/lib/clients-list";
import { formatMoney, initials } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import {
  changesLeftLine,
  CODE_MAX_LENGTH,
  codeErrorMessage,
  codeShapeProblem,
  compactCode,
  earnedTile,
  payingSub,
  progressOf,
  referralLink,
  referralLinkParts,
  rewardView,
  rowLabel,
  shareMessage,
  shareUrls,
  shortDate,
  statusView,
  tradeLabel,
  type RewardView,
} from "@/lib/referrals";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/referrals")({
  head: () => ({
    meta: [
      { title: "Referrals — RECAVO" },
      {
        name: "description",
        content: "Share your RECAVO link with other businesses and get a month free when they pay.",
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

const DEFAULT_TRIAL_DAYS = 14;

const MINT_TINT = "bg-primary-soft text-[#0f5c40] dark:text-mint";

const REWARD_TONE: Record<RewardView["tone"], string> = {
  muted: "text-muted-foreground",
  amber: "text-[#8a5300] dark:text-[#f3b878]",
  ok: "text-[#1f6b41] dark:text-[#9fe3bf]",
};

/** Copy with a toast and a live-region announcement; returns whether it worked. */
function useCopy() {
  const [announcement, setAnnouncement] = useState("");
  const copy = async (value: string, done: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(done);
      setAnnouncement("");
      requestAnimationFrame(() => setAnnouncement(done));
      return true;
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
      return false;
    }
  };
  const region = (
    <span className="sr-only" aria-live="polite">
      {announcement}
    </span>
  );
  return { copy, region };
}

function ReferralsPage() {
  const program = useReferralProgram();
  const phone = useIsPhone();
  const partner = program.data?.program === "partner";

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
      <div className="space-y-4">
        <header>
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.025em] sm:text-[32px]">
            Referrals
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground sm:text-sm">
            {partner
              ? "Send your link to the businesses you work with. They get the partner discount when they start paying."
              : phone
                ? "Get a month free for every business that starts paying."
                : "Know another business that takes bookings? Send them your link and get a month free when they start paying."}
          </p>
        </header>

        {program.isLoading ? (
          <>
            <div className="h-[260px] animate-pulse rounded-[18px] bg-secondary" />
            <StatsGhost />
          </>
        ) : program.isError || !program.data ? (
          <EmptyState
            title="Couldn't load your referrals"
            description="Please try again shortly."
          />
        ) : (
          <ReferralsBody program={program.data} phone={phone} />
        )}
      </div>
    </Can>
  );
}

function ReferralsBody({ program, phone }: { program: ReferralProgram; phone: boolean }) {
  const { can, business } = useTenant();
  const timeZone = business?.defaultTimezone ?? "Europe/London";
  const now = new Date();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = referralLink(program.sharePath, program.code, origin);
  const trialDays = program.trialDays ?? DEFAULT_TRIAL_DAYS;
  const partner = program.program === "partner";
  const summary = progressOf(program);
  // Older APIs send no summary at all; then fall back to the permission check.
  const showRewards =
    program.summary === undefined ? can(PERMISSIONS.BILLING_MANAGE) : program.summary !== null;
  const hasReferrals = summary.signedUpCount > 0;
  const [qrOpen, setQrOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  // Older APIs send no codeChangesLeft and have no way to change the code.
  const onChangeCode =
    program.codeChangesLeft !== undefined && can(PERMISSIONS.BUSINESS_UPDATE)
      ? () => setCodeOpen(true)
      : undefined;

  const share =
    program.available === false ? (
      <div className="surface-card rounded-[18px] px-6 py-5 text-sm text-muted-foreground">
        Referrals aren't available on your account right now. Contact support if you think this is
        wrong.
      </div>
    ) : phone ? (
      <PhoneLinkCard
        link={link}
        code={program.code}
        trialDays={trialDays}
        onQr={() => setQrOpen(true)}
        onChangeCode={onChangeCode}
      />
    ) : (
      <ShareCard
        link={link}
        code={program.code}
        trialDays={trialDays}
        partner={partner}
        onQr={() => setQrOpen(true)}
        onChangeCode={onChangeCode}
      />
    );

  return (
    <>
      {share}
      {!hasReferrals ? (
        <EmptyReferrals link={link} />
      ) : (
        <>
          {showRewards ? (
            phone ? (
              partner ? null : (
                <EarnedRow summary={summary} timeZone={timeZone} now={now} />
              )
            ) : (
              <ProgressStrip summary={summary} partner={partner} timeZone={timeZone} now={now} />
            )
          ) : null}
          <ReferredList
            phone={phone}
            showRewards={showRewards}
            timeZone={timeZone}
            now={now}
            total={summary.signedUpCount}
          />
        </>
      )}
      {phone ? <PhoneHowItWorks trialDays={trialDays} partner={partner} /> : null}
      <QrDialog open={qrOpen} onOpenChange={setQrOpen} link={link} />
      {onChangeCode ? (
        <ChangeCodeDialog
          open={codeOpen}
          onOpenChange={setCodeOpen}
          link={link}
          changesLeft={program.codeChangesLeft ?? 0}
        />
      ) : null}
    </>
  );
}

function ChangeCodeDialog({
  open,
  onOpenChange,
  link,
  changesLeft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: string;
  changesLeft: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose your code</DialogTitle>
          <DialogDescription>
            Make it easy to remember, like your business name. Links and codes you've already shared
            keep working.
          </DialogDescription>
        </DialogHeader>
        <ChangeCodeForm link={link} changesLeft={changesLeft} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted with the dialog, so every opening starts empty. */
function ChangeCodeForm({
  link,
  changesLeft,
  onDone,
}: {
  link: string;
  changesLeft: number;
  onDone: () => void;
}) {
  const change = useChangeReferralCode();
  const [value, setValue] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const { prefix } = referralLinkParts(link);
  const code = compactCode(value);
  const shapeError = codeShapeProblem(value);
  const error = serverError ?? shapeError;

  const submit = async () => {
    if (!code || shapeError || change.isPending) return;
    setServerError(null);
    try {
      const updated = await change.mutateAsync(code);
      toast.success(`Your code is now ${updated.code}`);
      onDone();
    } catch (err) {
      const field =
        err instanceof ApiError ? err.fieldErrors.find((fe) => fe.field === "code") : undefined;
      if (err instanceof ApiError && err.status === 429) {
        setServerError("Too many attempts. Wait a minute and try again.");
      } else {
        setServerError(codeErrorMessage(field?.code));
      }
    }
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Label htmlFor="referral-code">New code</Label>
      <Input
        id="referral-code"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setServerError(null);
        }}
        placeholder="SHINECARS"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={CODE_MAX_LENGTH + 8}
        aria-invalid={error ? true : undefined}
        aria-describedby="referral-code-help"
        className="uppercase"
      />
      <div id="referral-code-help" className="space-y-1 text-[13px]">
        {error ? (
          <p role="alert" className="font-semibold text-destructive">
            {error}
          </p>
        ) : null}
        <p className="break-all text-muted-foreground">
          {prefix}
          <strong className="font-bold text-foreground">{code || "YOURCODE"}</strong>
        </p>
        <p className="text-muted-foreground">
          4 to 16 letters or numbers. {changesLeftLine(changesLeft)}
        </p>
      </div>
      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!code || Boolean(shapeError) || change.isPending}>
          {change.isPending ? "Saving…" : "Save code"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LinkField({ link }: { link: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { prefix, code } = referralLinkParts(link);
  const selectAll = () => {
    const node = ref.current;
    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  return (
    <div
      ref={ref}
      role="textbox"
      aria-readonly="true"
      aria-label="Your referral link"
      tabIndex={0}
      onClick={selectAll}
      onFocus={selectAll}
      className="flex h-[42px] min-w-0 flex-1 cursor-text items-center truncate rounded-[10px] border bg-secondary px-3.5 text-[14px] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="truncate">
        {prefix}
        <strong className="font-bold text-foreground">{code}</strong>
      </span>
    </div>
  );
}

function CopyLinkButton({
  link,
  variant = "default",
  className,
}: {
  link: string;
  variant?: "default" | "outline";
  className?: string;
}) {
  const { copy, region } = useCopy();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={cn("h-[42px] px-5", className)}
        onClick={async () => {
          if (await copy(link, "Link copied")) setCopied(true);
        }}
      >
        {copied ? (
          <>
            Copied <Check className="size-4" aria-hidden />
          </>
        ) : (
          "Copy link"
        )}
      </Button>
      {region}
    </>
  );
}

function ShareButton({
  icon,
  label,
  fullLabel,
  href,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  fullLabel: string;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="flex size-6 items-center justify-center rounded-md bg-secondary text-foreground">
        {icon}
      </span>
      {label}
    </>
  );
  const cls =
    "inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-[10px] border bg-card pr-3.5 pl-1.5 text-[13.5px] font-semibold transition-colors hover:bg-secondary/60";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" aria-label={fullLabel} className={cls}>
      {inner}
    </a>
  ) : (
    <button type="button" aria-label={fullLabel} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function ShareCard({
  link,
  code,
  trialDays,
  partner,
  onQr,
  onChangeCode,
}: {
  link: string;
  code: string;
  trialDays: number;
  partner: boolean;
  onQr: () => void;
  onChangeCode?: () => void;
}) {
  const { copy, region } = useCopy();
  const touch = useMediaQuery("(pointer: coarse)");
  const urls = shareUrls(link, trialDays);
  return (
    <section className="surface-card grid rounded-[18px] px-7 py-6 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0 lg:pr-7">
        <span
          className={cn(
            "inline-flex h-[26px] items-center rounded-full px-3 text-[12.5px] font-extrabold",
            MINT_TINT,
          )}
        >
          {partner ? "Partner programme" : "1 month free for every business"}
        </span>
        <h2 className="mt-3 text-[24px] leading-tight font-extrabold tracking-[-0.02em]">
          Share your link
        </h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Personal trainers, detailers, driving instructors, anyone who takes bookings.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <LinkField link={link} />
          <CopyLinkButton link={link} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ShareButton
            icon={<MessageCircle className="size-3.5" aria-hidden />}
            label="WhatsApp"
            fullLabel="Share on WhatsApp"
            href={urls.whatsapp}
          />
          <ShareButton
            icon={<Mail className="size-3.5" aria-hidden />}
            label="Email"
            fullLabel="Share by email"
            href={urls.email}
          />
          {touch ? (
            <ShareButton
              icon={<MessageSquareText className="size-3.5" aria-hidden />}
              label="Text"
              fullLabel="Share by text message"
              href={urls.sms}
            />
          ) : null}
          <ShareButton
            icon={<QrCode className="size-3.5" aria-hidden />}
            label="QR code"
            fullLabel="Show QR code"
            onClick={onQr}
          />
        </div>
        <p className="mt-4 text-[13px] text-muted-foreground">
          Signing up another way? They can type your code{" "}
          <strong className="font-bold tracking-[0.06em] text-foreground">{code}</strong>{" "}
          <button
            type="button"
            className="cursor-pointer font-semibold text-foreground underline underline-offset-2"
            onClick={() => void copy(code, "Code copied")}
          >
            Copy code
          </button>
          {onChangeCode ? (
            <>
              {" · "}
              <button
                type="button"
                className="cursor-pointer font-semibold text-foreground underline underline-offset-2"
                onClick={onChangeCode}
              >
                Change code
              </button>
            </>
          ) : null}
          {region}
        </p>
      </div>
      <div className="mt-6 border-t pt-5 lg:mt-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
        <HowItWorks trialDays={trialDays} partner={partner} />
      </div>
    </section>
  );
}

function howSteps(trialDays: number, partner: boolean): { title: string; body: string }[] {
  return [
    { title: "Share your link.", body: "Send it to another business, or show them your QR code." },
    { title: "They try RECAVO free.", body: `${trialDays} days free.` },
    partner
      ? {
          title: "They get the partner discount.",
          body: "Monthly: 20% off their first six months. Annual: 10% off their first year.",
        }
      : {
          title: "You get a month free.",
          body: "Once they pay their first invoice. Monthly: your next invoice is free. Annual: your renewal moves back a month.",
        },
  ];
}

function HowItWorks({ trialDays, partner }: { trialDays: number; partner: boolean }) {
  const [termsOpen, setTermsOpen] = useState(false);
  return (
    <div>
      <h3 className="text-[12px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        How it works
      </h3>
      <ol className="mt-3 space-y-3.5">
        {howSteps(trialDays, partner).map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span
              className={cn(
                "flex size-[26px] shrink-0 items-center justify-center rounded-full text-[12.5px] font-extrabold",
                MINT_TINT,
              )}
              aria-hidden
            >
              {i + 1}
            </span>
            <p className="text-[13.5px] leading-snug">
              <strong className="font-bold">{s.title}</strong>{" "}
              <span className="text-muted-foreground">{s.body}</span>
            </p>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => setTermsOpen(true)}
        className="mt-4 inline-flex cursor-pointer items-center gap-0.5 text-[13px] font-bold text-muted-foreground hover:text-foreground"
      >
        Terms <ChevronRight className="size-3.5" aria-hidden />
      </button>
      <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} partner={partner} />
    </div>
  );
}

function TermsDialog({
  open,
  onOpenChange,
  partner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner: boolean;
}) {
  const terms = partner
    ? [
        "Businesses that sign up with your link or code get the partner discount on their RECAVO plan: 20% off their first six months on a monthly plan, or 10% off their first year on an annual plan.",
        "The code has to be used when they create their business. It can't be added afterwards.",
        "You can't use your own code.",
        "If you change your code, links and codes you've already shared keep working. Codes with explicit or offensive words aren't allowed.",
        "The partner programme earns you no free months.",
      ]
    : [
        "You get one free month for each business that signs up with your link or code and pays its first invoice after the free trial.",
        "Monthly plans: your next invoice is free. Annual plans: your renewal date moves back one month.",
        "Several free months queue up, one per invoice or renewal.",
        "The code has to be used when they create their business. It can't be added afterwards.",
        "You can't use your own code.",
        "If you change your code, links and codes you've already shared keep working. Codes with explicit or offensive words aren't allowed.",
      ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Referral terms</DialogTitle>
          <DialogDescription className="sr-only">How referral rewards work.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {terms.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function PhoneHowItWorks({ trialDays, partner }: { trialDays: number; partner: boolean }) {
  return (
    <Collapsible className="surface-card rounded-[18px]">
      <CollapsibleTrigger className="group flex min-h-[48px] w-full cursor-pointer items-center justify-between px-4 text-[15px] font-bold">
        How it works
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <HowItWorks trialDays={trialDays} partner={partner} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function PhoneLinkCard({
  link,
  code,
  trialDays,
  onQr,
  onChangeCode,
}: {
  link: string;
  code: string;
  trialDays: number;
  onQr: () => void;
  onChangeCode?: () => void;
}) {
  const { copy, region } = useCopy();
  const shareLink = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text: shareMessage(link, trialDays) });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    await copy(link, "Link copied");
  };
  return (
    <section className="surface-card rounded-[18px] p-4">
      <h2 className="text-[12px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
        Your link
      </h2>
      <div className="mt-2 flex">
        <LinkField link={link} />
      </div>
      <Button
        type="button"
        className="mt-3 h-12 w-full text-[15px]"
        onClick={() => void shareLink()}
      >
        <Share2 className="size-4" aria-hidden /> Share link
      </Button>
      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 text-[13px] text-muted-foreground">
        Code <strong className="font-bold tracking-[0.06em] text-foreground">{code}</strong>
        <span aria-hidden>·</span>
        <button
          type="button"
          className="min-h-[44px] cursor-pointer px-1 font-semibold text-foreground"
          aria-label="Copy code"
          onClick={() => void copy(code, "Code copied")}
        >
          Copy
        </button>
        <span aria-hidden>·</span>
        <button
          type="button"
          className="min-h-[44px] cursor-pointer px-1 font-semibold text-foreground"
          onClick={onQr}
        >
          QR code
        </button>
      </p>
      {onChangeCode ? (
        <div className="-mt-2 flex justify-center">
          <button
            type="button"
            className="min-h-[44px] cursor-pointer px-2 text-[13px] font-semibold text-muted-foreground underline underline-offset-2"
            onClick={onChangeCode}
          >
            Change code
          </button>
        </div>
      ) : null}
      {region}
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border px-4 py-3.5",
        highlight ? "border-transparent bg-primary-soft" : "bg-card",
      )}
    >
      <p
        className={cn(
          "text-[12.5px] font-bold",
          highlight ? "text-[#0f5c40] dark:text-mint" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p className="mt-1 text-[22px] leading-tight font-extrabold tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[12.5px]",
          highlight ? "text-[#0f5c40]/80 dark:text-mint/80" : "text-muted-foreground",
        )}
      >
        {sub}
      </p>
    </div>
  );
}

function ProgressStrip({
  summary,
  partner,
  timeZone,
  now,
}: {
  summary: ReferralSummary;
  partner: boolean;
  timeZone: string;
  now: Date;
}) {
  const earned = earnedTile(summary, timeZone, now);
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3",
        partner ? "lg:grid-cols-3" : "lg:grid-cols-[1.3fr_1fr_1fr_1fr]",
      )}
    >
      {partner ? null : (
        <Tile label="Free months earned" value={earned.value} sub={earned.sub} highlight />
      )}
      <Tile label="Signed up" value={String(summary.signedUpCount)} sub="With your link or code" />
      <Tile
        label="On free trial"
        value={String(summary.onTrialCount)}
        sub={partner ? "Could join at the partner rate" : "Could earn you a month"}
      />
      <Tile
        label="Paying"
        value={String(summary.payingCount)}
        sub={partner ? "At the partner rate" : payingSub(summary)}
      />
    </div>
  );
}

function EarnedRow({
  summary,
  timeZone,
  now,
}: {
  summary: ReferralSummary;
  timeZone: string;
  now: Date;
}) {
  const earned = earnedTile(summary, timeZone, now);
  const saved =
    summary.savedMinor !== null && summary.currency && summary.freeMonthsEarned > 0
      ? ` · ${formatMoney(summary.savedMinor, summary.currency, { compact: true })}`
      : "";
  return (
    <div className="surface-card flex items-center gap-3 rounded-[18px] p-3.5">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-[12px] text-[18px] font-extrabold tabular-nums",
          MINT_TINT,
        )}
      >
        {summary.freeMonthsEarned}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">Free months earned{saved}</span>
        <span className="block text-[12.5px] text-muted-foreground">{earned.short}</span>
      </span>
    </div>
  );
}

function EmptyReferrals({ link }: { link: string }) {
  return (
    <div className="flex flex-col items-center rounded-[18px] border-2 border-dashed px-6 py-10 text-center">
      <span
        className={cn("flex size-[52px] items-center justify-center rounded-[14px]", MINT_TINT)}
        aria-hidden
      >
        <Gift className="size-6" />
      </span>
      <h2 className="mt-4 text-[16px] font-extrabold">No referrals yet</h2>
      <p className="mt-1 max-w-md text-[13.5px] text-muted-foreground">
        Businesses that sign up with your link show here, with how far along they are and when your
        free month is coming.
      </p>
      <div className="mt-4">
        <CopyLinkButton link={link} variant="outline" />
      </div>
    </div>
  );
}

function BusinessAvatar({ row }: { row: ReferredBusiness }) {
  return (
    <span
      className={cn(
        "flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-[12px] font-extrabold",
        AVATAR_TINTS[avatarTintIndex(row.id)],
      )}
      aria-hidden
    >
      {initials(row.name) || "?"}
    </span>
  );
}

function ReferredList({
  phone,
  showRewards,
  timeZone,
  now,
  total,
}: {
  phone: boolean;
  showRewards: boolean;
  timeZone: string;
  now: Date;
  total: number;
}) {
  const [page, setPage] = useState(0);
  const list = useReferredBusinesses(page);
  const count = list.data?.total ?? total;
  const pages = Math.max(1, Math.ceil(count / REFERRED_PAGE_SIZE));

  // Older APIs have no list endpoint; the progress strip still shows.
  if (list.isError) return null;

  return (
    <section className="surface-card overflow-hidden rounded-[18px]">
      <div className="flex items-baseline justify-between gap-3 px-5 py-4">
        <h2 className="text-[15px] font-extrabold">Businesses you've referred</h2>
        <span className="text-[13px] text-muted-foreground">{count} in total</span>
      </div>
      {list.isLoading || !list.data ? (
        <TableGhost rows={3} />
      ) : phone ? (
        <ul className="divide-y border-t">
          {list.data.referrals.map((row) => {
            const status = statusView(row, timeZone, now);
            return (
              <li
                key={row.id}
                aria-label={rowLabel(row, timeZone, now)}
                className={cn(
                  "flex min-h-[60px] items-center gap-3 px-4 py-2.5",
                  status.faded && "opacity-60",
                )}
              >
                <BusinessAvatar row={row} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{row.name}</span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    {status.line}
                  </span>
                </span>
                <TonePill tone={status.tone}>{status.label}</TonePill>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <colgroup>
              <col style={{ width: showRewards ? "36%" : "48%" }} />
              <col style={{ width: 130 }} />
              <col />
              {showRewards ? <col style={{ width: "22%" }} /> : null}
            </colgroup>
            <thead className="h-10 bg-secondary/50 text-muted-foreground">
              <tr>
                {["Business", "Signed up", "Status", ...(showRewards ? ["Your reward"] : [])].map(
                  (h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-5 py-2.5 text-left text-xs font-bold whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {list.data.referrals.map((row) => {
                const status = statusView(row, timeZone, now);
                const reward = showRewards ? rewardView(row, timeZone, now) : null;
                return (
                  <tr
                    key={row.id}
                    aria-label={rowLabel(row, timeZone, now)}
                    className={cn("h-[62px] border-t", status.faded && "opacity-60")}
                  >
                    <td className="px-5 py-2.5">
                      <span className="flex min-w-0 items-center gap-3">
                        <BusinessAvatar row={row} />
                        <span className="min-w-0">
                          <span className="block truncate text-[14.5px] font-bold">{row.name}</span>
                          <span className="block truncate text-[12.5px] text-muted-foreground">
                            {tradeLabel(row.industryTemplateKey)}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-[13.5px]">
                      {shortDate(row.signedUpAt, timeZone, now)}
                    </td>
                    <td className="px-5 py-2.5">
                      <TonePill tone={status.tone}>{status.label}</TonePill>
                      <span className="mt-1 block truncate text-[12px] text-muted-foreground">
                        {status.line}
                      </span>
                    </td>
                    {showRewards ? (
                      <td className="px-5 py-2.5">
                        {reward ? (
                          <>
                            <span
                              className={cn(
                                "block text-[13.5px] font-bold",
                                REWARD_TONE[reward.tone],
                              )}
                            >
                              {reward.main}
                            </span>
                            {reward.sub ? (
                              <span className="block truncate text-[12px] text-muted-foreground">
                                {reward.sub}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <div className="flex items-center justify-between border-t px-5 py-3 text-[13px] text-muted-foreground">
          <span>
            Page {page + 1} of {pages}
          </span>
          <span className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </span>
        </div>
      ) : null}
    </section>
  );
}

function QrDialog({
  open,
  onOpenChange,
  link,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void QRCode.toDataURL(link, { width: 720, margin: 2, errorCorrectionLevel: "M" }).then(
      (url) => {
        if (live) setDataUrl(url);
      },
    );
    return () => {
      live = false;
    };
  }, [open, link]);

  const print = () => {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "width=600,height=700");
    if (!w) return;
    const doc = w.document;
    doc.title = "RECAVO referral QR code";
    const img = doc.createElement("img");
    img.src = dataUrl;
    img.alt = "QR code for your referral link";
    img.style.cssText = "width:360px;height:360px;display:block;margin:48px auto 16px";
    const caption = doc.createElement("p");
    caption.textContent = link;
    caption.style.cssText = "font:16px system-ui,sans-serif;text-align:center";
    doc.body.append(img, caption);
    img.onload = () => {
      w.focus();
      w.print();
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your QR code</DialogTitle>
          <DialogDescription>Let another business scan it to open your link.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt="QR code for your referral link"
              className="size-64 rounded-[14px] border bg-white p-2"
            />
          ) : (
            <div className="size-64 animate-pulse rounded-[14px] bg-secondary" />
          )}
          <p className="text-center text-[13px] break-all text-muted-foreground">{link}</p>
          <div className="flex w-full gap-2">
            <Button asChild variant="outline" className="flex-1" disabled={!dataUrl}>
              <a href={dataUrl ?? undefined} download="recavo-referral-qr.png">
                <Download className="size-4" aria-hidden /> Download PNG
              </a>
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={print}>
              <Printer className="size-4" aria-hidden /> Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
