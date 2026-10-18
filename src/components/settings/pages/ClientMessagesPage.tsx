import { useCallback, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { BookingRemindersSetting } from "@/components/BookingRemindersSetting";
import {
  CustomisedDot,
  GroupedBlock,
  ReadOnlyNotice,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  StatusPill,
} from "@/components/settings/primitives";
import { TemplateEditor } from "@/components/settings/TemplateEditor";
import { TableGhost } from "@/components/ghost";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BottomSheet, BottomSheetContent, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsPhone } from "@/hooks/use-media-query";
import { useNotificationTemplates } from "@/lib/api/hooks";
import { useSmsCreditsSummary } from "@/lib/billing/sms-credits";
import type { MessageTemplate } from "@/lib/message-templates";
import { PERMISSIONS } from "@/lib/permissions";
import { CHANNEL_LABELS, describeOffset } from "@/lib/reminders/rule-form";
import { useTenant } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

type GroupKey = "sessions" | "payments" | "packages" | "extras" | "other";

const GROUP_ORDER: GroupKey[] = ["sessions", "payments", "packages", "extras", "other"];

const GROUP_OF: Record<string, GroupKey> = {
  booking_confirmation: "sessions",
  reminder: "sessions",
  reschedule: "sessions",
  cancellation: "sessions",
  service_follow_up: "sessions",
  booking_payment_request: "payments",
  payment_reminder: "payments",
  payment_confirmation: "payments",
  payment_failure: "payments",
  refund: "payments",
  bank_transfer_instructions: "payments",
  package_purchase: "packages",
  package_payment_request: "packages",
  package_request_received: "packages",
  package_request_declined: "packages",
  package_expiry_warning: "packages",
  booking_upsell_offer: "extras",
  booking_upsell_requested: "extras",
  invoice_issued: "extras",
};

function groupOf(key: string): GroupKey {
  return GROUP_OF[key] ?? "other";
}

/**
 * Settings → Client messages (spec §5): reminders as one summary row with the
 * editor in a drawer, and every message template in a grouped list with one
 * editor for the selected one. Nothing the old Notifications tab did is gone —
 * the reminder editor is the same component, and each template still has its
 * email and text wording, previews, placeholders, reset and save.
 */
export function ClientMessagesPage() {
  const tenant = useTenant();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const query = useNotificationTemplates();
  const isPhone = useIsPhone();
  const templates = useMemo(() => query.data ?? [], [query.data]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const onDirtyChange = useCallback((dirty: boolean) => setEditorDirty(dirty), []);

  // Desktop always shows an editor; phone shows the list until a template is picked.
  const selected: MessageTemplate | null =
    templates.find((t) => t.key === selectedKey) ??
    (!isPhone && templates.length > 0 ? (templates[0] ?? null) : null);

  const choose = (key: string) => {
    if (key === selected?.key) return;
    if (editorDirty) {
      setPendingKey(key);
      return;
    }
    setSelectedKey(key);
  };

  const groups = useMemo(() => {
    const labels: Record<GroupKey, string> = {
      sessions: `${tenant.terminology.booking}s`,
      payments: "Payments",
      packages: "Packages",
      extras: "Extras and invoices",
      other: "Other",
    };
    return GROUP_ORDER.map((g) => ({
      key: g,
      label: labels[g],
      items: templates.filter((t) => groupOf(t.key) === g),
    })).filter((g) => g.items.length > 0);
  }, [templates, tenant.terminology.booking]);

  const customisedCount = templates.filter((t) => t.customised || t.smsCustomised).length;
  const showEditorOnPhone = isPhone && selected !== null && selectedKey !== null;

  return (
    <SettingsPage
      title="Client messages"
      description={`What your ${tenant.terminology.client.toLowerCase()}s hear from you, by email and text, and when.`}
      banner={canEdit ? null : <ReadOnlyNotice />}
      className={showEditorOnPhone ? "[&>a]:hidden" : undefined}
    >
      {showEditorOnPhone ? null : <RemindersSection canEdit={canEdit} />}

      <section
        id="messages-templates"
        aria-labelledby="messages-templates-title"
        className="py-7 last:pb-0"
      >
        {showEditorOnPhone ? null : (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="messages-templates-title" className="text-[15.5px] leading-snug font-bold">
                Message templates
              </h3>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                The wording of every email and text clients receive. Details like names, times and
                links are filled in for each message; emails also get a details table and buttons
                added under your words.
              </p>
            </div>
            {customisedCount > 0 ? (
              <StatusPill tone="mint">{customisedCount} customised</StatusPill>
            ) : null}
          </div>
        )}

        {query.isLoading ? (
          <TableGhost />
        ) : query.isError ? (
          <p className="text-sm text-destructive">
            Couldn't load your message templates. Please try again shortly.
          </p>
        ) : (
          <div className={cn("grid gap-6", !isPhone && "md:grid-cols-[240px_minmax(0,1fr)]")}>
            {showEditorOnPhone ? null : (
              <nav aria-label="Message templates" className="grid content-start gap-4">
                {groups.map((group) => (
                  <div key={group.key}>
                    <p className="mb-1.5 px-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                      {group.label}
                    </p>
                    <GroupedBlock
                      as="ul"
                      className="md:rounded-xl md:border-0 md:bg-transparent md:divide-y-0 md:dark:bg-transparent"
                    >
                      {group.items.map((t) => {
                        const active = selected?.key === t.key && !isPhone;
                        const customised = t.customised || t.smsCustomised;
                        return (
                          <li key={t.key}>
                            <button
                              type="button"
                              aria-current={active ? "true" : undefined}
                              onClick={() => choose(t.key)}
                              className={cn(
                                "flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm md:min-h-9 md:rounded-lg",
                                active ? "bg-secondary font-bold" : "hover:bg-secondary/60",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate">{t.label}</span>
                              {customised ? (
                                <>
                                  <CustomisedDot />
                                  <span className="sr-only">Customised</span>
                                </>
                              ) : null}
                              <ChevronRight
                                className="size-4 shrink-0 text-muted-foreground md:hidden"
                                aria-hidden
                              />
                            </button>
                          </li>
                        );
                      })}
                    </GroupedBlock>
                  </div>
                ))}
              </nav>
            )}

            {selected && (!isPhone || showEditorOnPhone) ? (
              <div className="min-w-0">
                {isPhone ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (editorDirty) {
                        setPendingKey("");
                        return;
                      }
                      setSelectedKey(null);
                    }}
                    className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    All messages
                  </button>
                ) : null}
                <TemplateEditor
                  key={selected.key}
                  template={selected}
                  canEdit={canEdit}
                  onDirtyChange={onDirtyChange}
                />
              </div>
            ) : null}
          </div>
        )}
      </section>

      <AlertDialog
        open={pendingKey !== null}
        onOpenChange={(open) => {
          if (!open) setPendingKey(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this message. Switching now loses them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSelectedKey(pendingKey === "" ? null : pendingKey);
                setEditorDirty(false);
                setPendingKey(null);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPage>
  );
}

function RemindersSection({ canEdit }: { canEdit: boolean }) {
  const tenant = useTenant();
  const smsCredits = useSmsCreditsSummary();
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  const rules = tenant.configuration?.reminders?.rules ?? [];
  const sorted = [...rules].sort((a, b) => b.minutesBefore - a.minutesBefore);
  const summary =
    sorted.length === 0
      ? "No automatic reminders"
      : sorted
          .map(
            (r) =>
              `${describeOffset(r.minutesBefore)} by ${CHANNEL_LABELS[r.channel].toLowerCase()}`,
          )
          .join(" · ");

  const editor = (
    <BookingRemindersSetting hideHeader className="-mt-4 rounded-none border-0 p-0 sm:p-0" />
  );

  return (
    <SettingsSection
      id="messages-reminders"
      title="Reminders"
      help={`Automatic nudges before each ${tenant.terminology.booking.toLowerCase()}. Changes apply to upcoming ${tenant.terminology.booking.toLowerCase()}s straight away; anything already sent is never repeated.`}
      aside={
        <StatusPill tone={sorted.length > 0 ? "mint" : "grey"}>
          {sorted.length > 0 ? `${sorted.length} on` : "Off"}
        </StatusPill>
      }
    >
      <GroupedBlock>
        <SettingsRow
          label={summary}
          hint={
            sorted.length === 0
              ? `Add one to remind ${tenant.terminology.client.toLowerCase()}s before they're due.`
              : smsCredits.credits && smsCredits.level !== "unlimited"
                ? smsCredits.note
                : undefined
          }
        >
          <Button
            size="sm"
            variant={sorted.length === 0 && canEdit ? "default" : "outline"}
            onClick={() => setOpen(true)}
          >
            {canEdit ? (sorted.length === 0 ? "Add reminder" : "Edit timing") : "View"}
          </Button>
        </SettingsRow>
      </GroupedBlock>
      {smsCredits.credits && smsCredits.level === "low" ? (
        <p className="text-xs text-warning-foreground dark:text-amber">
          Text credits are running low.{" "}
          <Link to="/billing/sms-credits" className="underline underline-offset-2">
            Text credits
          </Link>
        </p>
      ) : null}

      {isPhone ? (
        <BottomSheet open={open} onOpenChange={setOpen}>
          <BottomSheetContent aria-describedby={undefined}>
            <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <BottomSheetTitle className="text-base font-semibold">
                Reminder timing
              </BottomSheetTitle>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </header>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {editor}
            </div>
          </BottomSheetContent>
        </BottomSheet>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
            <SheetHeader className="space-y-1 border-b px-5 py-4 pr-12 text-left">
              <SheetTitle>Reminder timing</SheetTitle>
              <SheetDescription>
                When reminders go out before each {tenant.terminology.booking.toLowerCase()}, and by
                which channel.
              </SheetDescription>
            </SheetHeader>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{editor}</div>
          </SheetContent>
        </Sheet>
      )}
    </SettingsSection>
  );
}
