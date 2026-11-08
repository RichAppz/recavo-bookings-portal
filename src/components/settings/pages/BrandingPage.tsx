import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandingLogoField } from "@/components/BrandingLogoField";
import { ReadOnlyNotice, SettingsPage, SettingsSection } from "@/components/settings/primitives";
import { useSettingsDraft } from "@/components/settings/save-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateConfiguration } from "@/lib/api/hooks";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

const DEFAULT_ACCENT = "#019c86";

type BrandingConfig = { logoUrl?: string | null; accentColour?: string | null };

/** Settings → Branding (spec §6): logo, accent colour, with the email preview live. */
export function BrandingPage() {
  const tenant = useTenant();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const update = useUpdateConfiguration();
  // Branding is not on the committed OpenAPI snapshot yet; read it through a
  // local shape until the schema is refreshed as its own change.
  const saved = (tenant.configuration as { branding?: BrandingConfig } | null | undefined)
    ?.branding;
  const savedLogo = saved?.logoUrl ?? "";
  const savedAccent = saved?.accentColour ?? "";
  const [logoUrl, setLogoUrl] = useState(savedLogo);
  const [accentColour, setAccentColour] = useState(savedAccent);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setLogoUrl(savedLogo);
    setAccentColour(savedAccent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLogo, savedAccent]);

  const accentValid = accentColour === "" || /^#[0-9a-fA-F]{6}$/.test(accentColour);
  const logoValid = logoUrl === "" || logoUrl.startsWith("https://");
  const accent = accentValid && accentColour ? accentColour : DEFAULT_ACCENT;

  const save = async () => {
    await update.mutateAsync({
      branding: {
        logoUrl: logoUrl.trim() || null,
        accentColour: accentColour.trim().toLowerCase() || null,
      },
    } as Parameters<typeof update.mutateAsync>[0] & { branding: BrandingConfig });
    setDirty(false);
    toast.success("Branding saved");
  };

  useSettingsDraft({
    dirty: canEdit && dirty,
    valid: accentValid && logoValid,
    saving: update.isPending,
    save,
    discard: () => {
      setLogoUrl(savedLogo);
      setAccentColour(savedAccent);
      setDirty(false);
    },
  });

  return (
    <SettingsPage
      title="Branding"
      description="Your logo and colour on emails, invoices and the booking page. Included on every plan."
      banner={canEdit ? null : <ReadOnlyNotice />}
    >
      <SettingsSection
        id="branding-logo"
        title="Logo"
        help="PNG or JPEG, up to 1 MB. Uploads save straight away; a hosted link saves with the page."
      >
        <BrandingLogoField
          logoUrl={logoValid ? logoUrl : ""}
          onChange={(next) => {
            setLogoUrl(next);
            // An upload is already stored by the API; only a typed link is a draft.
          }}
          disabled={!canEdit}
        />
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline">
            Use an image hosted elsewhere instead
          </summary>
          <div className="mt-2 grid gap-1.5">
            <Label htmlFor="branding-logo-url">Logo URL</Label>
            <Input
              id="branding-logo-url"
              value={logoUrl}
              disabled={!canEdit}
              aria-invalid={!logoValid ? true : undefined}
              onChange={(e) => {
                setLogoUrl(e.target.value);
                setDirty(true);
              }}
            />
            <p className={cn("text-xs", logoValid ? "text-muted-foreground" : "text-destructive")}>
              {logoValid
                ? "Must be a public https link — email apps cannot load private files."
                : "Must start with https://"}
            </p>
          </div>
        </details>
      </SettingsSection>

      <SettingsSection
        id="branding-accent"
        title="Accent colour"
        help="Buttons and highlights in your emails and on your booking page. Leave blank for RECAVO's teal."
      >
        <div className="grid gap-1.5">
          <Label htmlFor="branding-accent">Accent colour</Label>
          <div className="flex items-center gap-3">
            <Input
              id="branding-accent"
              value={accentColour}
              placeholder={DEFAULT_ACCENT}
              disabled={!canEdit}
              aria-invalid={!accentValid ? true : undefined}
              className="max-w-xs"
              onChange={(e) => {
                setAccentColour(e.target.value);
                setDirty(true);
              }}
            />
            <input
              type="color"
              aria-label="Pick accent colour"
              value={accent}
              disabled={!canEdit}
              onChange={(event) => {
                setAccentColour(event.target.value);
                setDirty(true);
              }}
              className="size-10 shrink-0 cursor-pointer rounded-lg border bg-background p-1 disabled:cursor-not-allowed"
            />
          </div>
          <p className={cn("text-xs", accentValid ? "text-muted-foreground" : "text-destructive")}>
            {accentValid ? "A #rrggbb value." : "Must be a #rrggbb value."}
          </p>
        </div>
        <div className="rounded-[14px] border bg-card p-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">Email preview</p>
          {logoValid && logoUrl ? (
            <img src={logoUrl} alt="" className="mb-2 h-9 w-auto object-contain" />
          ) : (
            <p className="mb-2 text-[17px] font-extrabold uppercase tracking-[0.06em]">
              {tenant.business?.tradingName ?? "Your business"}
            </p>
          )}
          <div className="h-[3px] w-11 rounded-sm" style={{ background: accent }} />
          <p className="mt-4 text-base font-bold">Your sessions are ready</p>
          <button
            type="button"
            disabled
            className="mt-3 rounded-[10px] px-6 py-3 text-sm font-semibold text-white"
            style={{ background: accent }}
          >
            Book your sessions
          </button>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
