import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import { toastApiError } from "./errors";
import { uploadViaSignedIntent, useBusinessId } from "./hooks";
import { queryKeys } from "./query-keys";
import type {
  FileResource,
  SupportAttachment,
  SupportMessage,
  SupportRequest,
  SupportRequestCategory,
} from "./types";

/** What the API accepts on a support thread; mirrors its allow-list. */
export const SUPPORT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const SUPPORT_MAX_IMAGES = 5;
export const SUPPORT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const SUPPORT_CATEGORIES: ReadonlyArray<{ value: SupportRequestCategory; label: string }> = [
  { value: "question", label: "Question" },
  { value: "bug", label: "Something isn't working" },
  { value: "billing", label: "Billing" },
  { value: "feature", label: "Feature request" },
  { value: "other", label: "Other" },
];

export type CreateSupportRequestInput = {
  category: SupportRequestCategory;
  subject: string;
  body: string;
  /** Ids from {@link uploadSupportImage}; up to five. */
  attachmentFileIds?: string[];
};

export type SupportReplyInput = {
  body: string;
  attachmentFileIds?: string[];
};

export type SupportThread = { request: SupportRequest; messages: SupportMessage[] };

/** True while any image on the thread is still being scanned, so the page keeps polling. */
export function threadHasScanning(thread: SupportThread | undefined): boolean {
  if (!thread) return false;
  const scanning = (a: SupportAttachment) => a.state === "scanning";
  return (
    thread.request.attachments.some(scanning) ||
    thread.messages.some((m) => m.attachments.some(scanning))
  );
}

/**
 * Upload one image for a support message: signed intent → PUT → checksum. Returns the
 * file whose id goes in `attachmentFileIds`. The API scans it after the message is sent,
 * so it shows as "scanning" on the thread for a few seconds.
 */
export function uploadSupportImage(
  businessId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<FileResource> {
  return uploadViaSignedIntent(
    {
      intentUrl: `/api/v1/businesses/${businessId}/support-attachments`,
      completeUrl: (fileId) =>
        `/api/v1/businesses/${businessId}/support-attachments/${fileId}/complete`,
    },
    file,
    onProgress,
  );
}

/** Every request this business has raised, newest first. */
export function useSupportRequests() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.supportRequests(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ requests: SupportRequest[] }>(
        `/api/v1/businesses/${businessId}/support-requests`,
      );
      return res.data.requests;
    },
  });
}

/** One request with its thread (opening message is `request.body`; replies follow). */
export function useSupportRequest(requestId: string | undefined) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.supportRequest(businessId, requestId ?? ""),
    enabled: Boolean(businessId && requestId),
    queryFn: async () => {
      const res = await api.get<SupportThread>(
        `/api/v1/businesses/${businessId}/support-requests/${requestId}`,
      );
      return res.data;
    },
    // Images appear once the malware scan passes; keep asking until none are pending.
    refetchInterval: (query) => (threadHasScanning(query.state.data) ? 4_000 : false),
  });
}

/**
 * Raise a support request for the current business. It lands in the RECAVO
 * internal console and alerts the team; replies come back to /support and by
 * email. Not idempotency-keyed on purpose: a double submit is rate-limited
 * server-side and is harmless to triage.
 */
export function useCreateSupportRequest() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation<SupportRequest, Error, CreateSupportRequestInput>({
    mutationFn: async (input) => {
      const res = await api.post<{ request: SupportRequest }>(
        `/api/v1/businesses/${businessId}/support-requests`,
        input,
      );
      return res.data.request;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.supportRequests(businessId) });
    },
    onError: (err) => toastApiError(err, "Couldn't send your message"),
  });
}

/** Reply on a thread. Replying to a resolved request reopens it. */
export function useReplyToSupportRequest(requestId: string) {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return useMutation<
    { request: SupportRequest; message: SupportMessage },
    Error,
    SupportReplyInput
  >({
    mutationFn: async (input) => {
      const res = await api.post<{ request: SupportRequest; message: SupportMessage }>(
        `/api/v1/businesses/${businessId}/support-requests/${requestId}/messages`,
        input,
      );
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData<SupportThread>(queryKeys.supportRequest(businessId, requestId), (prev) =>
        prev
          ? { request: data.request, messages: [...prev.messages, data.message] }
          : { request: data.request, messages: [data.message] },
      );
      void qc.invalidateQueries({ queryKey: queryKeys.supportRequests(businessId) });
    },
    onError: (err) => toastApiError(err, "Couldn't send your reply"),
  });
}
