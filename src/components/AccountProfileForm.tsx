import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSettingsDraft } from "@/components/settings/save-bar";
import { TimezoneCombobox, browserTimezone } from "@/components/TimezoneCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, toastApiError } from "@/lib/api";
import { useUpdateMe } from "@/lib/api/hooks";
import type { UserProfileUpdate } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-store";
import { LOCALE_OPTIONS, localeLabel } from "@/lib/settings-labels";

/**
 * The signed-in person's own account, as owned by `PATCH /api/v1/me`.
 *
 * Deliberately not tenant-scoped: a buyer who claimed a package and has no
 * staff membership still has one of these, which is why the component lives
 * here rather than inside the settings screen that first needed it.
 *
 * Three neighbouring things are not editable here and must not be conflated
 * with it: the Supabase credentials (email, password, 2FA), a staff member's
 * public-facing display name, and a business's own customer record.
 *
 * Inside Settings the page's save bar owns Save (`useSettingsDraft`); elsewhere
 * the form keeps its own button.
 */
const NOT_SET = "__unset__";

type Draft = {
  name: string;
  phone: string;
  locale: string;
  timezone: string;
};

/** `null` clears a field; `""` clears everything except `name`, which rejects it. */
function toPatchValue(next: string): string | null {
  const trimmed = next.trim();
  return trimmed === "" ? null : trimmed;
}

function draftFrom(user: {
  name?: string | null;
  phone?: string | null;
  locale?: string | null;
  timezone?: string | null;
}): Draft {
  return {
    name: user.name ?? "",
    phone: user.phone ?? "",
    locale: user.locale ?? "",
    timezone: user.timezone ?? "",
  };
}

export function AccountProfileForm({ showEmail = true }: { showEmail?: boolean }) {
  const { user } = useAuth();
  const updateMe = useUpdateMe();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(user ?? {}));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Draft, string>>>({});

  const saved = useMemo(() => draftFrom(user ?? {}), [user]);

  useEffect(() => {
    setDraft(saved);
    setFieldErrors({});
  }, [saved]);

  const changed = (Object.keys(saved) as (keyof Draft)[]).filter(
    (key) => draft[key].trim() !== saved[key],
  );

  const set = (key: keyof Draft) => (value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  async function save() {
    // A no-op patch still returns 200 and writes an audit row, so an untouched
    // form should never reach the network.
    if (changed.length === 0) return;

    const body: UserProfileUpdate = {};
    for (const key of changed) body[key] = toPatchValue(draft[key]);

    setFieldErrors({});
    try {
      await updateMe.mutateAsync(body);
      toast.success("Profile updated");
    } catch (err) {
      if (!(err instanceof ApiError)) {
        toastApiError(err);
        throw err;
      }
      const next: Partial<Record<keyof Draft, string>> = {};
      let unhandled = false;
      for (const fe of err.fieldErrors) {
        const message = fieldErrorMessage(fe.field, fe.code) ?? fe.message;
        if (fe.field in saved && message) next[fe.field as keyof Draft] = message;
        else unhandled = true;
      }
      setFieldErrors(next);
      // `body/REQUIRED` and `body/INVALID` describe the request rather than a
      // field, and both mean we built it wrong — surface them loudly.
      if (unhandled || Object.keys(next).length === 0) toastApiError(err);
      throw err;
    }
  }

  const bar = useSettingsDraft({
    dirty: changed.length > 0,
    valid: true,
    saving: updateMe.isPending,
    save,
    discard: () => {
      setDraft(saved);
      setFieldErrors({});
    },
  });

  const detected = useMemo(browserTimezone, []);
  // Nothing reads this preference yet, so promising it changes anything the
  // user can see — email times, for instance — would be a lie.
  const timezoneHint =
    detected && detected !== draft.timezone
      ? `This device is set to ${detected}.`
      : "Saved to your account.";

  return (
    <div className="grid gap-4">
      {showEmail ? (
        <div className="grid gap-2">
          <Label>Email</Label>
          <Input type="email" value={user?.email ?? ""} disabled />
          <p className="text-xs text-muted-foreground">
            Your email, password and two-factor settings are part of sign-in, not your profile.
          </p>
        </div>
      ) : null}

      <TextField
        id="profile-name"
        label="Name"
        value={draft.name}
        onChange={set("name")}
        autoComplete="name"
        placeholder="Alex Morgan"
        error={fieldErrors.name}
      />

      <TextField
        id="profile-phone"
        label="Phone"
        type="tel"
        value={draft.phone}
        onChange={set("phone")}
        autoComplete="tel"
        placeholder="+44 7700 900123"
        hint="Used to reach you about your own account."
        error={fieldErrors.phone}
      />

      <div className="grid gap-2">
        <Label htmlFor="profile-locale">Language</Label>
        <select
          id="profile-locale"
          className="border-input bg-field ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-base focus-visible:ring-2 md:text-sm focus-visible:ring-offset-2 focus-visible:outline-none"
          value={draft.locale === "" ? NOT_SET : draft.locale}
          onChange={(e) => set("locale")(e.target.value === NOT_SET ? "" : e.target.value)}
        >
          <option value={NOT_SET}>Not set</option>
          {/* A tag the account already holds may sit outside our shortlist. */}
          {draft.locale &&
          !LOCALE_OPTIONS.includes(draft.locale as (typeof LOCALE_OPTIONS)[number]) ? (
            <option value={draft.locale}>{localeLabel(draft.locale)}</option>
          ) : null}
          {LOCALE_OPTIONS.map((tag) => (
            <option key={tag} value={tag}>
              {localeLabel(tag)}
            </option>
          ))}
        </select>
        {fieldErrors.locale ? (
          <p className="text-destructive text-xs">{fieldErrors.locale}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="profile-timezone">Time zone</Label>
        <TimezoneCombobox
          id="profile-timezone"
          value={draft.timezone}
          onChange={set("timezone")}
          allowUnset
          invalid={Boolean(fieldErrors.timezone)}
        />
        {fieldErrors.timezone ? (
          <p className="text-destructive text-xs">{fieldErrors.timezone}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{timezoneHint}</p>
        )}
      </div>

      {bar.managed ? null : (
        <Button
          className="w-fit"
          disabled={updateMe.isPending || changed.length === 0}
          onClick={() => void save().catch(() => undefined)}
        >
          {updateMe.isPending ? "Saving…" : "Save profile"}
        </Button>
      )}
    </div>
  );
}

/**
 * The stable (field, code) pairs the endpoint documents. Localising from the
 * code rather than the message keeps the copy ours; anything unrecognised falls
 * back to whatever the API sent.
 */
function fieldErrorMessage(field: string, code: string): string | undefined {
  if (field === "name" && code === "REQUIRED")
    return "Enter a name, or clear the field to remove it.";
  if (field === "name" && code === "TOO_LONG") return "Names can be at most 120 characters.";
  if (field === "phone" && code === "INVALID")
    return "Enter 7–15 digits, optionally starting with +.";
  if (field === "locale" && code === "TOO_LONG") return "That language tag is too long.";
  if (field === "locale" && code === "INVALID") return "That isn't a recognised language tag.";
  if (field === "timezone" && code === "INVALID") return "Pick a timezone from the list.";
  return undefined;
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
  hint,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
