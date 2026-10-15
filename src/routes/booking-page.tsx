import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, ImagePlus, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ClientLanding } from "@/components/client/ClientLanding";
import { ClientTheme } from "@/components/client/ClientPage";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui-bits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toastApiError } from "@/lib/api/errors";
import {
  useBookingPage,
  useBusinessId,
  useDiscardBookingPageDraft,
  usePublicBusiness,
  usePublicLocations,
  usePublicPackages,
  usePublicServices,
  usePublicStaff,
  usePublishBookingPage,
  useSlugAvailability,
  useUpdateBookingPageDraft,
  useUpdateBusiness,
  useUploadBookingPageHeader,
  type BookingPageDraftPatch,
} from "@/lib/api/hooks";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  BOOKING_PAGE_THEMES,
  CLIENT_FONTS_HREF,
  HEADER_PRESETS,
  PRESET_URL_PREFIX,
  SECTION_LABELS,
  THEME_SPECS,
  accentRejection,
  effectiveAccent,
  isHexColour,
  presetFromHeaderUrl,
  presetGradient,
  textOnAccent,
  type BookingPageContent,
  type BookingPageSection,
  type BookingPageTheme,
  type HeaderPreset,
} from "@/lib/client-theme";
import { bookingUrlFor } from "@/lib/hosts";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/booking-page")({
  head: () => ({
    meta: [
      { title: "Booking page — RECAVO" },
      {
        name: "description",
        content: "Choose how clients see your business when they book online.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <BookingPageEditor />
      </AppShell>
    </RequireAuth>
  ),
});

/* ------------------------------------------------------------------ draft */

function applyPatch(base: BookingPageContent, patch: BookingPageDraftPatch): BookingPageContent {
  return {
    ...base,
    ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
    ...(patch.headerImageUrl !== undefined ? { headerImageUrl: patch.headerImageUrl } : {}),
    ...(patch.headerFocalPoint !== undefined ? { headerFocalPoint: patch.headerFocalPoint } : {}),
    ...(patch.accentColour !== undefined ? { accentColour: patch.accentColour } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.about !== undefined ? { about: patch.about } : {}),
    ...(patch.sections !== undefined ? { sections: patch.sections } : {}),
    ...(patch.reviewsMinStars !== undefined ? { reviewsMinStars: patch.reviewsMinStars } : {}),
    venue: {
      address:
        patch.venue?.address !== undefined ? (patch.venue.address ?? null) : base.venue.address,
      parkingNote:
        patch.venue?.parkingNote !== undefined
          ? (patch.venue.parkingNote ?? null)
          : base.venue.parkingNote,
    },
  };
}

/** Drops the keys of `sent` from `pending` unless they were edited again meanwhile. */
function stripSent(pending: BookingPageDraftPatch, sent: BookingPageDraftPatch) {
  const next: Record<string, unknown> = { ...pending };
  for (const key of Object.keys(sent) as (keyof BookingPageDraftPatch)[]) {
    if (pending[key] === sent[key]) delete next[key];
  }
  return next as BookingPageDraftPatch;
}

/**
 * Edits land on screen immediately and reach the API a moment later, so typing
 * in a text field does not fire a request per keystroke. Whatever is still
 * unsaved is layered over the server's draft to produce what the preview shows.
 */
function useDraftEditor(server: BookingPageContent | undefined) {
  const save = useUpdateBookingPageDraft();
  const mutate = save.mutate;
  const [pending, setPending] = useState<BookingPageDraftPatch>({});
  const pendingCount = Object.keys(pending).length;

  const local = useMemo(() => (server ? applyPatch(server, pending) : null), [server, pending]);

  const edit = useCallback((patch: BookingPageDraftPatch) => {
    setPending((p) => ({
      ...p,
      ...patch,
      ...(patch.venue ? { venue: { ...p.venue, ...patch.venue } } : {}),
    }));
  }, []);

  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = setTimeout(() => {
      const sent = pending;
      mutate(sent, {
        onSuccess: () => setPending((p) => stripSent(p, sent)),
        onError: (err) => {
          toastApiError(err, "Couldn't save that change");
          setPending((p) => stripSent(p, sent));
        },
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [pending, pendingCount, mutate]);

  return { local, edit, unsaved: pendingCount > 0 || save.isPending };
}

function contentEqual(a: BookingPageContent, b: BookingPageContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ------------------------------------------------------------------- page */

function BookingPageEditor() {
  const tenant = useTenant();
  const businessId = useBusinessId();
  const bookingPage = useBookingPage();
  const publish = usePublishBookingPage();
  const discard = useDiscardBookingPageDraft();
  const { local, edit, unsaved } = useDraftEditor(bookingPage.data?.draft);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);

  useEffect(() => {
    if (document.querySelector(`link[href="${CLIENT_FONTS_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CLIENT_FONTS_HREF;
    document.head.appendChild(link);
  }, []);

  const business = tenant.business;
  const name = business?.tradingName ?? "your business";
  const dirty =
    local && bookingPage.data ? unsaved || !contentEqual(local, bookingPage.data.published) : false;
  const liveUrl = business ? bookingUrlFor(business.slug) : "";

  return (
    <Can
      permission={PERMISSIONS.BUSINESS_READ}
      fallback={
        <EmptyState
          title="The booking page is restricted"
          description="Ask a business owner to grant you access to this workspace."
        />
      }
    >
      <PageHeader
        title="Booking page"
        description={`Choose how clients see ${name} when they book.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Live
            </span>
            {liveUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={liveUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> View booking page
                </a>
              </Button>
            ) : null}
          </div>
        }
      />

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 rounded-xl border bg-card px-4 py-3">
          <p className="mr-auto text-sm text-muted-foreground">
            {dirty
              ? unsaved
                ? "Saving your changes…"
                : "You have unpublished changes"
              : "Everything here is what clients see"}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!dirty || unsaved || discard.isPending}
            onClick={() => setConfirmDiscard(true)}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty || unsaved || publish.isPending}
            onClick={() =>
              publish.mutate(undefined, {
                onSuccess: () => toast.success("Published. Clients see the new page now."),
              })
            }
          >
            {publish.isPending ? "Publishing…" : "Publish changes"}
          </Button>
        </div>
      ) : null}

      {bookingPage.isLoading || !local ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="h-80 animate-pulse rounded-xl bg-muted" />
          <div className="h-[600px] animate-pulse rounded-xl bg-muted" />
        </div>
      ) : (
        <div
          className={cn(
            "mt-6 grid gap-6",
            device === "phone"
              ? "lg:grid-cols-[minmax(0,1fr)_380px]"
              : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]",
          )}
        >
          <Tabs defaultValue="design" className="min-w-0">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
              {(
                [
                  ["design", "Design"],
                  ["content", "Content"],
                  ["sections", "Sections"],
                  ["link", "Link and sharing"],
                ] as const
              ).map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="design" className="mt-4 space-y-4">
              <DesignTab page={local} edit={edit} disabled={!canEdit} />
            </TabsContent>
            <TabsContent value="content" className="mt-4 space-y-4">
              <ContentTab page={local} edit={edit} disabled={!canEdit} />
            </TabsContent>
            <TabsContent value="sections" className="mt-4 space-y-4">
              <SectionsTab page={local} edit={edit} disabled={!canEdit} />
            </TabsContent>
            <TabsContent value="link" className="mt-4 space-y-4">
              <LinkTab disabled={!canEdit} />
            </TabsContent>
          </Tabs>

          <LivePreview
            businessId={businessId}
            page={local}
            device={device}
            onDevice={setDevice}
            cancellationWindowHours={24}
          />
        </div>
      )}

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your unpublished changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The page goes back to what clients see today. Anything you changed since the last
              publish is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                discard.mutate(undefined, {
                  onSuccess: () => toast.success("Changes discarded"),
                })
              }
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Can>
  );
}

/* ------------------------------------------------------------------ design */

type TabProps = {
  page: BookingPageContent;
  edit: (patch: BookingPageDraftPatch) => void;
  disabled: boolean;
};

const ACCENT_SWATCHES = ["#111214", "#3b5bdb", "#c2642e", "#9c3b8a"] as const;

function DesignTab({ page, edit, disabled }: TabProps) {
  const upload = useUploadBookingPageHeader();
  const fileRef = useRef<HTMLInputElement>(null);
  const [customHex, setCustomHex] = useState(
    page.accentColour && !(ACCENT_SWATCHES as readonly string[]).includes(page.accentColour)
      ? page.accentColour
      : "",
  );
  const customError = customHex && isHexColour(customHex) ? accentRejection(customHex) : null;
  const preset = presetFromHeaderUrl(page.headerImageUrl);
  const customImage = page.headerImageUrl && !preset ? page.headerImageUrl : null;
  const accent = effectiveAccent(page);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("That image is over 5 MB. Try a smaller one.");
      return;
    }
    upload.mutate(file, {
      onSuccess: () => toast.success("Header image uploaded"),
      onError: (err) => toastApiError(err, "Couldn't upload that image"),
    });
  };

  return (
    <>
      <SectionCard title="Theme" description="Sets the fonts, background and shape of your page.">
        <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          {BOOKING_PAGE_THEMES.map((theme) => (
            <ThemeCard
              key={theme}
              theme={theme}
              selected={page.theme === theme}
              disabled={disabled}
              onSelect={() => edit({ theme })}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Header image"
        description="A photo of your space, or one of our soft gradients."
        action={
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={disabled || upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              {upload.isPending ? "Uploading…" : "Upload your own"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
          {customImage ? (
            <HeaderTile
              label="Your photo"
              selected
              disabled={disabled}
              style={{
                backgroundImage: `url("${customImage}")`,
                backgroundSize: "cover",
                backgroundPosition: `${page.headerFocalPoint.x}% ${page.headerFocalPoint.y}%`,
              }}
              onSelect={() => undefined}
            />
          ) : null}
          {HEADER_PRESETS.map((p) => (
            <HeaderTile
              key={p}
              label={PRESET_LABELS[p]}
              selected={preset === p || (!page.headerImageUrl && p === defaultPreset(page.theme))}
              disabled={disabled}
              style={{ backgroundImage: presetGradient(p) }}
              onSelect={() => edit({ headerImageUrl: `${PRESET_URL_PREFIX}${p}` })}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Button colour"
        description="Used for your Book buttons only, so your page stays clean."
      >
        <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setCustomHex("");
              edit({ accentColour: null });
            }}
            className="flex items-center gap-2 text-left"
          >
            <Swatch colour={THEME_SPECS[page.theme].accent} selected={page.accentColour === null} />
            <span className="text-xs leading-tight text-muted-foreground">
              Matches
              <br />
              your theme
            </span>
          </button>
          {ACCENT_SWATCHES.map((colour) => (
            <button
              key={colour}
              type="button"
              disabled={disabled}
              aria-label={`Use ${colour}`}
              onClick={() => {
                setCustomHex("");
                edit({ accentColour: colour });
              }}
            >
              <Swatch colour={colour} selected={page.accentColour === colour} />
            </button>
          ))}
          <div className="flex items-center gap-2">
            <label
              className="relative size-9 cursor-pointer overflow-hidden rounded-full border"
              style={{ backgroundColor: isHexColour(customHex) ? customHex : "#ffffff" }}
              aria-label="Pick a custom colour"
            >
              <input
                type="color"
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                disabled={disabled}
                value={isHexColour(customHex) ? customHex : accent}
                onChange={(e) => {
                  const value = e.target.value.toLowerCase();
                  setCustomHex(value);
                  if (!accentRejection(value)) edit({ accentColour: value });
                }}
              />
              {!isHexColour(customHex) ? (
                <span className="absolute inset-0 bg-[conic-gradient(from_0deg,#f87171,#fbbf24,#34d399,#60a5fa,#a78bfa,#f87171)] opacity-80" />
              ) : null}
            </label>
            <Input
              value={customHex}
              disabled={disabled}
              placeholder="#2d7a5f"
              className="h-9 w-28 font-mono text-sm"
              onChange={(e) => {
                const value = e.target.value.trim().toLowerCase();
                setCustomHex(value);
                if (isHexColour(value) && !accentRejection(value)) edit({ accentColour: value });
              }}
            />
          </div>
        </div>
        {customError ? (
          <p className="px-4 pb-4 text-sm text-destructive sm:px-5">{customError}</p>
        ) : null}
      </SectionCard>
    </>
  );
}

const PRESET_LABELS: Record<HeaderPreset, string> = {
  dawn: "Dawn",
  mist: "Mist",
  dusk: "Dusk",
  stone: "Stone",
};

function defaultPreset(theme: BookingPageTheme): HeaderPreset {
  return theme === "night" ? "dusk" : theme === "editorial" ? "stone" : "dawn";
}

function ThemeCard({
  theme,
  selected,
  disabled,
  onSelect,
}: {
  theme: BookingPageTheme;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const spec = THEME_SPECS[theme];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "overflow-hidden rounded-xl border-2 text-left transition-colors",
        selected ? "border-primary" : "border-border hover:border-foreground/30",
      )}
    >
      <div
        className="flex h-16 items-center justify-center text-2xl font-semibold"
        style={{
          background: spec.background,
          color: spec.text,
          fontFamily: spec.fontDisplay,
          borderRadius: `${Math.min(spec.radius, 10)}px ${Math.min(spec.radius, 10)}px 0 0`,
        }}
      >
        Aa
      </div>
      <div className="px-3 py-2">
        <p className="text-sm font-semibold">{spec.label}</p>
        <p className="text-xs text-muted-foreground">{spec.strap}</p>
      </div>
    </button>
  );
}

function HeaderTile({
  label,
  selected,
  disabled,
  style,
  onSelect,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  style: CSSProperties;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={cn(
        "h-16 rounded-xl border-2 transition-colors",
        selected ? "border-primary ring-2 ring-primary/30" : "border-transparent",
      )}
      style={style}
    />
  );
}

function Swatch({ colour, selected }: { colour: string; selected: boolean }) {
  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-full border transition-shadow",
        selected && "ring-2 ring-offset-2 ring-offset-background",
      )}
      style={{
        backgroundColor: colour,
        color: textOnAccent(colour),
        ...(selected ? { ["--tw-ring-color" as string]: colour } : {}),
      }}
    >
      {selected ? <Check className="size-4" /> : null}
    </span>
  );
}

/* ----------------------------------------------------------------- content */

function ContentTab({ page, edit, disabled }: TabProps) {
  return (
    <>
      <SectionCard title="Headline" description="Shown under your name at the top of the page.">
        <div className="grid gap-2 p-4 sm:p-5">
          <Label htmlFor="bp-description">One line about you</Label>
          <Input
            id="bp-description"
            value={page.description ?? ""}
            disabled={disabled}
            maxLength={120}
            placeholder="Personal training in Leeds"
            onChange={(e) => edit({ description: e.target.value || null })}
          />
        </div>
      </SectionCard>
      <SectionCard
        title="About"
        description="A few sentences about your business. Turn the section on or off under Sections."
      >
        <div className="grid gap-2 p-4 sm:p-5">
          <Label htmlFor="bp-about">About {page.description ? "" : "you"}</Label>
          <Textarea
            id="bp-about"
            rows={5}
            value={page.about ?? ""}
            disabled={disabled}
            maxLength={2000}
            placeholder="Small-group strength coaching for people who want to get stronger without living in the gym…"
            onChange={(e) => edit({ about: e.target.value || null })}
          />
        </div>
      </SectionCard>
      <SectionCard
        title="Venue"
        description="Where clients come to see you. Leave the address blank to use your main location."
      >
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-2">
            <Label htmlFor="bp-address">Address</Label>
            <Input
              id="bp-address"
              value={page.venue.address ?? ""}
              disabled={disabled}
              maxLength={240}
              placeholder="12 Mill Street, Leeds LS1 4AB"
              onChange={(e) => edit({ venue: { address: e.target.value || null } })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bp-parking">Parking and how to find you</Label>
            <Textarea
              id="bp-parking"
              rows={3}
              value={page.venue.parkingNote ?? ""}
              disabled={disabled}
              maxLength={400}
              placeholder="Free parking on Mill Street after 6pm. We're the blue door next to the bakery."
              onChange={(e) => edit({ venue: { parkingNote: e.target.value || null } })}
            />
          </div>
        </div>
      </SectionCard>
    </>
  );
}

/* ---------------------------------------------------------------- sections */

function SectionsTab({ page, edit, disabled }: TabProps) {
  const move = (index: number, delta: -1 | 1) => {
    const next: BookingPageSection[] = [...page.sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    edit({ sections: next });
  };
  const toggle = (index: number, enabled: boolean) => {
    edit({
      sections: page.sections.map((s, i) => (i === index ? { ...s, enabled } : s)),
    });
  };
  const reviewsOn = page.sections.some((s) => s.key === "reviews" && s.enabled);

  return (
    <>
      <SectionCard
        title="Sections"
        description="What appears under your sessions, in this order. Sessions and the Book button are always shown."
      >
        <ul className="divide-y">
          {page.sections.map((section, index) => {
            const meta = SECTION_LABELS[section.key];
            const comingSoon = section.key === "gallery";
            return (
              <li key={section.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={disabled || index === 0}
                    aria-label={`Move ${meta.title} up`}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={disabled || index === page.sections.length - 1}
                    aria-label={`Move ${meta.title} down`}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{meta.title}</p>
                  <p className="text-xs text-muted-foreground">{meta.hint}</p>
                </div>
                <Switch
                  checked={section.enabled && !comingSoon}
                  disabled={disabled || comingSoon}
                  onCheckedChange={(checked) => toggle(index, checked)}
                  aria-label={`Show ${meta.title}`}
                />
              </li>
            );
          })}
        </ul>
      </SectionCard>
      {reviewsOn ? (
        <SectionCard
          title="Reviews"
          description="Reviews come from your Google Business Profile once it is connected. Until then the section is hidden from clients."
        >
          <div className="flex flex-wrap items-center gap-2 p-4 sm:p-5">
            <span className="mr-2 text-sm">Show reviews rated</span>
            {(
              [
                [0, "Any"],
                [4, "4 stars and up"],
                [5, "5 stars only"],
              ] as const
            ).map(([stars, label]) => (
              <button
                key={stars}
                type="button"
                disabled={disabled}
                onClick={() => edit({ reviewsMinStars: stars })}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  page.reviewsMinStars === stars
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-secondary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------- link */

/** Mirrors the server's slugify so the field never promises a link the API would rewrite. */
function slugifyPreview(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function copyText(value: string, success: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(success);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it yourself.");
  }
}

function LinkTab({ disabled }: { disabled: boolean }) {
  const tenant = useTenant();
  const business = tenant.business;
  const update = useUpdateBusiness();
  const [slug, setSlug] = useState(business?.slug ?? "");

  useEffect(() => {
    setSlug(business?.slug ?? "");
  }, [business?.slug]);

  const normalised = slugifyPreview(slug);
  const changed = Boolean(business) && normalised !== business?.slug;
  const availability = useSlugAvailability(changed ? normalised : undefined);
  const savedUrl = business ? bookingUrlFor(business.slug) : "";
  const previewUrl = normalised ? bookingUrlFor(normalised) : savedUrl;
  const canSave =
    changed && normalised.length >= 3 && availability.data?.available === true && !update.isPending;

  const share = async () => {
    const nav = navigator;
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: business?.tradingName, url: savedUrl });
        return;
      } catch {
        /* dismissed */
      }
    }
    await copyText(savedUrl, "Booking link copied");
  };

  if (!business) return null;

  return (
    <>
      <SectionCard
        title="Your booking link"
        description="This is the link on your website, Instagram and cards. Old links keep working and redirect."
      >
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-2">
            <Label htmlFor="bp-slug">Short link</Label>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {savedUrl.replace(/^https?:\/\//, "").replace(/\/[^/]*$/, "/")}
              </span>
              <Input
                id="bp-slug"
                value={slug}
                disabled={disabled}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={business.slug}
                className="max-w-xs"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {previewUrl.replace(/^https?:\/\//, "")}
            </p>
            {changed && normalised.length < 3 ? (
              <p className="text-sm text-destructive">Use at least 3 letters or numbers.</p>
            ) : changed && availability.isFetching ? (
              <p className="text-sm text-muted-foreground">Checking…</p>
            ) : changed && availability.data ? (
              availability.data.available ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-300">Available</p>
              ) : (
                <p className="text-sm text-destructive">
                  {availability.data.reason === "reserved"
                    ? "That word is reserved."
                    : "Someone else already has that link."}
                </p>
              )
            ) : null}
          </div>
          <Can permission={PERMISSIONS.BUSINESS_UPDATE}>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!canSave}
                onClick={async () => {
                  try {
                    await update.mutateAsync({
                      version: business.version,
                      body: { slug: normalised },
                    });
                    toast.success("Booking link updated. The old one redirects here.");
                  } catch {
                    /* toasted by the hook */
                  }
                }}
              >
                {update.isPending ? "Saving…" : "Save link"}
              </Button>
              {changed ? (
                <Button type="button" variant="ghost" onClick={() => setSlug(business.slug)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </Can>
        </div>
      </SectionCard>

      <SectionCard title="Share it" description="Put the link wherever clients already find you.">
        <div className="flex flex-wrap gap-2 p-4 sm:p-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyText(savedUrl, "Booking link copied")}
          >
            <Copy className="size-4" /> Copy link
          </Button>
          <Button type="button" variant="outline" onClick={() => void share()}>
            <Share2 className="size-4" /> Share
          </Button>
          <Button asChild variant="outline">
            <a href={savedUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> Open booking page
            </a>
          </Button>
        </div>
      </SectionCard>
    </>
  );
}

/* ----------------------------------------------------------------- preview */

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const DESKTOP_CANVAS = 1120;

function LivePreview({
  businessId,
  page,
  device,
  onDevice,
  cancellationWindowHours,
}: {
  businessId: string;
  page: BookingPageContent;
  device: "phone" | "desktop";
  onDevice: (device: "phone" | "desktop") => void;
  cancellationWindowHours: number;
}) {
  const business = usePublicBusiness(businessId, "id");
  const services = usePublicServices(businessId);
  const packages = usePublicPackages(businessId);
  const staff = usePublicStaff(businessId);
  const locations = usePublicLocations(businessId);
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const scale = device === "desktop" && width > 0 ? Math.min(1, width / DESKTOP_CANVAS) : 1;

  const noop = () => undefined;
  const content = business.data ? (
    <ClientTheme page={page} scope="element">
      <div className="pb-6">
        <ClientLanding
          preview
          business={business.data}
          page={page}
          services={services.data ?? []}
          packages={packages.data?.packages ?? []}
          staff={staff.data ?? []}
          locations={locations.data ?? []}
          nextAvailable={null}
          onPickService={noop}
          onPickPackage={noop}
          onBookNow={noop}
          onSignIn={noop}
          cancellationWindowHours={business.data.cancellationWindowHours ?? cancellationWindowHours}
        />
      </div>
    </ClientTheme>
  ) : (
    <div className="h-full animate-pulse bg-muted" />
  );

  return (
    <div className="rounded-xl border bg-secondary/40 p-4 lg:sticky lg:top-20 lg:self-start">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Live preview</p>
        <div className="flex rounded-full bg-background p-0.5 shadow-sm">
          {(["phone", "desktop"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDevice(d)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold capitalize",
                device === d ? "bg-foreground text-background" : "text-muted-foreground",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      {device === "phone" ? (
        <div className="mx-auto w-[312px] rounded-[40px] border-[8px] border-[#111214] bg-[#111214] shadow-xl">
          <div className="no-scrollbar h-[620px] overflow-y-auto overflow-x-hidden rounded-[32px]">
            {content}
          </div>
        </div>
      ) : (
        <div ref={ref} className="overflow-hidden rounded-xl border bg-background shadow-xl">
          <div className="flex items-center gap-1.5 border-b bg-secondary px-3 py-2">
            <span className="size-2.5 rounded-full bg-red-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-emerald-400" />
          </div>
          <div style={{ height: 640 * scale }} className="overflow-hidden">
            <div
              className="no-scrollbar origin-top-left overflow-y-auto overflow-x-hidden"
              style={{ width: DESKTOP_CANVAS, height: 640, transform: `scale(${scale})` }}
            >
              {content}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
