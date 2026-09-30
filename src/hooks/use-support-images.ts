import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useBusinessId } from "@/lib/api/hooks";
import {
  SUPPORT_IMAGE_ACCEPT,
  SUPPORT_MAX_IMAGE_BYTES,
  SUPPORT_MAX_IMAGES,
  uploadSupportImage,
} from "@/lib/api/support";

/** One image the user has picked: uploading, uploaded (has `fileId`), or failed. */
export type PendingImage = {
  key: string;
  name: string;
  previewUrl: string;
  progress: number;
  fileId?: string;
  error?: string;
};

const ACCEPTED = new Set(SUPPORT_IMAGE_ACCEPT.split(","));

/**
 * Picks and uploads images for a support message. Uploads start the moment a file is
 * chosen so the send button only has to wait for stragglers; `fileIds` is what goes in
 * the message body. Object URLs are revoked on remove and on unmount.
 */
export function useSupportImages() {
  const businessId = useBusinessId();
  const [images, setImages] = useState<PendingImage[]>([]);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(
    () => () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.previewUrl);
    },
    [],
  );

  const patch = useCallback((key: string, next: Partial<PendingImage>) => {
    setImages((prev) => prev.map((img) => (img.key === key ? { ...img, ...next } : img)));
  }, []);

  const add = useCallback(
    (fileList: FileList | File[] | null): string | null => {
      const picked = Array.from(fileList ?? []);
      if (picked.length === 0 || !businessId) return null;
      const room = SUPPORT_MAX_IMAGES - imagesRef.current.length;
      if (room <= 0) return `You can attach up to ${SUPPORT_MAX_IMAGES} images.`;

      let warning: string | null = null;
      const accepted: File[] = [];
      for (const file of picked) {
        if (!ACCEPTED.has(file.type)) {
          warning = `"${file.name}" isn't a JPEG, PNG, WebP or GIF.`;
          continue;
        }
        if (file.size > SUPPORT_MAX_IMAGE_BYTES) {
          warning = `"${file.name}" is too large — images can be up to 10 MB.`;
          continue;
        }
        if (accepted.length >= room) {
          warning = `You can attach up to ${SUPPORT_MAX_IMAGES} images.`;
          break;
        }
        accepted.push(file);
      }

      const fresh = accepted.map<PendingImage>((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
      }));
      setImages((prev) => [...prev, ...fresh]);

      fresh.forEach((img, i) => {
        const file = accepted[i]!;
        uploadSupportImage(businessId, file, (pct) => patch(img.key, { progress: pct }))
          .then((uploaded) => patch(img.key, { fileId: uploaded.id, progress: 100 }))
          .catch((err: unknown) => {
            patch(img.key, {
              error:
                err instanceof ApiError
                  ? err.detail || err.title
                  : err instanceof Error
                    ? err.message
                    : "Upload failed.",
            });
          });
      });
      return warning;
    },
    [businessId, patch],
  );

  const remove = useCallback((key: string) => {
    setImages((prev) => {
      const gone = prev.find((img) => img.key === key);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((img) => img.key !== key);
    });
  }, []);

  const reset = useCallback(() => {
    setImages((prev) => {
      for (const img of prev) URL.revokeObjectURL(img.previewUrl);
      return [];
    });
  }, []);

  const fileIds = images.flatMap((img) => (img.fileId ? [img.fileId] : []));
  const uploading = images.some((img) => !img.fileId && !img.error);
  const failed = images.some((img) => Boolean(img.error));

  return { images, add, remove, reset, fileIds, uploading, failed };
}
