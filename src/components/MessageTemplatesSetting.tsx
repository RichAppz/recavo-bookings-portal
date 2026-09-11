import { useEffect, useState } from "react";
import { Mail, MessageSquareText, RotateCcw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableGhost } from "@/components/ghost";
import {
  useNotificationTemplatePreview,
  useNotificationTemplates,
  useResetNotificationTemplate,
  useUpdateNotificationTemplate,
} from "@/lib/api/hooks";
import {
  describeSmsSize,
  SMS_TEMPLATE_MAX_LENGTH,
  SMS_WARN_LENGTH,
  unknownPlaceholders,
  type MessageTemplate,
  type TemplateChannel,
} from "@/lib/message-templates";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

/**
 * Settings → Message templates. Each customer-facing message has two editable
 * wordings — the email prose above the fixed details table and buttons, and the whole
 * text message — shown side by side so what goes out on either channel is visible in
 * one place. Labels, defaults, placeholder help and every preview arrive from the API,
 * rendered by the same code that sends the real message.
 */
export function MessageTemplatesSetting({ className }: { className?: string }) {
  const tenant = useTenant();
  const query = useNotificationTemplates();
  const clientNoun = tenant.terminology.client.toLowerCase();
  const templates = query.data ?? [];

  return (
    <section className={cn("rounded-xl border p-4 sm:p-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <MessageSquareText className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold tracking-tight">Message templates</p>
          <p className="text-sm text-muted-foreground">
            These are the messages your {clientNoun}s receive by email and text. Edit the wording of
            each to suit your business; anything in double braces, like{" "}
            <code className="rounded bg-secondary px-1 py-0.5 text-xs">{"{{first_name}}"}</code>, is
            filled in automatically for each message, and anything in double square brackets, like{" "}
            <code className="rounded bg-secondary px-1 py-0.5 text-xs">
              {"[[ at {{location}}]]"}
            </code>
            , is only included when the details inside it are known. Emails get the details table
            and buttons added under your text; texts get their link added at the end.
          </p>
        </div>
      </div>

      <Can
        permission={PERMISSIONS.BUSINESS_UPDATE}
        fallback={
          <p className="mt-4 text-sm text-muted-foreground">An admin can change these messages.</p>
        }
      >
        {query.isLoading ? (
          <div className="mt-4">
            <TableGhost />
          </div>
        ) : query.isError ? (
          <p className="mt-4 text-sm text-destructive">
            Couldn't load your message templates. Please try again shortly.
          </p>
        ) : (
          <div className="mt-4 grid gap-8">
            {templates.map((tpl) => (
              <TemplateCard key={tpl.key} template={tpl} />
            ))}
          </div>
        )}
      </Can>
    </section>
  );
}

function TemplateCard({ template }: { template: MessageTemplate }) {
  // Side by side from `md` up; below that a pair of tabs shows one channel at a time.
  // Both editors stay mounted either way so an unsaved edit survives switching tabs.
  const [shown, setShown] = useState<TemplateChannel>("email");
  return (
    <div className="grid gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{template.label}</p>
        <p className="text-xs text-muted-foreground">{template.description}</p>
      </div>
      <div role="tablist" className="flex gap-1 rounded-lg bg-secondary p-1 md:hidden">
        {(
          [
            ["email", "Email", template.customised],
            ["sms", "Text message", template.smsCustomised],
          ] as const
        ).map(([channel, label, customised]) => (
          <button
            key={channel}
            type="button"
            role="tab"
            aria-selected={shown === channel}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
              shown === channel ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => setShown(channel)}
          >
            {channel === "sms" ? <Smartphone className="size-4" /> : <Mail className="size-4" />}
            {label}
            {customised ? <span className="size-1.5 rounded-full bg-primary" /> : null}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ChannelEditor
          template={template}
          channel="email"
          text={template.bodyRegion}
          defaultText={template.defaultBodyRegion}
          customised={template.customised}
          serverPreview={template.emailPreview}
          className={shown === "email" ? undefined : "hidden md:grid"}
        />
        <ChannelEditor
          template={template}
          channel="sms"
          text={template.smsBody}
          defaultText={template.defaultSmsBody}
          customised={template.smsCustomised}
          serverPreview={template.smsPreview}
          className={shown === "sms" ? undefined : "hidden md:grid"}
        />
      </div>
    </div>
  );
}

function ChannelEditor({
  template,
  channel,
  text: savedText,
  defaultText,
  customised,
  serverPreview,
  className,
}: {
  template: MessageTemplate;
  channel: TemplateChannel;
  /** Current wording on this channel: the saved override, else the default. */
  text: string;
  defaultText: string;
  customised: boolean;
  /** `text` rendered by the API, so no request is needed until the owner edits. */
  serverPreview: string;
  className?: string;
}) {
  const update = useUpdateNotificationTemplate();
  const reset = useResetNotificationTemplate();
  const [text, setText] = useState(savedText);
  const [dirty, setDirty] = useState(false);

  // Adopt fresh server text (after a save/reset elsewhere) unless the owner is mid-edit.
  useEffect(() => {
    if (dirty) return;
    setText(savedText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedText]);

  const trimmed = text.trim();
  const isDefault = trimmed === defaultText.trim();
  const unknown = unknownPlaceholders(text, template.placeholders);
  const isSms = channel === "sms";
  const tooLong = isSms && trimmed.length > SMS_TEMPLATE_MAX_LENGTH;
  const busy = update.isPending || reset.isPending;
  const canSave = dirty && trimmed.length > 0 && trimmed !== savedText.trim() && !busy && !tooLong;
  const canReset = (customised || !isDefault) && !busy;

  // The preview is always the API's rendering. The list already carries one for the
  // saved wording; only edited wording asks the API, a moment after typing stops.
  const edited = trimmed.length > 0 && trimmed !== savedText.trim();
  const debounced = useDebouncedValue(edited ? trimmed : null, 350);
  const live = useNotificationTemplatePreview({ key: template.key, channel, body: debounced });
  const preview = edited ? live.data?.preview : serverPreview;
  const previewStale = edited && (live.isFetching || debounced !== trimmed);
  const previewLength = preview?.length ?? 0;

  const save = async () => {
    // Saving text identical to the default is the same as having no custom wording.
    if (isDefault) {
      await doReset();
      return;
    }
    await update.mutateAsync({ key: template.key, bodyRegion: trimmed, channel });
    setDirty(false);
    toast.success(`${template.label} ${channelNoun(channel)} saved`);
  };

  const doReset = async () => {
    if (customised) {
      await reset.mutateAsync({ key: template.key, channel });
      toast.success(`${template.label} ${channelNoun(channel)} reset to default`);
    }
    setText(defaultText);
    setDirty(false);
  };

  const id = `tpl-${template.key}-${channel}`;
  return (
    <div className={cn("grid min-w-0 content-start gap-2 rounded-lg border p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
          {isSms ? <Smartphone className="size-4" /> : <Mail className="size-4" />}
          {isSms ? "Text message" : "Email"}
        </Label>
        {customised ? (
          <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold tracking-wide text-primary-foreground uppercase">
            Customised
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase">
            Default
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {isSms ? (
          template.smsLinkLabel ? (
            <>
              The whole text. A link labelled{" "}
              <span className="font-medium text-foreground">{template.smsLinkLabel}:</span> is added
              at the end unless you place{" "}
              <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">{"{{link}}"}</code>{" "}
              yourself.
            </>
          ) : (
            "The whole text. This message has no link."
          )
        ) : (
          <>
            Subject: <span className="font-medium text-foreground">{template.emailSubject}</span>.
            Your wording sits above the details table and buttons.
          </>
        )}
      </p>

      <Textarea
        id={id}
        rows={isSms ? 4 : 3}
        value={text}
        aria-invalid={trimmed.length === 0 || tooLong ? true : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />

      {trimmed.length > 0 ? (
        <p
          className={cn(
            "text-xs break-words text-muted-foreground [overflow-wrap:anywhere]",
            previewStale && "opacity-60",
          )}
          aria-live="polite"
        >
          <span className="font-medium text-foreground">Preview:</span>{" "}
          {preview ?? (live.isError ? "Couldn't render a preview." : "Rendering…")}
        </p>
      ) : (
        <p className="text-xs text-destructive">Enter some wording, or reset to the default.</p>
      )}
      {isSms && preview !== undefined && trimmed.length > 0 ? (
        <p
          className={cn(
            "text-xs",
            previewLength > SMS_WARN_LENGTH ? "text-warning" : "text-muted-foreground",
          )}
        >
          {describeSmsSize(previewLength)} as sent
          {previewLength > SMS_WARN_LENGTH
            ? " — texts are cut off after 306 characters, so shorten this."
            : ""}
        </p>
      ) : null}
      {tooLong ? (
        <p className="text-xs text-destructive">
          Text wording must be {SMS_TEMPLATE_MAX_LENGTH} characters or fewer.
        </p>
      ) : null}
      {unknown.length > 0 ? (
        <p className="text-xs text-warning">
          {unknown.join(", ")} {unknown.length === 1 ? "isn't" : "aren't"} recognised and will be
          left blank. Use one of the placeholders below.
        </p>
      ) : null}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground select-none">
          Placeholders you can use
        </summary>
        <ul className="mt-2 grid gap-1">
          {template.placeholders.map((p) => (
            <li key={p.token} className="flex flex-wrap items-baseline gap-x-2">
              <button
                type="button"
                className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px] hover:bg-secondary/70"
                title="Add to the message"
                onClick={() => {
                  setText((t) => (t.trimEnd().length ? `${t.trimEnd()} ${p.token}` : p.token));
                  setDirty(true);
                }}
              >
                {p.token}
              </button>
              <span className="text-muted-foreground">{p.description}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!canSave} onClick={() => void save()}>
          Save {channelNoun(channel)}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canReset}
          onClick={() => void doReset()}
          title="Back to the standard wording"
        >
          <RotateCcw className="size-3.5" /> Reset to default
        </Button>
      </div>
    </div>
  );
}

function channelNoun(channel: TemplateChannel): string {
  return channel === "sms" ? "text" : "email";
}

/** `value`, but only once it has held still for `delayMs`; null passes through at once. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value === null) {
      setSettled(value);
      return;
    }
    const handle = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return settled;
}
