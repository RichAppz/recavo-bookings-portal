import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, ShieldAlert, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui-bits";
import { ApiError, queryKeys } from "@/lib/api";
import {
  uploadFileViaIntent,
  useBusinessId,
  useDeleteFile,
  useFileDownloadUrl,
  useFileViewUrl,
  useOwnerFiles,
  usePlanFeature,
  type FileOwner,
} from "@/lib/api/hooks";
import type { FileResource, LinkedRecord } from "@/lib/api/types";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { toast } from "sonner";

/** Matches the API's default upload allow-list for images (ADR 0010). */
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Photo gallery for a linked record (vehicle images, RECA-524). Uploads go through
 * the signed-intent flow with `ownerType: linked_record`; the API gates that behind
 * the `custom_records.images` plan feature (Business/Growth), so Solo businesses see
 * an upgrade prompt instead of the uploader.
 */
export function LinkedRecordPhotosDialog({
  record,
  term,
  onOpenChange,
}: {
  record: LinkedRecord | null;
  term: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Photos — {record?.displayLabel}</DialogTitle>
          <DialogDescription>
            Photos saved against this {term.toLowerCase()} — condition on arrival, before and after
            shots, damage notes.
          </DialogDescription>
        </DialogHeader>
        {record ? <PhotosPanel record={record} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PhotosPanel({ record }: { record: LinkedRecord }) {
  const tenant = useTenant();
  const businessId = useBusinessId();
  const qc = useQueryClient();
  const canManage = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const hasImagesFeature = usePlanFeature("custom_records.images");

  const owner: FileOwner = { ownerType: "linked_record", ownerId: record.id };
  const files = useOwnerFiles(hasImagesFeature ? owner : undefined);
  const deleteFile = useDeleteFile(owner);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    const picked = Array.from(fileList ?? []);
    if (picked.length === 0 || !businessId) return;

    const tooBig = picked.find((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig) {
      setUploadError(`"${tooBig.name}" is too large — photos can be up to 10 MB.`);
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      for (const file of picked) {
        await uploadFileViaIntent(businessId, file, owner);
      }
      toast.success(picked.length === 1 ? "Photo uploaded" : `${picked.length} photos uploaded`, {
        description: "Each photo is scanned before it appears.",
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setUploadError("Photos aren't available on your current plan.");
      } else if (err instanceof ApiError) {
        setUploadError(err.detail || err.title);
      } else {
        setUploadError(err instanceof Error ? err.message : "Upload failed.");
      }
    } finally {
      setUploading(false);
      void qc.invalidateQueries({
        queryKey: queryKeys.ownerFiles(businessId, owner.ownerType, owner.ownerId),
      });
    }
  };

  // Subscription still loading — don't flash the upsell at people who have the feature.
  if (hasImagesFeature === undefined) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!hasImagesFeature) {
    return (
      <EmptyState
        icon={<Sparkles className="size-6" />}
        title="Photos are a Business plan feature"
        description="Upgrade to the Business or Growth plan to attach photos to your records."
        action={
          <Button asChild>
            <Link to="/settings" search={{ tab: "billing" }}>
              View plans
            </Link>
          </Button>
        }
      />
    );
  }

  const items = files.data ?? [];

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            JPEG, PNG or WebP, up to 10 MB each. Scanned before they appear.
          </p>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={IMAGE_ACCEPT}
            multiple
            disabled={uploading}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {uploading ? "Uploading…" : "Add photos"}
          </Button>
        </div>
      ) : null}

      {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}

      {files.isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Camera className="size-6" />}
          title="No photos yet"
          description={
            canManage ? "Add the first photo with the button above." : "Nothing has been added yet."
          }
        />
      ) : (
        <div className="grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {items.map((f) => (
            <PhotoTile
              key={f.id}
              file={f}
              canDelete={canManage}
              deleting={deleteFile.isPending && deleteFile.variables === f.id}
              onDelete={() => {
                deleteFile.mutate(f.id, {
                  onSuccess: () => toast.success("Photo removed"),
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoTile({
  file,
  canDelete,
  deleting,
  onDelete,
}: {
  file: FileResource;
  canDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const usable = file.status === "available" && file.scanStatus === "clean";
  const blocked =
    file.scanStatus === "infected" || file.scanStatus === "failed" || file.status === "rejected";
  const viewUrl = useFileViewUrl(file.id, usable);
  const downloadUrl = useFileDownloadUrl();

  const openFull = async () => {
    // Always open with a fresh signed URL — the thumbnail one may be near expiry.
    const result = await downloadUrl.mutateAsync(file.id);
    window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border bg-secondary/40">
      {usable && viewUrl.data ? (
        <button
          type="button"
          className="size-full cursor-zoom-in"
          onClick={() => void openFull()}
          aria-label="Open photo"
        >
          <img
            src={viewUrl.data.downloadUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        </button>
      ) : blocked ? (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 p-3 text-center">
          <ShieldAlert className="size-5 text-destructive" />
          <p className="text-xs font-medium text-destructive">Blocked by security scan</p>
        </div>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 p-3 text-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <p className="text-xs">Scanning…</p>
        </div>
      )}

      {canDelete ? (
        <Button
          size="icon"
          variant="destructive"
          className="absolute top-2 right-2 size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          disabled={deleting}
          onClick={onDelete}
          aria-label="Delete photo"
        >
          {deleting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </Button>
      ) : null}
    </div>
  );
}
