import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableGhost } from "@/components/ghost";
import {
  useNotificationTemplates,
  useResetNotificationTemplate,
  useUpdateNotificationTemplate,
} from "@/lib/api/hooks";
import {
  fallbackTemplates,
  fillPlaceholders,
  unknownPlaceholders,
  type MessageTemplate,
} from "@/lib/message-templates";
import { PERMISSIONS } from "@/lib/permissions";
import { Can, useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

/**
 * Settings → Message templates. Each customer-facing message has one editable prose
 * region; the heading, facts table and buttons around it are fixed so nobody can break
 * the layout. Labels, defaults and placeholder help arrive from the API already worded
 * in the business's terminology ("Job confirmation", "Detailer's name"…).
 */
export function MessageTemplatesSetting({ className }: { className?: string }) {
  const tenant = useTenant();
  const query = useNotificationTemplates();
  const clientNoun = tenant.terminology.client.toLowerCase();

  // `null` = the API predates the list endpoint; show terminology-aware defaults.
  const legacyApi = query.isSuccess && query.data === null;
  const templates = useMemo<MessageTemplate[]>(() => {
    if (query.data) return query.data;
    if (legacyApi) return fallbackTemplates(tenant.terminology);
    return [];
  }, [query.data, legacyApi, tenant.terminology]);

  return (
    <section className={cn("rounded-xl border p-4 sm:p-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <MessageSquareText className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold tracking-tight">Message templates</p>
          <p className="text-sm text-muted-foreground">
            These are the messages your {clientNoun}s receive by email and text. Edit the wording to
            suit your business; anything in double braces, like{" "}
            <code className="rounded bg-secondary px-1 py-0.5 text-xs">{"{{first_name}}"}</code>, is
            filled in automatically for each message. The details table and buttons under the text
            are added for you.
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
          <div className="mt-4 grid gap-6">
            {legacyApi ? (
              <p className="text-xs text-muted-foreground">
                Any wording you saved before is not shown here yet; saving replaces it.
              </p>
            ) : null}
            {templates.map((tpl) => (
              <TemplateEditor key={tpl.key} template={tpl} readOnlySaved={legacyApi} />
            ))}
          </div>
        )}
      </Can>
    </section>
  );
}

function TemplateEditor({
  template,
  readOnlySaved,
}: {
  template: MessageTemplate;
  /** Legacy API: no saved text is known, so "reset" can only restore the default locally. */
  readOnlySaved: boolean;
}) {
  const update = useUpdateNotificationTemplate();
  const reset = useResetNotificationTemplate();
  const [text, setText] = useState(template.bodyRegion);
  const [dirty, setDirty] = useState(false);

  // Adopt fresh server text (after a save/reset elsewhere) unless the owner is mid-edit.
  useEffect(() => {
    if (dirty) return;
    setText(template.bodyRegion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.bodyRegion]);

  const trimmed = text.trim();
  const isDefault = trimmed === template.defaultBodyRegion.trim();
  const unknown = unknownPlaceholders(text, template.placeholders);
  const preview = fillPlaceholders(trimmed, template.placeholders);
  const busy = update.isPending || reset.isPending;
  const canSave = dirty && trimmed.length > 0 && trimmed !== template.bodyRegion.trim() && !busy;
  const canReset = (template.customised || !isDefault) && !busy;

  const save = async () => {
    // Saving text identical to the default is the same as having no custom wording.
    if (isDefault && !readOnlySaved) {
      await doReset();
      return;
    }
    await update.mutateAsync({ key: template.key, bodyRegion: trimmed });
    setDirty(false);
    toast.success(`${template.label} saved`);
  };

  const doReset = async () => {
    if (template.customised && !readOnlySaved) {
      await reset.mutateAsync(template.key);
      toast.success(`${template.label} reset to default`);
    }
    setText(template.defaultBodyRegion);
    setDirty(false);
  };

  const id = `tpl-${template.key}`;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-sm font-semibold">
            {template.label}
          </Label>
          <p className="text-xs text-muted-foreground">{template.description}</p>
        </div>
        {template.customised ? (
          <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold tracking-wide text-primary-foreground uppercase">
            Customised
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase">
            Default
          </span>
        )}
      </div>

      <Textarea
        id={id}
        rows={3}
        value={text}
        aria-invalid={trimmed.length === 0 ? true : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />

      {trimmed.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Preview:</span> {preview}
        </p>
      ) : (
        <p className="text-xs text-destructive">Enter some wording, or reset to the default.</p>
      )}
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
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
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
          Save {template.label.toLowerCase()}
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
