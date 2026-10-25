import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { OptionCards, TeamAvatar } from "@/components/team/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsPhone } from "@/hooks/use-media-query";
import { useUpdateStaff } from "@/lib/api/hooks";
import { describeApiError, ApiError } from "@/lib/api/errors";
import type { Staff } from "@/lib/api/types";
import { useRemoveStaffPhoto, useSetStaffPhoto } from "@/lib/api/team";
import { HEX_COLOUR } from "@/lib/payment-colours";
import { firstName, PALETTE } from "@/lib/team";
import { cn } from "@/lib/utils";

const BIO_MAX = 500;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CROP_BOX = 220;
const OUTPUT = 512;

type Crop = { src: string; img: HTMLImageElement; zoom: number; x: number; y: number };

/** The crop as a square JPEG: the circle is drawn by the app, so corners don't matter. */
function renderCrop(crop: Crop): Promise<Blob> {
  const { img, zoom, x, y } = crop;
  const base = CROP_BOX / Math.min(img.naturalWidth, img.naturalHeight);
  const scale = base * zoom;
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d")!;
  const ratio = OUTPUT / CROP_BOX;
  const w = img.naturalWidth * scale * ratio;
  const h = img.naturalHeight * scale * ratio;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, OUTPUT, OUTPUT);
  ctx.drawImage(img, OUTPUT / 2 - w / 2 + x * ratio, OUTPUT / 2 - h / 2 + y * ratio, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("crop"))), "image/jpeg", 0.88),
  );
}

function PhotoField({ person, disabled }: { person: Staff; disabled: boolean }) {
  const setPhoto = useSetStaffPhoto();
  const removePhoto = useRemoveStaffPhoto();
  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => (crop ? URL.revokeObjectURL(crop.src) : undefined), [crop]);

  const pick = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return setError("Use a JPEG, PNG or WebP photo.");
    if (file.size > PHOTO_MAX_BYTES) return setError("That photo is over 5 MB.");
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setCrop({ src, img, zoom: 1, x: 0, y: 0 });
    img.onerror = () => setError("That photo couldn't be opened.");
    img.src = src;
  };

  const use = async () => {
    if (!crop) return;
    try {
      const blob = await renderCrop(crop);
      await setPhoto.mutateAsync({ staffId: person.id, file: blob });
      toast.success("Photo saved");
      setCrop(null);
    } catch (err) {
      setError(describeApiError(err, "Couldn't save the photo."));
    }
  };

  if (crop) {
    const base = CROP_BOX / Math.min(crop.img.naturalWidth, crop.img.naturalHeight);
    const w = crop.img.naturalWidth * base * crop.zoom;
    const h = crop.img.naturalHeight * base * crop.zoom;
    return (
      <div className="grid justify-items-center gap-3">
        <div
          className="relative touch-none overflow-hidden rounded-full bg-secondary select-none"
          style={{ width: CROP_BOX, height: CROP_BOX, cursor: "grab" }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX - crop.x, y: e.clientY - crop.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setCrop({ ...crop, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
          }}
          onPointerUp={() => (drag.current = null)}
          aria-label="Drag to move the photo"
          role="img"
        >
          <img
            src={crop.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{
              width: w,
              height: h,
              left: CROP_BOX / 2 - w / 2 + crop.x,
              top: CROP_BOX / 2 - h / 2 + crop.y,
            }}
          />
        </div>
        <label className="grid w-full max-w-[260px] gap-1.5 text-xs font-semibold text-muted-foreground">
          Zoom
          <Slider
            min={1}
            max={3}
            step={0.05}
            value={[crop.zoom]}
            onValueChange={([z]) => setCrop({ ...crop, zoom: z ?? 1 })}
            aria-label="Zoom"
          />
        </label>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => setCrop(null)}>
            Cancel
          </Button>
          <Button type="button" disabled={setPhoto.isPending} onClick={() => void use()}>
            {setPhoto.isPending ? "Saving…" : "Use photo"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <TeamAvatar
        name={person.displayName}
        photoUrl={person.photoUrl}
        colour={person.calendarColour}
        size={56}
      />
      <div className="grid gap-1.5">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <ImagePlus className="size-4" /> {person.photoUrl ? "Change photo" : "Add photo"}
          </Button>
          {person.photoUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || removePhoto.isPending}
              onClick={() =>
                void removePhoto
                  .mutateAsync(person.id)
                  .then(() => toast.success("Photo removed"))
                  .catch((err) => setError(describeApiError(err, "Couldn't remove the photo.")))
              }
            >
              <Trash2 className="size-4" /> Remove
            </Button>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 5 MB.</span>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
      <input
        ref={input}
        type="file"
        accept={PHOTO_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Twelve presets plus a custom hex. */
function ColourField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const custom = value && !PALETTE.includes(value.toLowerCase() as (typeof PALETTE)[number]);
  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold">Colour</span>
      <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
        {PALETTE.map((c) => {
          const on = value.toLowerCase() === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c}
              onClick={() => onChange(c)}
              className={cn(
                "flex size-8 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow max-sm:size-10",
                on && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: c }}
            >
              {on ? <Check className="size-4 text-white" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Custom colour"
          value={HEX_COLOUR.test(value) ? value : "#64748b"}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "size-9 shrink-0 cursor-pointer rounded-lg border bg-background p-1",
            custom && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
          )}
        />
        <Input
          value={value}
          placeholder="#2563eb"
          aria-label="Colour hex"
          aria-invalid={Boolean(value) && !HEX_COLOUR.test(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-32"
        />
      </div>
    </div>
  );
}

/** Name, title, photo, bio, colour, booking page visibility and whether they take bookings. */
export function EditProfileDrawer({
  open,
  onOpenChange,
  person,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Staff;
}) {
  const phone = useIsPhone();
  const update = useUpdateStaff();
  const [name, setName] = useState(person.displayName);
  const [title, setTitle] = useState(person.title ?? "");
  const [bio, setBio] = useState(person.bio ?? "");
  const [colour, setColour] = useState(person.calendarColour ?? "");
  const [visible, setVisible] = useState(person.bookingVisible);
  const [bookable, setBookable] = useState<"yes" | "no">(person.bookable === false ? "no" : "yes");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(person.displayName);
    setTitle(person.title ?? "");
    setBio(person.bio ?? "");
    setColour(person.calendarColour ?? "");
    setVisible(person.bookingVisible);
    setBookable(person.bookable === false ? "no" : "yes");
    setError(null);
    // Re-seed when opened or when someone else saved the person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person.id, person.version]);

  const nameError = !name.trim() ? "Give them a name." : null;
  const colourError = colour && !HEX_COLOUR.test(colour) ? "Use a #rrggbb colour." : null;
  const first = firstName(name.trim() || person.displayName);

  const save = async () => {
    if (nameError || colourError) return;
    setError(null);
    try {
      await update.mutateAsync({
        staffId: person.id,
        version: person.version,
        body: {
          displayName: name.trim(),
          title: title.trim() || null,
          bio: bio.trim() || null,
          calendarColour: colour || null,
          bookingVisible: visible,
          bookable: bookable === "yes",
        },
      });
      toast.success("Profile saved");
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.isConflict
          ? "Someone else just changed this person. Close and try again."
          : describeApiError(err, "Couldn't save the profile."),
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          phone ? "inset-0 h-dvh rounded-none" : "sm:max-w-[480px]",
        )}
      >
        <SheetHeader className="border-b px-4 pt-6 pb-4 text-left sm:px-6">
          <SheetTitle className="text-xl font-extrabold">Edit profile</SheetTitle>
          <SheetDescription>{person.displayName}</SheetDescription>
        </SheetHeader>
        <form
          id="edit-profile-form"
          className="no-scrollbar grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 py-5 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <PhotoField person={person} disabled={update.isPending} />
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <label className="grid gap-1.5 text-sm font-semibold">
              Name *
              <Input
                value={name}
                maxLength={120}
                aria-invalid={Boolean(nameError)}
                onChange={(e) => setName(e.target.value)}
              />
              {nameError ? (
                <span className="text-xs font-normal text-destructive">{nameError}</span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>
                Job title <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-semibold">
            <span>
              Bio <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <Textarea
              rows={3}
              value={bio}
              maxLength={BIO_MAX}
              onChange={(e) => setBio(e.target.value)}
            />
            <span className="text-xs font-normal text-muted-foreground">
              {bio.length} of {BIO_MAX}
            </span>
          </label>
          <ColourField value={colour} onChange={setColour} />
          {colourError ? <p className="-mt-3 text-xs text-destructive">{colourError}</p> : null}
          <OptionCards
            label={`Can clients book ${first}?`}
            value={bookable}
            onChange={setBookable}
            options={[
              { value: "yes", title: "Yes", help: "Has a diary, hours and services" },
              { value: "no", title: "No", help: "Doesn't do the work, e.g. reception" },
            ]}
          />
          {bookable === "yes" ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <span className="grid gap-0.5">
                <span id="profile-visible" className="text-sm font-semibold">
                  Clients can choose {first}
                </span>
                <span className="text-xs text-muted-foreground">
                  Off still lets staff book {first} in.
                </span>
              </span>
              <Switch
                aria-labelledby="profile-visible"
                checked={visible}
                onCheckedChange={setVisible}
              />
            </div>
          ) : null}
        </form>
        <footer className="flex items-center justify-end gap-2 border-t px-4 py-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-profile-form"
            disabled={update.isPending || Boolean(nameError || colourError)}
            className={cn(phone && "h-12 flex-1")}
          >
            {update.isPending ? "Saving…" : "Save profile"}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
