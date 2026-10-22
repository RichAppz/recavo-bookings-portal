import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import {
  GroupedBlock,
  ReadOnlyNotice,
  SettingsEmptyState,
  SettingsPage,
  SettingsSection,
  StatusPill,
  SwitchRow,
} from "@/components/settings/primitives";
import { StatusBadge } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  isAiPolicyDraftUnavailable,
  useAiDraftPolicies,
  useCreatePolicyDocument,
  useCurrentPolicyDocument,
  useLatestPrivacyNotice,
  usePolicyDocuments,
  usePublishPolicyDocument,
  usePublishPrivacyNotice,
  useSeedPolicyDefaults,
} from "@/lib/api/hooks";
import type { AiPolicyDraftResponse, PolicyDocument, PolicyDocumentType } from "@/lib/api/types";
import { markdownToPlainText, parsePolicyContent } from "@/lib/markdown";
import { PERMISSIONS } from "@/lib/permissions";
import { POLICY_TYPES, POLICY_TYPE_META, formatIndustry, policyLabel } from "@/lib/settings-labels";
import { useTenant } from "@/lib/tenant/tenant-context";

function docTone(status: string): "grey" | "mint" | "amber" {
  if (status === "published") return "mint";
  if (status === "draft") return "amber";
  return "grey";
}

/**
 * Settings → Policies (spec §6): one list of documents with status pills, AI /
 * template actions, a draft editor, the current wording, and the privacy notice
 * (the old Privacy tab) as the last section — reachable as `#privacy`.
 */
export function PoliciesPage({ assist = false }: { assist?: boolean }) {
  const tenant = useTenant();
  const canEdit = tenant.can(PERMISSIONS.BUSINESS_UPDATE);
  const docs = usePolicyDocuments();
  const createDoc = useCreatePolicyDocument();
  const publishDoc = usePublishPolicyDocument();
  const seed = useSeedPolicyDefaults();
  const [type, setType] = useState<PolicyDocumentType>("cancellation");
  const [content, setContent] = useState("");
  const [publishNow, setPublishNow] = useState(false);
  const [showAssist, setShowAssist] = useState(assist);

  useEffect(() => {
    if (assist) setShowAssist(true);
  }, [assist]);

  const current = useCurrentPolicyDocument(type);
  const { reviewStatus: currentReview, body: currentBody } = parsePolicyContent(
    current.data?.content,
  );

  const seedDefaults = async () => {
    const result = await seed.mutateAsync();
    toast.success("Defaults seeded", {
      description: `Published ${result.published.length}, skipped ${result.skipped.length}.`,
    });
  };

  const list = docs.data ?? [];

  return (
    <SettingsPage
      title="Policies"
      description="The documents clients agree to when they book."
      banner={canEdit ? null : <ReadOnlyNotice />}
    >
      <SettingsSection
        id="policies-documents"
        title="Documents"
        help="Published documents are shown to clients at checkout and linked from their emails. Drafts are only visible here."
        aside={
          canEdit && list.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {!showAssist ? (
                <Button size="sm" variant="outline" onClick={() => setShowAssist(true)}>
                  <Sparkles className="size-4" /> Draft with AI
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={seed.isPending}
                onClick={() => void seedDefaults()}
              >
                Use our templates
              </Button>
            </div>
          ) : null
        }
      >
        {list.length === 0 ? (
          <SettingsEmptyState
            title="No policies yet"
            description="Start from our templates, or answer a few questions and let AI draft cancellation and terms for you."
            action={
              canEdit ? (
                <>
                  <Button size="sm" onClick={() => setShowAssist(true)}>
                    <Sparkles className="size-4" /> Draft with AI
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={seed.isPending}
                    onClick={() => void seedDefaults()}
                  >
                    Use our templates
                  </Button>
                </>
              ) : null
            }
          />
        ) : (
          <GroupedBlock as="ul">
            {list.map((doc) => {
              const reviewStatus = parsePolicyContent(doc.content).reviewStatus;
              const summary =
                POLICY_TYPE_META[doc.type]?.description ||
                markdownToPlainText(doc.content).slice(0, 120) ||
                "No content";
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 basis-56 text-left"
                    onClick={() => setType(doc.type)}
                    aria-label={`Show ${policyLabel(doc.type)}`}
                  >
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">{policyLabel(doc.type)}</span>
                      <span className="text-xs text-muted-foreground">Version {doc.version}</span>
                    </p>
                    <p className="text-[13px] leading-snug text-muted-foreground">{summary}</p>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {reviewStatus ? <StatusBadge status={reviewStatus} /> : null}
                    <StatusPill tone={docTone(doc.status)}>
                      {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                    </StatusPill>
                    {doc.status === "draft" && canEdit ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={publishDoc.isPending}
                        onClick={async () => {
                          await publishDoc.mutateAsync({ documentId: doc.id });
                          toast.success("Policy published");
                        }}
                      >
                        Publish
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </GroupedBlock>
        )}
      </SettingsSection>

      {canEdit && showAssist ? <AiAssistSection onHide={() => setShowAssist(false)} /> : null}

      {canEdit ? (
        <SettingsSection
          id="policies-draft"
          title="Write a draft"
          help="Markdown is fine. Publish straight away, or keep it as a draft to review first."
        >
          <div className="grid gap-2">
            <Label htmlFor="policy-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PolicyDocumentType)}>
              <SelectTrigger id="policy-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLICY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {POLICY_TYPE_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{POLICY_TYPE_META[type].description}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="policy-content">Wording</Label>
            <Textarea
              id="policy-content"
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <GroupedBlock>
            <SwitchRow
              id="policy-publish-now"
              label="Publish immediately"
              hint="Off keeps it as a draft you can publish from the list above."
              checked={publishNow}
              onCheckedChange={setPublishNow}
            />
          </GroupedBlock>
          <Button
            className="w-fit"
            disabled={createDoc.isPending || !content.trim()}
            onClick={async () => {
              await createDoc.mutateAsync({ type, content: content.trim(), publish: publishNow });
              toast.success(publishNow ? "Policy published" : "Draft created");
              setContent("");
            }}
          >
            {publishNow ? "Publish" : "Create draft"}
          </Button>
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="policies-current"
        title={`Current ${policyLabel(type).toLowerCase()}`}
        help={POLICY_TYPE_META[type]?.description}
      >
        {!current.data ? (
          <p className="text-sm text-muted-foreground">No published document.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Version {current.data.version}</span>
              <StatusPill tone={docTone(current.data.status)}>
                {current.data.status.charAt(0).toUpperCase() + current.data.status.slice(1)}
              </StatusPill>
              {currentReview ? <StatusBadge status={currentReview} /> : null}
            </div>
            {currentReview === "pending_counsel_review" ? (
              <p className="text-xs text-muted-foreground">
                Placeholder wording from the RECAVO template. Have it checked by a solicitor before
                you rely on it.
              </p>
            ) : null}
            <Markdown className="max-h-[32rem] overflow-y-auto rounded-[14px] border bg-secondary/30 p-4 text-muted-foreground">
              {currentBody || "—"}
            </Markdown>
          </div>
        )}
      </SettingsSection>

      <PrivacyNoticeSection canEdit={canEdit} />
    </SettingsPage>
  );
}

function AiAssistSection({ onHide }: { onHide: () => void }) {
  const tenant = useTenant();
  const config = tenant.configuration;
  const aiDraft = useAiDraftPolicies();
  const publishDoc = usePublishPolicyDocument();
  const seed = useSeedPolicyDefaults();
  const [aiResult, setAiResult] = useState<AiPolicyDraftResponse | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [businessName, setBusinessName] = useState(
    tenant.business?.tradingName || tenant.business?.legalName || "",
  );
  const [cancelHours, setCancelHours] = useState(
    String(config?.booking?.cancellationWindowHours ?? 24),
  );
  const [lateCancelNotes, setLateCancelNotes] = useState("50% of session fee");
  const [refundNotes, setRefundNotes] = useState("Unused packs transferable within 30 days");
  const [locale, setLocale] = useState(tenant.business?.locale || "en-GB");
  const [industryHint, setIndustryHint] = useState(
    tenant.business?.industryTemplateKey
      ? formatIndustry(tenant.business.industryTemplateKey).toLowerCase()
      : "personal training",
  );

  useEffect(() => {
    setBusinessName(tenant.business?.tradingName || tenant.business?.legalName || "");
    setLocale(tenant.business?.locale || "en-GB");
    setIndustryHint(
      tenant.business?.industryTemplateKey
        ? formatIndustry(tenant.business.industryTemplateKey).toLowerCase()
        : "personal training",
    );
  }, [
    tenant.business?.tradingName,
    tenant.business?.legalName,
    tenant.business?.locale,
    tenant.business?.industryTemplateKey,
  ]);

  useEffect(() => {
    setCancelHours(String(config?.booking?.cancellationWindowHours ?? 24));
  }, [config?.booking?.cancellationWindowHours]);

  const generateAiDrafts = async () => {
    setAiUnavailable(false);
    try {
      const result = await aiDraft.mutateAsync({
        businessName: businessName.trim() || "Your business",
        cancellationWindowHours: Number(cancelHours) || 24,
        lateCancelNotes: lateCancelNotes.trim() || undefined,
        refundNotes: refundNotes.trim() || undefined,
        locale: locale.trim() || "en-GB",
        industryHint: industryHint.trim() || undefined,
      });
      setAiResult(result);
      toast.success("Drafts ready for review");
    } catch (err) {
      if (isAiPolicyDraftUnavailable(err)) {
        setAiUnavailable(true);
        toast.message("AI drafting isn’t available yet", {
          description:
            "Use our templates for standard cancellation and terms, or write a draft manually.",
        });
        return;
      }
    }
  };

  const publishAiDraft = async (doc: PolicyDocument) => {
    await publishDoc.mutateAsync({ documentId: doc.id });
    toast.success(`${doc.type} published`);
    setAiResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        drafts: { ...prev.drafts, [doc.type]: { ...doc, status: "published" as const } },
      };
    });
  };

  return (
    <SettingsSection
      id="policies-ai"
      title="Draft with AI"
      help="Answer a few questions and we’ll draft cancellation and terms policies for you to review. Nothing is published until you confirm."
      aside={
        <Button size="sm" variant="ghost" onClick={onHide}>
          Hide
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ai-biz">Business name</Label>
          <Input
            id="ai-biz"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ai-hours">Cancellation window (hours)</Label>
          <Input
            id="ai-hours"
            type="number"
            min={0}
            value={cancelHours}
            onChange={(e) => setCancelHours(e.target.value)}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="ai-late">Late cancel / no-show notes</Label>
          <Input
            id="ai-late"
            value={lateCancelNotes}
            onChange={(e) => setLateCancelNotes(e.target.value)}
            placeholder="e.g. 50% of session fee"
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="ai-refund">Refund / package notes</Label>
          <Input
            id="ai-refund"
            value={refundNotes}
            onChange={(e) => setRefundNotes(e.target.value)}
            placeholder="e.g. Unused packs transferable within 30 days"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ai-locale">Locale</Label>
          <Input
            id="ai-locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            placeholder="en-GB"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ai-industry">Industry</Label>
          <Input
            id="ai-industry"
            value={industryHint}
            onChange={(e) => setIndustryHint(e.target.value)}
            placeholder="personal training"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={aiDraft.isPending}
          onClick={() => void generateAiDrafts()}
        >
          <Sparkles className="size-4" />
          {aiDraft.isPending ? "Drafting… up to a minute" : "Draft with AI"}
        </Button>
        <Button
          variant="ghost"
          disabled={seed.isPending}
          onClick={async () => {
            const result = await seed.mutateAsync();
            toast.success("Defaults seeded", {
              description: `Published ${result.published.length}, skipped ${result.skipped.length}.`,
            });
          }}
        >
          Use our templates instead
        </Button>
      </div>
      {aiUnavailable ? (
        <p className="rounded-[14px] bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
          AI drafting isn’t enabled on this environment. Use{" "}
          <span className="font-medium text-foreground">our templates</span> for standard
          cancellation and terms, or write drafts manually below.
        </p>
      ) : null}
      {aiResult ? (
        <div className="space-y-4 rounded-[14px] border bg-secondary/30 p-4">
          <p className="text-xs text-muted-foreground">{aiResult.disclaimer}</p>
          <p className="text-[11px] text-muted-foreground">Model: {aiResult.model}</p>
          {(["cancellation", "terms"] as const).map((key) => {
            const doc = aiResult.drafts[key];
            const published = doc.status === "published";
            const draft = parsePolicyContent(doc.content);
            return (
              <div key={key} className="space-y-2 rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{policyLabel(key)}</p>
                    <StatusPill tone={docTone(doc.status)}>
                      {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                    </StatusPill>
                    {draft.reviewStatus ? <StatusBadge status={draft.reviewStatus} /> : null}
                  </div>
                  {!published ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={publishDoc.isPending}
                      onClick={() => void publishAiDraft(doc)}
                    >
                      Publish
                    </Button>
                  ) : null}
                </div>
                <Markdown className="max-h-48 overflow-y-auto text-muted-foreground">
                  {draft.body || "—"}
                </Markdown>
              </div>
            );
          })}
          {aiResult.drafts.cancellation.status === "draft" ||
          aiResult.drafts.terms.status === "draft" ? (
            <Button
              variant="outline"
              className="w-fit"
              disabled={publishDoc.isPending}
              onClick={async () => {
                for (const key of ["cancellation", "terms"] as const) {
                  const doc = aiResult.drafts[key];
                  if (doc.status === "draft") await publishAiDraft(doc);
                }
              }}
            >
              Publish both
            </Button>
          ) : (
            <p className="text-sm font-medium text-success-foreground dark:text-mint">
              Cancellation and terms are published.
            </p>
          )}
        </div>
      ) : null}
    </SettingsSection>
  );
}

function PrivacyNoticeSection({ canEdit }: { canEdit: boolean }) {
  const latest = useLatestPrivacyNotice();
  const publish = usePublishPrivacyNotice();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <SettingsSection
      id="privacy"
      title="Privacy notice"
      help="A versioned notice of its own, shown to clients when they sign up to your portal. Publishing a new one keeps every earlier version on record."
      aside={
        latest.data ? (
          <StatusPill tone="mint">v{latest.data.version} live</StatusPill>
        ) : (
          <StatusPill tone="grey">None yet</StatusPill>
        )
      }
    >
      {!latest.data ? (
        <p className="text-sm text-muted-foreground">No privacy notice published yet.</p>
      ) : (
        <div className="space-y-2 rounded-[14px] border bg-secondary/30 p-4 text-sm">
          <p className="font-medium">
            {latest.data.title} · v{latest.data.version}
          </p>
          <p className="text-xs text-muted-foreground">
            Published {new Date(latest.data.publishedAt).toLocaleString("en-GB")}
          </p>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
            {latest.data.body}
          </p>
        </div>
      )}
      {canEdit ? (
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="privacy-title">New notice title</Label>
            <Input id="privacy-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="privacy-body">Wording</Label>
            <Textarea
              id="privacy-body"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="w-fit"
            disabled={publish.isPending || !title.trim() || !body.trim()}
            onClick={async () => {
              await publish.mutateAsync({ title: title.trim(), body: body.trim() });
              toast.success("Privacy notice published");
              setTitle("");
              setBody("");
            }}
          >
            Publish notice
          </Button>
        </div>
      ) : null}
    </SettingsSection>
  );
}
