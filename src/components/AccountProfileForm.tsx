import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ApiError, toastApiError } from "@/lib/api";
import { useUpdateMe } from "@/lib/api/hooks";
import type { UserProfileUpdate } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-store";
import { cn } from "@/lib/utils";

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
 */
const NOT_SET = "__unset__";

/** Enough coverage for the markets we sell in; the API accepts any BCP 47 tag. */
const LOCALES = [
  "en-GB",
  "en-US",
  "en-IE",
  "fr-FR",
  "de-DE",
  "es-ES",
  "it-IT",
  "nl-NL",
  "pt-PT",
  "pl-PL",
] as const;

function localeLabel(tag: string): string {
  try {
    const display = new Intl.DisplayNames(["en"], { type: "language" }).of(tag);
    return display && display !== tag ? `${display} (${tag})` : tag;
  } catch {
    return tag;
  }
}

/**
 * The API validates against the runtime's zone table and rejects abbreviations
 * and UTC offsets, so offering the same table is the only way to guarantee the
 * value we send is one it will accept.
 */
function supportedTimezones(): string[] {
  const withValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  try {
    return withValues.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

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

export function AccountProfileForm() {
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
        return;
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
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Email</Label>
        <Input type="email" value={user?.email ?? ""} disabled />
        <p className="text-xs text-muted-foreground">
          Your email, password and two-factor settings are part of sign-in, not your profile.
        </p>
      </div>

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
          className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          value={draft.locale === "" ? NOT_SET : draft.locale}
          onChange={(e) => set("locale")(e.target.value === NOT_SET ? "" : e.target.value)}
        >
          <option value={NOT_SET}>Not set</option>
          {/* A tag the account already holds may sit outside our shortlist. */}
          {draft.locale && !LOCALES.includes(draft.locale as (typeof LOCALES)[number]) ? (
            <option value={draft.locale}>{localeLabel(draft.locale)}</option>
          ) : null}
          {LOCALES.map((tag) => (
            <option key={tag} value={tag}>
              {localeLabel(tag)}
            </option>
          ))}
        </select>
        {fieldErrors.locale ? (
          <p className="text-destructive text-xs">{fieldErrors.locale}</p>
        ) : null}
      </div>

      <TimezoneField
        value={draft.timezone}
        onChange={set("timezone")}
        error={fieldErrors.timezone}
      />

      <Button
        className="w-fit"
        disabled={updateMe.isPending || changed.length === 0}
        onClick={save}
      >
        {updateMe.isPending ? "Saving…" : "Save profile"}
      </Button>
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

function TimezoneField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(supportedTimezones, []);
  const detected = useMemo(browserTimezone, []);

  // Nothing reads this preference yet, so promising it changes anything the
  // user can see — email times, for instance — would be a lie.
  const hint =
    detected && detected !== value
      ? `This device is set to ${detected}.`
      : "Saved to your account.";

  return (
    <div className="grid gap-2">
      <Label htmlFor="profile-timezone">Timezone</Label>
      {zones.length === 0 ? (
        <Input
          id="profile-timezone"
          value={value}
          placeholder="Europe/London"
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id="profile-timezone"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn("justify-between font-normal", !value && "text-muted-foreground")}
            >
              {value || "Not set"}
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search timezones…" />
              <CommandList>
                <CommandEmpty>No timezone found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="Not set"
                    onSelect={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 size-4", value ? "opacity-0" : "opacity-100")} />
                    Not set
                  </CommandItem>
                  {zones.map((zone) => (
                    <CommandItem
                      key={zone}
                      value={zone}
                      onSelect={() => {
                        onChange(zone);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("mr-2 size-4", value === zone ? "opacity-100" : "opacity-0")}
                      />
                      {zone}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
