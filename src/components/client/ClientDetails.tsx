import { useState, type ReactNode } from "react";
import { ChevronRight, Clock } from "lucide-react";
import {
  BarSummary,
  BottomBar,
  ClientCard,
  ClientColumn,
  HoldPill,
  PageTitle,
  PrimaryButton,
  StepHeader,
  SummaryRow,
  TextLink,
} from "@/components/client/ClientPage";
import { headerStyle, type BookingPageContent } from "@/lib/client-theme";
import { formatDuration, formatInTz, formatTimeInTz } from "@/lib/format";
import { price } from "@/lib/client-journey";
import { cn } from "@/lib/utils";

export type DetailsValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  promoCode: string;
  marketingConsent: boolean;
};

export type DetailsField = keyof Pick<DetailsValues, "firstName" | "lastName" | "email" | "phone">;

/** What the desktop summary card shows beside the form. */
export type DetailsSummary = {
  page: BookingPageContent;
  businessName: string;
  serviceName: string;
  start: string;
  end: string;
  timezone: string;
  durationMinutes: number;
  staffName: string | null;
  /** "Northside Studio, LS6" */
  where: string | null;
  priceMinor: number;
  currency: string;
  /** Countdown on a held time; null when nothing is held yet. */
  msLeft: number | null;
};

export function ClientDetails({
  values,
  onChange,
  errors,
  whenLabel,
  summaryCaption,
  summary,
  layout,
  onBack,
  onChangeTime,
  onContinue,
  canContinue,
  pending,
  signedInAs,
  onSignIn,
  onNotYou,
}: {
  values: DetailsValues;
  onChange: (patch: Partial<DetailsValues>) => void;
  errors: Partial<Record<DetailsField, string>>;
  /** "Fri 16 Oct, 09:00" */
  whenLabel: string;
  /** "1-to-1 session · £45" */
  summaryCaption: string;
  summary: DetailsSummary;
  layout: "phone" | "desktop";
  onBack: () => void;
  onChangeTime: () => void;
  onContinue: () => void;
  canContinue: boolean;
  pending: boolean;
  /** The signed-in customer's name; the form is then pre-filled and locked to them. */
  signedInAs: string | null;
  onSignIn: () => void;
  onNotYou: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(Boolean(values.notes));
  const desktop = layout === "desktop";

  const signInCard = signedInAs ? (
    <div className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3">
      <div>
        <p className="text-[13px] text-muted-foreground">Booking as</p>
        <p className="text-[17px] font-semibold">{signedInAs}</p>
      </div>
      <TextLink onClick={onNotYou}>Not you?</TextLink>
    </div>
  ) : (
    <button
      type="button"
      onClick={onSignIn}
      className="flex w-full items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-left transition hover:bg-muted"
    >
      <span>
        <span className="block text-[15px] font-semibold">Booked here before?</span>
        <span className="block text-[13px] text-muted-foreground">
          {desktop
            ? "Sign in with a code and we'll fill this in for you"
            : "Sign in with a code and skip this step"}
        </span>
      </span>
      {desktop ? (
        <span className="text-[14px] font-semibold">Sign in</span>
      ) : (
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      )}
    </button>
  );

  const fields = (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 desk:gap-x-4">
        <Field label="First name" error={errors.firstName}>
          <TextInput
            value={values.firstName}
            onChange={(v) => onChange({ firstName: v })}
            autoComplete="given-name"
            invalid={Boolean(errors.firstName)}
            required
          />
        </Field>
        <Field label="Surname" error={errors.lastName}>
          <TextInput
            value={values.lastName}
            onChange={(v) => onChange({ lastName: v })}
            autoComplete="family-name"
            invalid={Boolean(errors.lastName)}
            required
          />
        </Field>
        <Field
          label="Email"
          error={errors.email}
          hint="For your confirmation and receipt"
          className={cn(!desktop && "col-span-2")}
        >
          <TextInput
            type="email"
            value={values.email}
            onChange={(v) => onChange({ email: v })}
            autoComplete="email"
            inputMode="email"
            invalid={Boolean(errors.email)}
            required
          />
        </Field>
        <Field
          label="Mobile"
          error={errors.phone}
          hint="We'll text a reminder the day before"
          className={cn(!desktop && "col-span-2")}
        >
          <div
            className={cn(
              "flex items-stretch overflow-hidden rounded-[var(--radius)] border bg-card transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
              desktop ? "h-[48px]" : "h-[56px]",
              errors.phone ? "border-destructive" : "border-input",
            )}
          >
            <span
              className={cn(
                "flex items-center border-r border-border px-3.5 text-muted-foreground",
                desktop ? "text-[15px]" : "text-[17px]",
              )}
            >
              +44
            </span>
            <input
              type="tel"
              value={values.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              autoComplete="tel-national"
              inputMode="tel"
              placeholder="7700 900123"
              required
              className={cn(
                "min-w-0 flex-1 bg-transparent px-4 text-foreground outline-none placeholder:text-muted-foreground/60",
                desktop ? "text-[15px]" : "text-[17px]",
              )}
            />
          </div>
        </Field>
      </div>

      <div className="mt-4">
        {notesOpen ? (
          <Field label="Anything we should know? (optional)">
            <textarea
              value={values.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              rows={2}
              maxLength={500}
              placeholder="Injuries, goals, access needs"
              className={cn(
                "w-full resize-none rounded-[var(--radius)] border border-input bg-card px-4 py-3 text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/30",
                desktop ? "text-[15px]" : "text-[17px]",
              )}
            />
          </Field>
        ) : (
          <TextLink onClick={() => setNotesOpen(true)} className="text-[14px]">
            Anything we should know?
          </TextLink>
        )}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          checked={values.marketingConsent}
          onChange={(e) => onChange({ marketingConsent: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-[var(--client-accent)]"
        />
        <span>Keep me posted about offers and news from this business.</span>
      </label>
    </>
  );

  const summaryCard = <DetailsSummaryCard summary={summary} />;

  if (desktop) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canContinue && !pending) onContinue();
        }}
      >
        <ClientColumn wide className="pt-6">
          <div className="grid grid-cols-1 items-start gap-10 desk:grid-cols-[minmax(0,1fr)_320px] desk:gap-12">
            <div className="min-w-0">
              <PageTitle>Your details</PageTitle>
              <div className="mt-6">{signInCard}</div>
              <div className="mt-6">{fields}</div>
              <div className="mt-8 flex items-center justify-between">
                <TextLink onClick={onBack}>Back</TextLink>
                <PrimaryButton type="submit" disabled={!canContinue || pending}>
                  {pending ? "Holding your time…" : "Continue to review"}
                </PrimaryButton>
              </div>
            </div>
            <aside className="desk:sticky desk:top-6">{summaryCard}</aside>
          </div>
        </ClientColumn>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canContinue && !pending) onContinue();
      }}
    >
      <ClientColumn>
        <StepHeader step={2} total={3} label="Details" onBack={onBack} />

        <button
          type="button"
          onClick={onChangeTime}
          className="flex w-full items-center gap-2 rounded-[var(--radius)] bg-primary-soft px-4 py-3 text-left text-[15px] transition hover:brightness-95"
        >
          <Clock className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            Your time: <span className="font-semibold">{whenLabel}</span>
          </span>
          <span className="text-[13px] font-semibold text-muted-foreground">Change</span>
        </button>

        <PageTitle className="mt-5">Your details</PageTitle>
        <div className="mt-4">{signInCard}</div>
        <div className="mt-5">{fields}</div>
      </ClientColumn>

      <BottomBar>
        <BarSummary caption={summaryCaption} value={whenLabel} />
        <PrimaryButton type="submit" disabled={!canContinue || pending}>
          {pending ? "Holding…" : "Continue"}
        </PrimaryButton>
      </BottomBar>
    </form>
  );
}

/** Header image strip, service, when / length / trainer / venue, total, hold timer. */
function DetailsSummaryCard({ summary }: { summary: DetailsSummary }) {
  const when = `${formatInTz(summary.start, summary.timezone, { weekday: "short", day: "numeric", month: "short" })}, ${formatTimeInTz(summary.start, summary.timezone)}`;
  return (
    <ClientCard className="shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="h-[88px] w-full bg-muted" style={headerStyle(summary.page)} aria-hidden />
      <div className="px-5 pt-4 pb-5">
        <p className="text-[13px] text-muted-foreground">{summary.businessName}</p>
        <p className="text-[18px] font-semibold leading-tight">{summary.serviceName}</p>
        <div className="mt-3">
          <SummaryRow label="When" value={when} />
          <SummaryRow label="Length" value={formatDuration(summary.durationMinutes)} />
          <SummaryRow label="With" value={summary.staffName ?? "Any trainer"} />
          {summary.where ? <SummaryRow label="Where" value={summary.where} /> : null}
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-[15px] font-semibold">Total</span>
          <span className="text-[22px] font-bold">
            {summary.priceMinor === 0 ? "Free" : price(summary.priceMinor, summary.currency)}
          </span>
        </div>
        {summary.msLeft !== null ? <HoldPill msLeft={summary.msLeft} className="mt-3" /> : null}
      </div>
    </ClientCard>
  );
}

function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[14px] font-semibold">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[13px] text-destructive">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  type = "text",
  invalid = false,
  className,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  invalid?: boolean;
  className?: string;
  autoComplete?: string;
  inputMode?: "email" | "tel" | "text";
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-[56px] w-full rounded-[var(--radius)] border bg-card px-4 text-[17px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/30 desk:h-[48px] desk:text-[15px]",
        invalid ? "border-destructive" : "border-input",
        className,
      )}
      {...rest}
    />
  );
}
