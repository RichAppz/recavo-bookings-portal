import { useEffect, useRef, useState } from "react";
import { Mail, Plus, RotateCcw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { CustomisedDot, StatusPill } from "@/components/settings/primitives";
import { useSettingsDraft } from "@/components/settings/save-bar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useNotificationTemplatePreview,
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
  type TemplatePlaceholder,
} from "@/lib/message-templates";
import { humanizeToken } from "@/lib/settings-labels";
import { cn } from "@/lib/utils";

/*
 * Settings → Client messages → one template (spec §5). Email and Text message are
 * real tabs; each keeps its own draft so switching never loses an edit. Both drafts
 * register with the page's save bar as one, and the editor keeps Reset to default
 * beside the preview. The preview is always the API's rendering — the same code
 * that sends the real message.
 */

type ChannelDraft = {
  text: string;
  dirty: boolean;
};

function placeholderLabel(p: TemplatePlaceholder): string {
  const raw = p.token.replace(/[{}\s]/g, "");
  return humanizeToken(raw);
}

export function TemplateEditor({
  template,
  canEdit,
  onDirtyChange,
}: {
  template: MessageTemplate;
  canEdit: boolean;
  /** Lets the list ask before switching templates mid-edit. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const update = useUpdateNotificationTemplate();
  const reset = useResetNotificationTemplate();
  const [channel, setChannel] = useState<TemplateChannel>("email");
  const [email, setEmail] = useState<ChannelDraft>({ text: template.bodyRegion, dirty: false });
  const [sms, setSms] = useState<ChannelDraft>({ text: template.smsBody, dirty: false });

  // Adopt fresh server text (after a save/reset elsewhere) unless mid-edit.
  useEffect(() => {
    setEmail((d) => (d.dirty ? d : { text: template.bodyRegion, dirty: false }));
  }, [template.bodyRegion]);
  useEffect(() => {
    setSms((d) => (d.dirty ? d : { text: template.smsBody, dirty: false }));
  }, [template.smsBody]);

  const emailTrim = email.text.trim();
  const smsTrim = sms.text.trim();
  const emailChanged = email.dirty && emailTrim !== template.bodyRegion.trim();
  const smsChanged = sms.dirty && smsTrim !== template.smsBody.trim();
  const dirty = emailChanged || smsChanged;
  const smsTooLong = smsTrim.length > SMS_TEMPLATE_MAX_LENGTH;
  const valid =
    (!emailChanged || emailTrim.length > 0) && (!smsChanged || (smsTrim.length > 0 && !smsTooLong));
  const busy = update.isPending || reset.isPending;

  const dirtyRef = useRef(dirty);
  useEffect(() => {
    if (dirtyRef.current !== dirty) {
      dirtyRef.current = dirty;
      onDirtyChange?.(dirty);
    }
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const saveChannel = async (which: TemplateChannel) => {
    const draft = which === "email" ? email : sms;
    const defaultText = which === "email" ? template.defaultBodyRegion : template.defaultSmsBody;
    const customised = which === "email" ? template.customised : template.smsCustomised;
    const trimmed = draft.text.trim();
    // Saving text identical to the default is the same as having no custom wording.
    if (trimmed === defaultText.trim()) {
      if (customised) await reset.mutateAsync({ key: template.key, channel: which });
    } else {
      await update.mutateAsync({ key: template.key, bodyRegion: trimmed, channel: which });
    }
    (which === "email" ? setEmail : setSms)({ text: trimmed, dirty: false });
  };

  const saveAll = async () => {
    if (emailChanged) await saveChannel("email");
    if (smsChanged) await saveChannel("sms");
    toast.success(`${template.label} saved`);
  };

  const discardAll = () => {
    setEmail({ text: template.bodyRegion, dirty: false });
    setSms({ text: template.smsBody, dirty: false });
  };

  const bar = useSettingsDraft({
    dirty: canEdit && dirty,
    valid,
    saving: busy,
    save: saveAll,
    discard: discardAll,
  });

  const resetChannel = async (which: TemplateChannel) => {
    const customised = which === "email" ? template.customised : template.smsCustomised;
    const defaultText = which === "email" ? template.defaultBodyRegion : template.defaultSmsBody;
    if (customised) {
      await reset.mutateAsync({ key: template.key, channel: which });
      toast.success(
        `${template.label} ${which === "sms" ? "text" : "email"} reset to the standard wording`,
      );
    }
    (which === "email" ? setEmail : setSms)({ text: defaultText, dirty: false });
  };

  return (
    <div className="grid min-w-0 content-start gap-4">
      <div className="min-w-0">
        <h3 className="text-[15.5px] font-bold">{template.label}</h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{template.description}</p>
      </div>

      <Tabs value={channel} onValueChange={(v) => setChannel(v as TemplateChannel)}>
        <TabsList aria-label="Message channel">
          <TabsTrigger value="email" className="gap-1.5">
            <Mail className="size-4" aria-hidden />
            Email
            {template.customised ? <CustomisedDot /> : null}
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-1.5">
            <Smartphone className="size-4" aria-hidden />
            Text message
            {template.smsCustomised ? <CustomisedDot /> : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="email" forceMount className={channel === "email" ? "mt-4" : "hidden"}>
          <ChannelPane
            template={template}
            channel="email"
            draft={email}
            defaultText={template.defaultBodyRegion}
            customised={template.customised}
            serverPreview={template.emailPreview}
            canEdit={canEdit}
            busy={busy}
            managed={bar.managed}
            onChange={(text) => setEmail({ text, dirty: true })}
            onReset={() => void resetChannel("email")}
            onSave={() => void saveChannel("email").then(() => toast.success("Email saved"))}
          />
        </TabsContent>
        <TabsContent value="sms" forceMount className={channel === "sms" ? "mt-4" : "hidden"}>
          <ChannelPane
            template={template}
            channel="sms"
            draft={sms}
            defaultText={template.defaultSmsBody}
            customised={template.smsCustomised}
            serverPreview={template.smsPreview}
            canEdit={canEdit}
            busy={busy}
            managed={bar.managed}
            onChange={(text) => setSms({ text, dirty: true })}
            onReset={() => void resetChannel("sms")}
            onSave={() => void saveChannel("sms").then(() => toast.success("Text saved"))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChannelPane({
  template,
  channel,
  draft,
  defaultText,
  customised,
  serverPreview,
  canEdit,
  busy,
  managed,
  onChange,
  onReset,
  onSave,
}: {
  template: MessageTemplate;
  channel: TemplateChannel;
  draft: ChannelDraft;
  defaultText: string;
  customised: boolean;
  serverPreview: string;
  canEdit: boolean;
  busy: boolean;
  /** True when the page's save bar owns Save; the pane then only offers Reset. */
  managed: boolean;
  onChange: (text: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const isSms = channel === "sms";
  const trimmed = draft.text.trim();
  const saved = isSms ? template.smsBody : template.bodyRegion;
  const isDefault = trimmed === defaultText.trim();
  const edited = trimmed.length > 0 && trimmed !== saved.trim();
  const unknown = unknownPlaceholders(draft.text, template.placeholders);
  const tooLong = isSms && trimmed.length > SMS_TEMPLATE_MAX_LENGTH;
  const canReset = canEdit && (customised || !isDefault) && !busy;
  const canSave = canEdit && edited && trimmed.length > 0 && !tooLong && !busy;

  // The list already carries a preview for the saved wording; only edited wording
  // asks the API, a moment after typing stops.
  const debounced = useDebouncedValue(edited ? trimmed : null, 350);
  const live = useNotificationTemplatePreview({ key: template.key, channel, body: debounced });
  const preview = edited ? live.data?.preview : serverPreview;
  const previewStale = edited && (live.isFetching || debounced !== trimmed);
  const previewLength = preview?.length ?? 0;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const insert = (token: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.text.length;
    const end = el?.selectionEnd ?? draft.text.length;
    const before = draft.text.slice(0, start);
    const after = draft.text.slice(end);
    const lead = before.length && !/\s$/.test(before) ? " " : "";
    const trail = after.length && !/^\s/.test(after) ? " " : "";
    const next = `${before}${lead}${token}${trail}${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = before.length + lead.length + token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const id = `tpl-${template.key}-${channel}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={id} className="text-sm font-medium">
            {isSms ? "Your text" : "Your wording"}
          </Label>
          <StatusPill tone={customised ? "mint" : "grey"}>
            {customised ? "Customised" : "Default"}
          </StatusPill>
        </div>
        <Textarea
          id={id}
          ref={textareaRef}
          rows={isSms ? 5 : 5}
          value={draft.text}
          disabled={!canEdit}
          aria-invalid={trimmed.length === 0 || tooLong ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {trimmed.length === 0 ? (
          <p className="text-xs text-destructive">Enter some wording, or reset to the default.</p>
        ) : null}
        {tooLong ? (
          <p className="text-xs text-destructive">
            Text wording must be {SMS_TEMPLATE_MAX_LENGTH} characters or fewer.
          </p>
        ) : null}
        {unknown.length > 0 ? (
          <p className="text-xs text-warning-foreground dark:text-amber">
            {unknown.join(", ")} {unknown.length === 1 ? "isn't" : "aren't"} recognised and will be
            left blank.
          </p>
        ) : null}

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Add a detail</p>
          <div className="flex flex-wrap gap-1.5">
            {template.placeholders.map((p) => (
              <button
                key={p.token}
                type="button"
                disabled={!canEdit}
                title={p.description}
                onClick={() => insert(p.token)}
                className="inline-flex min-h-7 items-center gap-0.5 rounded-full border bg-background px-2.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
              >
                <Plus className="size-3" aria-hidden />
                {placeholderLabel(p)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Anything in <code className="rounded bg-secondary px-1">[[ ]]</code> is only included
            when the detail inside it is known.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!managed ? (
            <Button size="sm" disabled={!canSave} onClick={onSave}>
              Save {isSms ? "text" : "email"}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={!canReset} onClick={onReset}>
            <RotateCcw className="size-3.5" aria-hidden /> Reset to default
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 content-start gap-2">
        <p className="text-sm font-medium">Preview</p>
        {isSms ? (
          <SmsBubble text={preview} stale={previewStale} error={live.isError} />
        ) : (
          <MiniEmail
            subject={template.emailSubject}
            text={preview}
            stale={previewStale}
            error={live.isError}
          />
        )}
        {isSms && preview !== undefined && trimmed.length > 0 ? (
          <p
            className={cn(
              "text-xs",
              previewLength > SMS_WARN_LENGTH
                ? "text-warning-foreground dark:text-amber"
                : "text-muted-foreground",
            )}
            role="status"
          >
            {describeSmsSize(previewLength)} as sent
            {previewLength > SMS_WARN_LENGTH
              ? " — texts are cut off after 306 characters, so shorten this."
              : ""}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {isSms ? (
            template.smsLinkLabel ? (
              <>
                A <span className="font-medium text-foreground">{template.smsLinkLabel}</span> link
                is added at the end unless you place{" "}
                <code className="rounded bg-secondary px-1">{"{{link}}"}</code> yourself.
              </>
            ) : (
              "This message has no link."
            )
          ) : (
            "The details table and buttons are added under your wording."
          )}
        </p>
      </div>
    </div>
  );
}

function SmsBubble({ text, stale, error }: { text?: string; stale: boolean; error: boolean }) {
  return (
    <div className="rounded-[18px] bg-secondary/60 p-3 dark:bg-secondary/30">
      <div
        className={cn(
          "ml-auto w-fit max-w-[85%] rounded-[18px] rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground break-words [overflow-wrap:anywhere] whitespace-pre-wrap",
          stale && "opacity-60",
        )}
        aria-live="polite"
      >
        {text ?? (error ? "Couldn't render a preview." : "Rendering…")}
      </div>
    </div>
  );
}

function MiniEmail({
  subject,
  text,
  stale,
  error,
}: {
  subject: string;
  text?: string;
  stale: boolean;
  error: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border bg-background">
      <div className="border-b bg-secondary/40 px-4 py-2 text-xs dark:bg-secondary/20">
        <span className="text-muted-foreground">Subject: </span>
        <span className="font-medium">{subject}</span>
      </div>
      <div
        className={cn(
          "px-4 py-3 text-sm break-words [overflow-wrap:anywhere] whitespace-pre-wrap",
          stale && "opacity-60",
        )}
        aria-live="polite"
      >
        {text ?? (error ? "Couldn't render a preview." : "Rendering…")}
      </div>
      <div className="mx-4 mb-3 grid gap-1.5 rounded-lg border border-dashed p-3" aria-hidden>
        <div className="h-2 w-3/5 rounded bg-secondary" />
        <div className="h-2 w-2/5 rounded bg-secondary" />
        <div className="mt-1 h-6 w-28 rounded-md bg-primary/30" />
      </div>
    </div>
  );
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
