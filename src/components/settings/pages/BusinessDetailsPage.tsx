import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { MenuSwitches } from "@/components/settings/MenuSwitches";
import {
  PrefixField,
  ReadOnlyNotice,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/primitives";
import { useSettingsDraft } from "@/components/settings/save-bar";
import { TimezoneCombobox } from "@/components/TimezoneCombobox";
import { StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastApiError } from "@/lib/api/errors";
import { useUpdateBusiness } from "@/lib/api/hooks";
import type { Business } from "@/lib/api/types";
import { bookingUrlFor } from "@/lib/hosts";
import { PERMISSIONS } from "@/lib/permissions";
import {
  CURRENCY_OPTIONS,
  LOCALE_OPTIONS,
  formatIndustry,
  localeLabel,
} from "@/lib/settings-labels";
import { useTenant } from "@/lib/tenant/tenant-context";

/**
 * Mirrors the server's slugify so the preview cannot promise a link the API
 * will then rewrite. The server remains the authority; this only stops the
 * field from lying while someone types.
 */
export function slugifyPreview(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

type Draft = {
  tradingName: string;
  legalName: string;
  slug: string;
  currency: string;
  timezone: string;
  locale: string;
};

function draftFrom(b: Business): Draft {
  return {
    tradingName: b.tradingName,
    legalName: b.legalName,
    slug: b.slug,
    currency: b.currency,
    timezone: b.defaultTimezone,
    locale: b.locale,
  };
}

/** Settings → Business details (spec §5): names, booking link, region, menu. */
export function BusinessDetailsPage() {
  const tenant = useTenant();
  const business = tenant.business!;
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const update = useUpdateBusiness();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(business));

  useEffect(() => {
    setDraft(draftFrom(business));
  }, [business]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const normalisedSlug = slugifyPreview(draft.slug);
  const slugChanged = normalisedSlug !== business.slug;
  const slugTooShort = normalisedSlug.length < 3;
  const savedUrl = bookingUrlFor(business.slug);
  const previewUrl = normalisedSlug ? bookingUrlFor(normalisedSlug) : savedUrl;
  const prefix = `${savedUrl.replace(/^https?:\/\//, "").replace(new RegExp(`/${business.slug}$`), "")}/`;

  const trimmed = {
    tradingName: draft.tradingName.trim(),
    legalName: draft.legalName.trim(),
    currency: draft.currency.trim().toUpperCase(),
    defaultTimezone: draft.timezone.trim(),
    locale: draft.locale.trim(),
  };
  const dirty =
    trimmed.tradingName !== business.tradingName ||
    trimmed.legalName !== business.legalName ||
    trimmed.currency !== business.currency ||
    trimmed.defaultTimezone !== business.defaultTimezone ||
    trimmed.locale !== business.locale ||
    slugChanged;
  const valid =
    trimmed.tradingName.length > 0 &&
    trimmed.legalName.length > 0 &&
    trimmed.currency.length === 3 &&
    trimmed.defaultTimezone.length > 0 &&
    trimmed.locale.length > 0 &&
    (!slugChanged || !slugTooShort);

  const save = async () => {
    try {
      await update.mutateAsync({
        version: business.version,
        body: {
          ...trimmed,
          ...(slugChanged ? { slug: normalisedSlug } : {}),
        },
      });
      toast.success(
        slugChanged ? "Business details and booking link updated" : "Business details updated",
      );
    } catch (err) {
      toastApiError(err, "Couldn't update the business");
      throw err;
    }
  };

  useSettingsDraft({
    dirty: canEdit && dirty,
    valid,
    saving: update.isPending,
    save,
    discard: () => setDraft(draftFrom(business)),
  });

  const currencyOptions = CURRENCY_OPTIONS.some((c) => c.code === draft.currency)
    ? CURRENCY_OPTIONS
    : [{ code: draft.currency, label: draft.currency }, ...CURRENCY_OPTIONS];
  const localeOptions = (LOCALE_OPTIONS as readonly string[]).includes(draft.locale)
    ? [...LOCALE_OPTIONS]
    : [draft.locale, ...LOCALE_OPTIONS];

  return (
    <SettingsPage
      title="Business details"
      description="Who you are, where clients book you, and what shows in your menu."
      banner={canEdit ? null : <ReadOnlyNotice />}
    >
      <SettingsSection
        id="business-names"
        title="Names"
        help="Your trading name is what clients see. The legal name goes on invoices."
        aside={
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusBadge status={business.status} />
          </p>
        }
      >
        <div className="grid gap-2">
          <Label htmlFor="biz-trading">Trading name</Label>
          <Input
            id="biz-trading"
            value={draft.tradingName}
            disabled={!canEdit}
            onChange={(e) => set({ tradingName: e.target.value })}
            aria-invalid={trimmed.tradingName.length === 0 ? true : undefined}
          />
          {trimmed.tradingName.length === 0 ? (
            <p className="text-xs text-destructive">Enter a trading name.</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="biz-legal">Legal name</Label>
          <Input
            id="biz-legal"
            value={draft.legalName}
            disabled={!canEdit}
            onChange={(e) => set({ legalName: e.target.value })}
            aria-invalid={trimmed.legalName.length === 0 ? true : undefined}
          />
          {trimmed.legalName.length === 0 ? (
            <p className="text-xs text-destructive">Enter a legal name.</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="biz-industry">Industry</Label>
          <Select value={business.industryTemplateKey} disabled>
            <SelectTrigger id="biz-industry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={business.industryTemplateKey}>
                {formatIndustry(business.industryTemplateKey)}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Set when the business was created — it shapes your defaults and wording. Contact support
            to change it.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        id="business-link"
        title="Booking link"
        help="The public page where clients book you. Put it on your website, socials and cards."
      >
        <div className="grid gap-2">
          <Label htmlFor="booking-slug">Public booking link</Label>
          <PrefixField
            id="booking-slug"
            prefix={prefix}
            value={draft.slug}
            placeholder={business.slug}
            disabled={!canEdit}
            onChange={(value) => set({ slug: value })}
            status={
              slugChanged && slugTooShort
                ? "At least 3 letters or numbers."
                : slugChanged
                  ? `Will become ${previewUrl.replace(/^https?:\/\//, "")}. Changing it breaks links you've already shared.`
                  : `Live at ${savedUrl.replace(/^https?:\/\//, "")}`
            }
            statusTone={slugChanged ? (slugTooShort ? "error" : "warning") : "muted"}
            trailing={
              <Button
                type="button"
                variant="outline"
                aria-label="Copy booking link"
                onClick={() => {
                  void navigator.clipboard.writeText(savedUrl);
                  toast.success("Booking link copied");
                }}
              >
                <Copy className="size-4" />
                <span className="hidden sm:inline">Copy</span>
              </Button>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection
        id="business-region"
        title="Region"
        help="Prices, times and dates across RECAVO follow these."
      >
        <div className="grid gap-2">
          <Label htmlFor="biz-currency">Currency</Label>
          <Select
            value={draft.currency}
            disabled={!canEdit}
            onValueChange={(value) => set({ currency: value })}
          >
            <SelectTrigger id="biz-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="biz-timezone">Time zone</Label>
          <TimezoneCombobox
            id="biz-timezone"
            value={draft.timezone}
            disabled={!canEdit}
            onChange={(value) => set({ timezone: value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="biz-locale">Date and number format</Label>
          <Select
            value={draft.locale}
            disabled={!canEdit}
            onValueChange={(value) => set({ locale: value })}
          >
            <SelectTrigger id="biz-locale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {localeOptions.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {localeLabel(tag)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsSection>

      <SettingsSection
        id="business-menu"
        title="Menu"
        help="Switch off the parts of RECAVO you don't use. Hidden items leave the sidebar for everyone in the business; nothing is deleted and you can bring them back any time."
      >
        <MenuSwitches />
      </SettingsSection>
    </SettingsPage>
  );
}
