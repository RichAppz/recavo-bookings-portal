import { useState, type ReactNode } from "react";
import { ChevronRight, Clock, Tag } from "lucide-react";
import {
  BarSummary,
  BottomBar,
  ClientColumn,
  PageTitle,
  PrimaryButton,
  StepHeader,
} from "@/components/client/ClientPage";
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

export function ClientDetails({
  values,
  onChange,
  errors,
  whenLabel,
  summaryCaption,
  onBack,
  onChangeTime,
  onContinue,
  canContinue,
  pending,
  signedInAs,
  onSignIn,
  onNotYou,
  promoApplied,
  promoError,
}: {
  values: DetailsValues;
  onChange: (patch: Partial<DetailsValues>) => void;
  errors: Partial<Record<DetailsField, string>>;
  /** "Fri 16 Oct, 09:00" */
  whenLabel: string;
  /** "1-to-1 session · £45" */
  summaryCaption: string;
  onBack: () => void;
  onChangeTime: () => void;
  onContinue: () => void;
  canContinue: boolean;
  pending: boolean;
  /** The signed-in customer's name; the form is then pre-filled and locked to them. */
  signedInAs: string | null;
  onSignIn: () => void;
  onNotYou: () => void;
  /** What the code is worth, once the studio has confirmed it. */
  promoApplied: string | null;
  promoError: string | null;
}) {
  const [promoOpen, setPromoOpen] = useState(Boolean(values.promoCode));

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

        {signedInAs ? (
          <div className="mt-4 flex items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3">
            <div>
              <p className="text-[13px] text-muted-foreground">Booking as</p>
              <p className="text-[17px] font-semibold">{signedInAs}</p>
            </div>
            <button
              type="button"
              onClick={onNotYou}
              className="text-[15px] font-semibold underline underline-offset-4"
            >
              Not you?
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="mt-4 flex w-full items-center justify-between rounded-[var(--radius)] border border-border bg-card px-4 py-3 text-left transition hover:bg-muted"
          >
            <span>
              <span className="block text-[15px] font-semibold">Booked here before?</span>
              <span className="block text-[13px] text-muted-foreground">
                Sign in with a code and skip this step
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
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
        </div>

        <Field label="Email" error={errors.email} className="mt-4">
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
          hint="We'll text you a reminder the day before."
          className="mt-4"
        >
          <div
            className={cn(
              "flex h-[56px] items-stretch overflow-hidden rounded-[var(--radius)] border bg-card transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
              errors.phone ? "border-destructive" : "border-input",
            )}
          >
            <span className="flex items-center border-r border-border px-4 text-[17px] text-muted-foreground">
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
              className="min-w-0 flex-1 bg-transparent px-4 text-[17px] text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </Field>

        <Field label="Anything we should know? (optional)" className="mt-4">
          <textarea
            value={values.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={2}
            maxLength={500}
            placeholder="Injuries, goals, access needs"
            className="w-full resize-none rounded-[var(--radius)] border border-input bg-card px-4 py-3 text-[17px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <div className="mt-4">
          {promoOpen ? (
            <Field
              label="Promo code"
              error={promoError ?? undefined}
              hint={promoApplied ?? undefined}
            >
              <div className="flex items-center gap-2">
                <TextInput
                  value={values.promoCode}
                  onChange={(v) => onChange({ promoCode: v.toUpperCase() })}
                  autoComplete="off"
                  invalid={Boolean(promoError)}
                  className="font-mono uppercase"
                  placeholder="SUMMER10"
                />
              </div>
            </Field>
          ) : (
            <button
              type="button"
              onClick={() => setPromoOpen(true)}
              className="inline-flex items-center gap-2 text-[15px] font-semibold underline underline-offset-4"
            >
              <Tag className="h-4 w-4" />
              Have a code?
            </button>
          )}
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 text-[14px] text-muted-foreground">
          <input
            type="checkbox"
            checked={values.marketingConsent}
            onChange={(e) => onChange({ marketingConsent: e.target.checked })}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-input accent-[var(--client-accent)]"
          />
          <span>
            Keep me posted about offers and news from this business. You can opt out any time.
          </span>
        </label>
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
      <span className="mb-1.5 block text-[15px] font-semibold">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[13px] text-destructive">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-muted-foreground">{hint}</span>
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
        "h-[56px] w-full rounded-[var(--radius)] border bg-card px-4 text-[17px] text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/30",
        invalid ? "border-destructive" : "border-input",
        className,
      )}
      {...rest}
    />
  );
}
