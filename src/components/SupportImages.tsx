import { useRef, useState } from "react";
import { ImagePlus, Loader2, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { PendingImage } from "@/hooks/use-support-images";
import { SUPPORT_IMAGE_ACCEPT, SUPPORT_MAX_IMAGES } from "@/lib/api/support";
import type { SupportAttachment } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * The strip under a message box: thumbnails of what's been picked (with progress or an
 * error), and an "Add images" button. Presentational; state lives in `useSupportImages`.
 */
export function SupportImagePicker({
  images,
  onAdd,
  onRemove,
  disabled,
  idPrefix = "support-images",
}: {
  images: PendingImage[];
  onAdd: (files: FileList | null) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const full = images.length >= SUPPORT_MAX_IMAGES;

  return (
    <div className="space-y-2">
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Images to send">
          {images.map((img) => (
            <li
              key={img.key}
              className="relative size-20 overflow-hidden rounded-lg border bg-secondary/40"
            >
              <img src={img.previewUrl} alt={img.name} className="size-full object-cover" />
              {img.error ? (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/85 p-1 text-center"
                  title={img.error}
                >
                  <ShieldAlert className="size-4 text-destructive" />
                  <span className="text-[10px] leading-tight font-medium text-destructive">
                    Failed
                  </span>
                </div>
              ) : !img.fileId ? (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-background/60">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${Math.max(img.progress, 4)}%` }}
                  />
                </div>
              ) : null}
              <button
                type="button"
                className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
                onClick={() => onRemove(img.key)}
                disabled={disabled}
                aria-label={`Remove ${img.name}`}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={inputRef}
        id={`${idPrefix}-input`}
        type="file"
        className="sr-only"
        accept={SUPPORT_IMAGE_ACCEPT}
        multiple
        disabled={disabled || full}
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || full}
        onClick={() => inputRef.current?.click()}
        title={full ? `Up to ${SUPPORT_MAX_IMAGES} images` : undefined}
      >
        <ImagePlus className="size-4" />
        {images.length === 0 ? "Add images" : "Add more"}
      </Button>
    </div>
  );
}

/**
 * Images on a message in the thread. Ready ones open full size in a dialog; scanning
 * ones show a spinner (the page polls until they clear); blocked ones say so.
 */
export function SupportAttachmentGallery({
  attachments,
  className,
}: {
  attachments: SupportAttachment[];
  className?: string;
}) {
  const [open, setOpen] = useState<SupportAttachment | null>(null);
  if (attachments.length === 0) return null;

  return (
    <>
      <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Attached images">
        {attachments.map((a) => (
          <li
            key={a.fileId}
            className="relative size-24 overflow-hidden rounded-lg border bg-secondary/40 sm:size-28"
          >
            {a.state === "ready" && a.url ? (
              <button
                type="button"
                className="size-full cursor-zoom-in"
                onClick={() => setOpen(a)}
                aria-label="Open image"
              >
                <img src={a.url} alt="" className="size-full object-cover" loading="lazy" />
              </button>
            ) : a.state === "blocked" ? (
              <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
                <ShieldAlert className="size-4 text-destructive" />
                <span className="text-[11px] leading-tight font-medium text-destructive">
                  Blocked by security scan
                </span>
              </div>
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-[11px]">Scanning…</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(open)} onOpenChange={(next) => (next ? null : setOpen(null))}>
        <DialogContent className="max-w-[min(96vw,1100px)] border-0 bg-transparent p-0 shadow-none [&>button]:bg-background/80 [&>button]:text-foreground">
          <DialogTitle className="sr-only">Image</DialogTitle>
          {open?.url ? (
            <img src={open.url} alt="" className="max-h-[90vh] w-full rounded-xl object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
