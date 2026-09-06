import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import {
  importCustomersBatch,
  useBusinessId,
  useInvalidateCustomers,
  type CustomerImportBody,
  type CustomerImportRowResult,
} from "@/lib/api/hooks";
import { ApiError } from "@/lib/api";
import { parseCsv, toCsv, type CsvTable } from "@/lib/customers/csv";
import {
  autoMap,
  buildImportRow,
  IMPORT_TARGETS,
  mappingHasName,
  TARGET_LABELS,
  TEMPLATE_COLUMNS,
  TEMPLATE_EXAMPLE_ROW,
  type ColumnMapping,
  type ImportRow,
  type ImportTarget,
} from "@/lib/customers/import-mapping";
import { PERMISSIONS } from "@/lib/permissions";
import { Can } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/clients/import")({
  head: () => ({
    meta: [
      { title: "Import clients — RECAVO" },
      {
        name: "description",
        content: "Bring your client list across from another system with a CSV upload.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <Can
          permission={PERMISSIONS.CUSTOMER_CREATE}
          fallback={
            <EmptyState
              title="You can't import clients"
              description="Ask the business owner for the customer.create permission."
            />
          }
        >
          <ImportPage />
        </Can>
      </AppShell>
    </RequireAuth>
  ),
});

type Step = "upload" | "map" | "check" | "import" | "done";
type DuplicateStrategy = NonNullable<CustomerImportBody["duplicateStrategy"]>;

const BATCH_SIZE = 200;
const SKIP = "__skip__";

function downloadFile(filename: string, contents: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportPage() {
  const businessId = useBusinessId();
  const navigate = useNavigate();
  const invalidateCustomers = useInvalidateCustomers();

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [strategy, setStrategy] = useState<DuplicateStrategy>("skip");
  const [preview, setPreview] = useState<CustomerImportRowResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<CustomerImportRowResult[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const rows: ImportRow[] = useMemo(
    () => (table ? table.rows.map((r) => buildImportRow(r, mapping)) : []),
    [table, mapping],
  );
  const source = fileName ? `CSV import: ${fileName}` : "CSV import";

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      toast.error("That file has no data rows", {
        description: "The first row must be column headings, followed by one client per row.",
      });
      return;
    }
    setFileName(file.name);
    setTable(parsed);
    setMapping(autoMap(parsed.headers));
    setPreview(null);
    setStep("map");
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const all: CustomerImportRowResult[] = [];
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        const slice = rows.slice(start, start + BATCH_SIZE);
        const res = await importCustomersBatch(businessId, {
          rows: slice,
          dryRun: true,
          duplicateStrategy: strategy,
          source,
        });
        all.push(...res.results.map((r) => ({ ...r, index: r.index + start })));
      }
      setPreview(all);
      setStep("check");
    } catch (err) {
      toast.error("Couldn't check the file", {
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setChecking(false);
    }
  };

  const runImport = async () => {
    setStep("import");
    setImportError(null);
    setProgress(0);
    const all: CustomerImportRowResult[] = [];
    // One key per batch, fixed for this run, so a retry of a failed batch replays instead
    // of importing the same people twice.
    const runId = crypto.randomUUID();
    try {
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        const slice = rows.slice(start, start + BATCH_SIZE);
        const key = `customer-import:${runId}:${start}`;
        let res;
        try {
          res = await importCustomersBatch(
            businessId,
            { rows: slice, duplicateStrategy: strategy, source },
            key,
          );
        } catch (first) {
          // A dropped connection mid-batch: retry once with the same key.
          if (first instanceof ApiError && first.status >= 500) {
            res = await importCustomersBatch(
              businessId,
              { rows: slice, duplicateStrategy: strategy, source },
              key,
            );
          } else {
            throw first;
          }
        }
        all.push(...res.results.map((r) => ({ ...r, index: r.index + start })));
        setProgress(Math.min(100, Math.round(((start + slice.length) / rows.length) * 100)));
      }
      setResults(all);
      invalidateCustomers();
      setStep("done");
    } catch (err) {
      setResults(all);
      setImportError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong part-way through. Rows already imported are kept.",
      );
      setStep("done");
    }
  };

  const summarise = (list: CustomerImportRowResult[]) => ({
    created: list.filter((r) => r.status === "created" || r.status === "would_create").length,
    updated: list.filter((r) => r.status === "updated" || r.status === "would_update").length,
    skipped: list.filter((r) => r.status === "skipped" || r.status === "would_skip").length,
    failed: list.filter((r) => r.status === "failed").length,
    warnings: list.filter((r) => r.warnings.length > 0).length,
  });

  const downloadIssues = (list: CustomerImportRowResult[]) => {
    if (!table) return;
    const issues = list.filter((r) => r.status === "failed" || r.warnings.length > 0);
    const csv = toCsv(
      ["Row", "Outcome", "Problem", ...table.headers],
      issues.map((r) => [
        r.index + 2, // 1-based, plus the header row, so it matches the spreadsheet
        r.status,
        [...r.errors.map((e) => `${e.field}: ${e.message ?? e.code}`), ...r.warnings].join(" | "),
        ...(table.rows[r.index] ?? []),
      ]),
    );
    downloadFile("client-import-issues.csv", csv);
  };

  return (
    <>
      <PageHeader
        title="Import clients"
        description="Upload a CSV from a spreadsheet or another booking system. Nothing is saved until you confirm."
        actions={
          <Button variant="ghost" asChild>
            <Link to="/clients">
              <ArrowLeft className="size-4" /> Back to clients
            </Link>
          </Button>
        }
      />

      <Steps current={step} />

      {step === "upload" ? (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <SectionCard
            title="1. Upload your file"
            description="CSV only, one client per row, headings in the first row."
          >
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void onFile(f);
              }}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors hover:border-primary hover:bg-secondary/40"
            >
              <FileUp className="size-8 text-muted-foreground" />
              <span className="font-medium">Drop a CSV here or click to choose</span>
              <span className="text-xs text-muted-foreground">
                Exports from other systems are fine — you'll match the columns on the next step.
              </span>
            </button>
          </SectionCard>
          <SectionCard
            title="Starting from scratch?"
            description="Use our template so no mapping is needed."
          >
            <Button
              variant="outline"
              onClick={() =>
                downloadFile(
                  "recavo-clients-template.csv",
                  toCsv(
                    TEMPLATE_COLUMNS.map((c) => c.header),
                    [TEMPLATE_EXAMPLE_ROW],
                  ),
                )
              }
            >
              <Download className="size-4" /> Download template
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Only <strong>First name</strong> is required. Delete the example row before you
              import.
            </p>
          </SectionCard>
        </div>
      ) : null}

      {step === "map" && table ? (
        <MapStep
          table={table}
          mapping={mapping}
          onMapping={setMapping}
          rows={rows}
          strategy={strategy}
          onStrategy={setStrategy}
          checking={checking}
          onBack={() => setStep("upload")}
          onCheck={runCheck}
        />
      ) : null}

      {step === "check" && preview && table ? (
        <SectionCard
          title="3. Check before importing"
          description={`${table.rows.length} rows from ${fileName ?? "your file"}. Nothing has been saved yet.`}
        >
          <Summary counts={summarise(preview)} dryRun />
          <IssueList results={preview} table={table} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setStep("map")}>
              Back to mapping
            </Button>
            {preview.some((r) => r.status === "failed" || r.warnings.length > 0) ? (
              <Button variant="outline" onClick={() => downloadIssues(preview)}>
                <Download className="size-4" /> Download issues
              </Button>
            ) : null}
            <Button
              onClick={runImport}
              disabled={summarise(preview).created + summarise(preview).updated === 0}
            >
              <Upload className="size-4" /> Import{" "}
              {summarise(preview).created + summarise(preview).updated} clients
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {step === "import" ? (
        <SectionCard title="Importing…" description="Keep this tab open until it finishes.">
          <Progress value={progress} />
          <p className="mt-2 text-sm text-muted-foreground">{progress}%</p>
        </SectionCard>
      ) : null}

      {step === "done" && table ? (
        <SectionCard title="Import finished" description={fileName ?? undefined}>
          {importError ? (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{importError}</span>
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-600" /> All batches processed.
            </div>
          )}
          <Summary counts={summarise(results)} />
          <IssueList results={results} table={table} />
          <div className="mt-4 flex flex-wrap gap-2">
            {results.some((r) => r.status === "failed" || r.warnings.length > 0) ? (
              <Button variant="outline" onClick={() => downloadIssues(results)}>
                <Download className="size-4" /> Download issues
              </Button>
            ) : null}
            <Button onClick={() => void navigate({ to: "/clients" })}>View clients</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setTable(null);
                setFileName(null);
                setPreview(null);
                setResults([]);
                setImportError(null);
                setStep("upload");
              }}
            >
              Import another file
            </Button>
          </div>
        </SectionCard>
      ) : null}
    </>
  );
}

function Steps({ current }: { current: Step }) {
  const order: { id: Step; label: string }[] = [
    { id: "upload", label: "Upload" },
    { id: "map", label: "Match columns" },
    { id: "check", label: "Check" },
    { id: "done", label: "Import" },
  ];
  const activeIndex = current === "import" ? 3 : order.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {order.map((s, i) => (
        <li
          key={s.id}
          className={`rounded-full px-3 py-1 ${
            i === activeIndex
              ? "bg-primary text-primary-foreground"
              : i < activeIndex
                ? "bg-secondary text-foreground"
                : "bg-secondary/50 text-muted-foreground"
          }`}
        >
          {i + 1}. {s.label}
        </li>
      ))}
    </ol>
  );
}

function MapStep({
  table,
  mapping,
  onMapping,
  rows,
  strategy,
  onStrategy,
  checking,
  onBack,
  onCheck,
}: {
  table: CsvTable;
  mapping: ColumnMapping;
  onMapping: (m: ColumnMapping) => void;
  rows: ImportRow[];
  strategy: DuplicateStrategy;
  onStrategy: (s: DuplicateStrategy) => void;
  checking: boolean;
  onBack: () => void;
  onCheck: () => void;
}) {
  const used = new Set(Object.values(mapping).filter((t): t is ImportTarget => t !== null));
  const hasName = mappingHasName(mapping);
  const previewRows = rows.slice(0, 5);
  const mappedCount = used.size;

  return (
    <div className="grid gap-4">
      <SectionCard
        title="2. Match your columns"
        description={`${table.headers.length} columns found, ${mappedCount} matched automatically. Set anything we got wrong, or choose "Don't import".`}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {table.headers.map((header, index) => {
            const sample = table.rows.find((r) => (r[index] ?? "").trim())?.[index] ?? "";
            const value = mapping[index] ?? null;
            return (
              <div key={index} className="grid gap-1.5 rounded-lg border p-3">
                <Label className="truncate text-sm font-medium" title={header}>
                  {header || <span className="text-muted-foreground">(blank heading)</span>}
                </Label>
                <p className="truncate text-xs text-muted-foreground" title={sample}>
                  e.g. {sample || "—"}
                </p>
                <Select
                  value={value ?? SKIP}
                  onValueChange={(v) =>
                    onMapping({ ...mapping, [index]: v === SKIP ? null : (v as ImportTarget) })
                  }
                >
                  <SelectTrigger className={value ? "" : "text-muted-foreground"}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SKIP}>Don't import</SelectItem>
                    {IMPORT_TARGETS.map((t) => (
                      <SelectItem key={t} value={t} disabled={used.has(t) && value !== t}>
                        {TARGET_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
        {!hasName ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" /> Map a column to First name or Full name — every
            client needs a name.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Preview" description="The first five rows as they will be imported.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Known as</th>
                <th className="px-2 py-1">Email</th>
                <th className="px-2 py-1">Phone</th>
                <th className="px-2 py-1">Postcode</th>
                <th className="px-2 py-1">Tags</th>
                <th className="px-2 py-1">Vehicle</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1">
                    {[r.firstName, r.lastName].filter(Boolean).join(" ") || (
                      <span className="text-destructive">missing</span>
                    )}
                  </td>
                  <td className="px-2 py-1">{r.nickname ?? "—"}</td>
                  <td className="px-2 py-1">{r.email ?? "—"}</td>
                  <td className="px-2 py-1">{r.phone ?? "—"}</td>
                  <td className="px-2 py-1">{r.address?.postcode ?? "—"}</td>
                  <td className="px-2 py-1">{r.tags?.join(", ") ?? "—"}</td>
                  <td className="px-2 py-1">
                    {r.vehicle
                      ? [r.vehicle.registration, r.vehicle.make, r.vehicle.model]
                          .filter(Boolean)
                          .join(" ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="If a client already exists"
        description="We match on email or phone number against clients you already have (and within the file)."
      >
        <div className="grid gap-2 sm:max-w-md">
          <Label htmlFor="dup">Duplicates</Label>
          <Select value={strategy} onValueChange={(v) => onStrategy(v as DuplicateStrategy)}>
            <SelectTrigger id="dup">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skip">Skip them — keep my existing record</SelectItem>
              <SelectItem value="update">Update my record with the file's details</SelectItem>
              <SelectItem value="create">Import anyway as a new client</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onBack}>
            Choose a different file
          </Button>
          <Button onClick={onCheck} disabled={!hasName || checking}>
            {checking ? "Checking…" : `Check ${rows.length} rows`}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

function Summary({
  counts,
  dryRun,
}: {
  counts: { created: number; updated: number; skipped: number; failed: number; warnings: number };
  dryRun?: boolean;
}) {
  const tiles = [
    { label: dryRun ? "Will be added" : "Added", value: counts.created },
    { label: dryRun ? "Will be updated" : "Updated", value: counts.updated },
    { label: dryRun ? "Will be skipped" : "Skipped", value: counts.skipped },
    { label: "Can't import", value: counts.failed, bad: counts.failed > 0 },
    { label: "With warnings", value: counts.warnings },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{t.label}</p>
          <p className={`text-2xl font-semibold ${t.bad ? "text-destructive" : ""}`}>{t.value}</p>
        </div>
      ))}
    </div>
  );
}

function IssueList({ results, table }: { results: CustomerImportRowResult[]; table: CsvTable }) {
  const issues = results.filter((r) => r.status === "failed" || r.warnings.length > 0);
  if (issues.length === 0) return null;
  const shown = issues.slice(0, 25);
  const nameOf = (index: number) => {
    const row = table.rows[index] ?? [];
    return row.find((c) => c.trim())?.trim() ?? `row ${index + 2}`;
  };
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium">
        {issues.length} {issues.length === 1 ? "row needs" : "rows need"} attention
      </p>
      <ul className="divide-y rounded-lg border text-sm">
        {shown.map((r) => (
          <li key={r.index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-2">
            <span className="text-xs text-muted-foreground">Row {r.index + 2}</span>
            <span className="font-medium">{nameOf(r.index)}</span>
            <span className={r.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
              {[
                ...r.errors.map(
                  (e) =>
                    `${TARGET_LABELS[e.field as ImportTarget] ?? e.field}: ${describeCode(e.code)}`,
                ),
                ...r.warnings,
              ].join(" · ")}
            </span>
          </li>
        ))}
        {issues.length > shown.length ? (
          <li className="p-2 text-xs text-muted-foreground">
            …and {issues.length - shown.length} more. Download the issues file for the full list.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function describeCode(code: string): string {
  switch (code) {
    case "REQUIRED":
      return "is required";
    case "INVALID":
      return "isn't valid";
    case "TOO_BIG":
      return "is too long";
    default:
      return code.toLowerCase().replace(/_/g, " ");
  }
}
