import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useRemoveBrandingLogo, useUploadBrandingLogo } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

const MAX_BYTES = 1024 * 1024;
const ACCEPT = "image/png,image/jpeg";

/** Friendly copy for the API's validation codes on the logo body. */
function uploadErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Upload failed. Try again.";
  const code = err.fieldErrors.find((f) => f.field === "body" || f.field === "(body)")?.code;
  switch (code) {
    case "TOO_LARGE":
      return "That image is over 1 MB. Export a smaller PNG or JPEG and try again.";
    case "NOT_AN_IMAGE":
    case "UNSUPPORTED_MEDIA_TYPE":
      return "Only PNG or JPEG images are supported.";
    case "MALWARE_DETECTED":
      return "That file failed our safety scan and wasn't saved.";
    default:
      break;
  }
  if (err.status === 422) return "Our image scanner is busy — try again in a moment.";
  if (err.status === 409) return "This business is closed, so its branding can't be changed.";
  return err.detail ?? err.title ?? "Upload failed. Try again.";
}

/**
 * Upload / remove the business logo (branding, free on every plan). The API stores
 * and serves the image itself and hands back a cache-busted URL, which the caller
 * keeps in its `logoUrl` state so the preview and any later PATCH stay in step.
 */
export function BrandingLogoField({
  logoUrl,
  onChange,
  disabled,
}: {
  logoUrl: string;
  onChange: (nextUrl: string) => void;
  disabled?: boolean;
}) {
  const upload = useUploadBrandingLogo();
  const remove = useRemoveBrandingLogo();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = upload.isPending || remove.isPending;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("That image is over 1 MB. Export a smaller PNG or JPEG and try again.");
      return;
    }
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setError("Only PNG or JPEG images are supported.");
      return;
    }
    try {
      const configuration = await upload.mutateAsync(file);
      onChange(configuration.branding?.logoUrl ?? "");
      toast.success("Logo updated");
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = async () => {
    setError(null);
    try {
      await remove.mutateAsync();
      onChange("");
      toast.success("Logo removed");
    } catch {
      // Hook toasts the API error.
    }
  };

  return (
    <div className="grid gap-1.5">
      <Label>Logo</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            "flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background",
            !logoUrl && "border-dashed",
          )}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="Business logo" className="max-h-14 max-w-24 object-contain" />
          ) : (
            <ImagePlus className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label="Choose a logo image"
            disabled={disabled || busy}
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            {upload.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Uploading…
              </>
            ) : logoUrl ? (
              "Replace logo"
            ) : (
              "Upload logo"
            )}
          </Button>
          {logoUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              onClick={() => void clear()}
            >
              <Trash2 className="size-4" /> Remove
            </Button>
          ) : null}
        </div>
      </div>
      <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
        {error ?? "PNG or JPEG, up to 1 MB. Shown on your emails, invoices and booking page."}
      </p>
    </div>
  );
}
