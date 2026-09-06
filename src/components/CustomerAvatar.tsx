import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/ui-bits";
import { ApiError } from "@/lib/api";
import {
  uploadFileViaIntent,
  useBusinessFile,
  useBusinessId,
  useDeleteFile,
  useFileViewUrl,
  useUpdateCustomer,
} from "@/lib/api/hooks";
import { customerDisplayName, type Customer } from "@/lib/api/types";
import { PERMISSIONS } from "@/lib/permissions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Matches the API's default upload allow-list for images (ADR 0010). */
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * A client's profile picture (RECA-530), falling back to initials. The image is a
 * tenant file owned by the customer; `customer.avatarFileId` points at it. Newly
 * uploaded pictures show a spinner until the malware scan clears them.
 *
 * With `editable`, the avatar becomes a menu: upload / replace / remove.
 */
export function CustomerAvatar({
  customer,
  size = 40,
  editable = false,
  className,
}: {
  customer: Customer;
  size?: number;
  editable?: boolean;
  className?: string;
}) {
  const tenant = useTenant();
  const businessId = useBusinessId();
  const update = useUpdateCustomer();
  const deleteFile = useDeleteFile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const avatarId = customer.avatarFileId ?? undefined;
  const file = useBusinessFile(avatarId);
  const scanning = Boolean(avatarId) && (file.isLoading || file.data?.scanStatus === "pending");
  const usable = file.data?.status === "available" && file.data.scanStatus === "clean";
  const view = useFileViewUrl(avatarId, usable);
  const name = customerDisplayName(customer);

  const canEdit =
    editable && tenant.can(PERMISSIONS.CUSTOMER_UPDATE) && customer.status !== "anonymised";

  const pick = () => inputRef.current?.click();

  const upload = async (picked: File | undefined) => {
    if (!picked || !businessId) return;
    if (picked.size > MAX_IMAGE_BYTES) {
      toast.error("That photo is too large", {
        description: "Profile pictures can be up to 10 MB.",
      });
      return;
    }
    setBusy(true);
    const previous = customer.avatarFileId;
    try {
      const uploaded = await uploadFileViaIntent(businessId, picked, {
        ownerType: "customer",
        ownerId: customer.id,
      });
      await update.mutateAsync({
        customerId: customer.id,
        version: customer.version,
        body: { avatarFileId: uploaded.id },
      });
      // The old picture is no longer referenced; tidy it up, but don't fail the
      // update if that clean-up is refused.
      if (previous) deleteFile.mutate(previous, { onError: () => undefined });
      toast.success("Profile picture updated", {
        description: "It'll appear once it has been scanned — a few seconds.",
      });
    } catch (err) {
      // useUpdateCustomer already toasts API errors; only surface the upload leg here.
      if (!(err instanceof ApiError)) {
        toast.error("Couldn't upload that photo", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    const previous = customer.avatarFileId;
    if (!previous) return;
    setBusy(true);
    try {
      await update.mutateAsync({
        customerId: customer.id,
        version: customer.version,
        body: { avatarFileId: null },
      });
      deleteFile.mutate(previous, { onError: () => undefined });
      toast.success("Profile picture removed");
    } finally {
      setBusy(false);
    }
  };

  const avatar = (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <PersonAvatar name={name} size={size} src={usable ? view.data?.downloadUrl : undefined} />
      {(busy || scanning) && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
          <Loader2 className="size-1/3 animate-spin text-muted-foreground" aria-hidden />
        </span>
      )}
      {canEdit && !busy ? (
        <span
          className="absolute inset-0 flex items-center justify-center rounded-full bg-background/0 text-foreground opacity-0 transition-opacity group-hover:bg-background/60 group-hover:opacity-100 group-focus-visible:bg-background/60 group-focus-visible:opacity-100"
          aria-hidden
        >
          <Camera className="size-1/3" />
        </span>
      ) : null}
    </span>
  );

  if (!canEdit) return avatar;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={customer.avatarFileId ? "Change profile picture" : "Add profile picture"}
            disabled={busy}
          >
            {avatar}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={pick}>
            <Upload className="size-4" />
            {customer.avatarFileId ? "Replace photo" : "Upload photo"}
          </DropdownMenuItem>
          {customer.avatarFileId ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => void remove()}
            >
              <Trash2 className="size-4" />
              Remove photo
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void upload(e.target.files?.[0])}
      />
    </>
  );
}
