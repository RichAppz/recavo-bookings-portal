import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Download, FileText, Loader2, ShieldAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui-bits";
import { ApiError } from "@/lib/api";
import {
  useBusinessFile,
  useBusinessId,
  useFileDownloadUrl,
  useOwnerFiles,
  uploadFileViaIntent,
  type FileOwner,
} from "@/lib/api/hooks";
import type { FileResource } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type AttachedFile = { name: string; file: FileResource };

/** The API keeps no original file name, so earlier uploads are named by their type. */
function fileNameOf(file: FileResource): string {
  const type = file.mediaType.toLowerCase();
  if (type === "application/pdf") return "PDF document";
  if (type.startsWith("image/")) return "Photo";
  if (type.startsWith("video/")) return "Video";
  if (type.includes("word") || type.includes("document")) return "Document";
  if (type.includes("sheet") || type.includes("excel") || type === "text/csv") return "Spreadsheet";
  return "File";
}

/**
 * Reusable file attachments panel (RECA-504): upload via signed intent, with
 * progress, and download via a freshly-issued signed URL per click.
 *
 * With `listExisting`, earlier uploads are listed from the owner's file list;
 * without it only this session's uploads show.
 */
export function FileAttachments({
  ownerType,
  ownerId,
  title = "Files",
  description = "Documents and photos attached to this record.",
  canUpload = true,
  accept,
  maxSizeBytes = 25 * 1024 * 1024,
  listExisting = false,
  uploaderName,
  hideHeader = false,
}: {
  ownerType: FileOwner["ownerType"];
  ownerId: string;
  title?: string;
  description?: string;
  /** Hide the uploader for viewers without write access (caller decides the permission). */
  canUpload?: boolean;
  accept?: string;
  maxSizeBytes?: number;
  listExisting?: boolean;
  /** "Uploaded by {name} · 12 Oct" under each file. */
  uploaderName?: (actorId: string) => string | null;
  /** The caller renders its own heading; the upload button still shows. */
  hideHeader?: boolean;
}) {
  const businessId = useBusinessId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sessionAttachments, setAttachments] = useState<AttachedFile[]>([]);
  const existing = useOwnerFiles(listExisting ? { ownerType, ownerId } : undefined);
  const attachments: AttachedFile[] = [
    ...sessionAttachments,
    ...(existing.data ?? [])
      .filter((f) => f.status !== "deleted" && !sessionAttachments.some((a) => a.file.id === f.id))
      .map((f) => ({ name: fileNameOf(f), file: f })),
  ];
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !businessId) return;

    if (file.size > maxSizeBytes) {
      setUploadError(`File is too large — max ${formatBytes(maxSizeBytes)}.`);
      return;
    }

    setUploadError(null);
    setUploading(true);
    setProgress(0);
    try {
      const uploaded = await uploadFileViaIntent(businessId, file, { ownerType, ownerId }, (pct) =>
        setProgress(pct),
      );
      setAttachments((prev) => [{ name: file.name, file: uploaded }, ...prev]);
      toast.success("File uploaded", {
        description: "Scanning for malware before it's available to download.",
      });
    } catch (err) {
      if (err instanceof ApiError && err.isForbidden) {
        setUploadError("You don't have permission to upload files here.");
      } else if (err instanceof ApiError) {
        setUploadError(err.detail || err.title);
      } else {
        setUploadError(err instanceof Error ? err.message : "Upload failed.");
      }
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-start justify-between gap-3",
          hideHeader && !canUpload && "hidden",
        )}
      >
        {hideHeader ? (
          <span />
        ) : (
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        )}
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept={accept}
              disabled={uploading || !businessId}
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={uploading || !businessId}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploading ? "Uploading…" : "Upload file"}
            </Button>
          </>
        ) : null}
      </div>

      {uploading ? (
        <div className="space-y-1.5">
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground">{progress}%</p>
        </div>
      ) : null}

      {uploadError ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" /> {uploadError}
        </p>
      ) : null}

      {listExisting && existing.isLoading ? (
        <div className="h-12 animate-pulse rounded-xl bg-secondary" />
      ) : attachments.length === 0 && !uploading ? (
        <EmptyState
          icon={<FileText className="size-6" />}
          title="No files uploaded yet"
          description={
            canUpload
              ? "Upload a document or photo to attach it here."
              : "Nothing has been attached yet."
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {attachments.map((a) => (
            <FileRow
              key={a.file.id}
              name={a.name}
              initialFile={a.file}
              uploadedBy={uploaderName ? uploaderName(a.file.createdBy) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileRow({
  name,
  initialFile,
  uploadedBy,
}: {
  name: string;
  initialFile: FileResource;
  /** Undefined hides the line; null means the uploader isn't known. */
  uploadedBy?: string | null;
}) {
  const fileQuery = useBusinessFile(initialFile.id);
  const downloadUrl = useFileDownloadUrl();
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const apiError = fileQuery.error instanceof ApiError ? fileQuery.error : null;
  const file = fileQuery.data ?? initialFile;

  const handleDownload = async () => {
    setDownloadError(null);
    try {
      // Always request a brand-new signed URL — never reuse a previous one.
      const result = await downloadUrl.mutateAsync(file.id);
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isForbidden) {
          setDownloadError("Access denied — this file may have failed its security scan.");
        } else if (err.status === 422) {
          setDownloadError("Still scanning — try again shortly.");
        } else {
          setDownloadError(err.detail || err.title);
        }
      } else {
        setDownloadError("Couldn't get a download link.");
      }
    }
  };

  let status: ReactNode;
  if (apiError?.isForbidden) {
    status = (
      <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
        <ShieldAlert className="size-3.5" /> Access denied
      </span>
    );
  } else if (apiError) {
    status = <span className="text-xs text-destructive">Status unavailable</span>;
  } else if (
    file.scanStatus === "infected" ||
    file.scanStatus === "failed" ||
    file.status === "rejected"
  ) {
    status = (
      <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
        <ShieldAlert className="size-3.5" /> Blocked
      </span>
    );
  } else if (file.status === "available" && file.scanStatus === "clean") {
    status = (
      <Button variant="ghost" size="sm" disabled={downloadUrl.isPending} onClick={handleDownload}>
        {downloadUrl.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}
        Download
      </Button>
    );
  } else {
    status = (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Scanning…
      </span>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(initialFile.sizeBytes)}
          {uploadedBy !== undefined
            ? ` · Uploaded${uploadedBy ? ` by ${uploadedBy}` : ""} · ${new Intl.DateTimeFormat(
                "en-GB",
                { day: "numeric", month: "short" },
              ).format(new Date(initialFile.createdAt))}`
            : null}
        </p>
        {downloadError ? <p className="mt-1 text-xs text-destructive">{downloadError}</p> : null}
      </div>
      {status}
    </li>
  );
}
