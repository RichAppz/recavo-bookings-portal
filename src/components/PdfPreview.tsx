import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Maximize2, Minus, Plus } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isNativeApp } from "@/lib/native";
import { PDF_MAX_ZOOM, PDF_MIN_ZOOM, nextZoom } from "@/lib/pdf-zoom";
import { cn } from "@/lib/utils";

/**
 * Draws a PDF page by page onto canvases with pdf.js. Desktop browsers would show a
 * PDF in an `<iframe>` with their built-in viewer, but iOS WKWebView (the app) and
 * mobile Safari leave a blob-URL PDF iframe blank, and Android WebView can't show
 * PDFs inline at all — so the pages are rendered here instead, the same way
 * everywhere. pdf.js (~1 MB) is loaded only when a preview is first opened.
 *
 * The inline preview fits the page to its box, which in a narrow window or a side
 * drawer is a thumbnail. Tapping a page (or Enlarge) opens the same document full
 * screen with zoom steps; each step re-renders the pages at that size so the text
 * is sharp rather than a stretched bitmap.
 */
export function PdfPreview({
  blob,
  title,
  className,
}: {
  blob: Blob;
  title: string;
  className?: string;
}) {
  const doc = usePdfDocument(blob);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState<number>(1);

  return (
    <>
      <div className={cn("relative", className)}>
        <PdfPages
          doc={doc}
          title={title}
          zoom={1}
          className="h-full w-full rounded-xl border bg-muted"
          onPageClick={() => setExpanded(true)}
        />
        {doc.state === "ready" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute top-3 right-3 shadow-sm"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 className="size-4" /> Enlarge
          </Button>
        ) : null}
      </div>

      <Dialog
        open={expanded}
        onOpenChange={(open) => {
          setExpanded(open);
          if (!open) setZoom(1);
        }}
      >
        <DialogContent
          data-testid="pdf-lightbox"
          className="inset-0 left-0 w-screen max-w-none gap-0 border-0 p-0 sm:max-w-none data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Enlarged preview. Use the zoom buttons to look closer.
          </DialogDescription>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-background px-safe-4 pt-safe-3 pb-3 pr-14">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Zoom out"
                disabled={zoom === PDF_MIN_ZOOM}
                onClick={() => setZoom((z) => nextZoom(z, -1))}
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-14 text-center text-sm tabular-nums" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Zoom in"
                disabled={zoom === PDF_MAX_ZOOM}
                onClick={() => setZoom((z) => nextZoom(z, 1))}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {zoom !== 1 ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setZoom(1)}>
                Fit width
              </Button>
            ) : null}
            {/* The browser's own PDF viewer is the sharpest option on a desktop; the
                apps have no such viewer, so they keep to the in-page canvas. */}
            {!isNativeApp() ? <OpenInNewTab blob={blob} /> : null}
          </div>
          <PdfPages
            doc={doc}
            title={title}
            zoom={zoom}
            className="min-h-0 flex-1 bg-neutral-900"
            centre
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function OpenInNewTab({ blob }: { blob: Blob }) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <Button asChild size="sm" variant="ghost" className="ml-auto">
      <a href={url} target="_blank" rel="noreferrer">
        <ExternalLink className="size-4" /> Open in new tab
      </a>
    </Button>
  );
}

type LoadedDoc =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; pdf: PDFDocumentProxy; pages: number };

/** Parses the blob once; both the inline preview and the enlarged view draw from it. */
function usePdfDocument(blob: Blob): LoadedDoc {
  const [doc, setDoc] = useState<LoadedDoc>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDoc({ state: "loading" });
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const data = new Uint8Array(await blob.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        loaded = pdf;
        setDoc({ state: "ready", pdf, pages: pdf.numPages });
      } catch {
        if (!cancelled) setDoc({ state: "error" });
      }
    })();
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [blob]);
  return doc;
}

function PdfPages({
  doc,
  title,
  zoom,
  className,
  centre,
  onPageClick,
}: {
  doc: LoadedDoc;
  title: string;
  zoom: number;
  className?: string;
  /** Centre pages that are narrower than the box (the enlarged view). */
  centre?: boolean;
  onPageClick?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const clickable = Boolean(onPageClick);
  const onPageClickRef = useRef(onPageClick);
  onPageClickRef.current = onPageClick;

  // Measure the box, and again when it resizes (window, drawer, orientation).
  useLayoutEffect(() => {
    const el = host.current?.parentElement;
    if (!el) return;
    const measure = () => setBoxWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const container = host.current;
    if (!container || doc.state !== "ready" || boxWidth === 0) return;
    let cancelled = false;
    const { pdf } = doc;
    // Fit the page to the box at zoom 1; render at device resolution so text stays
    // crisp, and let CSS scale the bitmap down to the CSS size.
    const width = Math.max(280, Math.floor((boxWidth - 18) * zoom));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    void (async () => {
      const canvases: HTMLCanvasElement[] = [];
      try {
        for (let n = 1; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${width}px`;
          canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
          canvas.className = cn("block shrink-0 bg-white shadow-sm", clickable && "cursor-zoom-in");
          canvas.setAttribute("role", clickable ? "button" : "img");
          canvas.setAttribute("aria-label", `${title}, page ${n} of ${pdf.numPages}`);
          if (clickable) {
            canvas.tabIndex = 0;
            canvas.title = "Click to enlarge";
          }
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas unsupported");
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          canvases.push(canvas);
        }
        container.replaceChildren(...canvases);
        setDrawn(true);
      } catch {
        // The document loaded, so a draw failure is transient (e.g. unmount mid-render).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, boxWidth, zoom, title, clickable]);

  const busy = doc.state === "loading" || (doc.state === "ready" && !drawn);

  return (
    <div
      className={cn("relative overflow-auto overscroll-contain", className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName === "CANVAS") onPageClickRef.current?.();
      }}
      onKeyDown={(e) => {
        if (
          (e.key === "Enter" || e.key === " ") &&
          (e.target as HTMLElement).tagName === "CANVAS" &&
          onPageClickRef.current
        ) {
          e.preventDefault();
          onPageClickRef.current();
        }
      }}
    >
      <div
        ref={host}
        className={cn(
          "flex min-w-fit flex-col gap-3 p-2",
          centre ? "mx-auto items-center" : "items-center",
        )}
      />
      {busy ? (
        <p
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted-foreground"
          aria-live="polite"
        >
          Preparing preview…
        </p>
      ) : null}
      {doc.state === "error" ? (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-4 text-center text-sm text-destructive">
          Couldn't show the preview here. Download the PDF to open it instead.
        </p>
      ) : null}
      {doc.state === "ready" && doc.pages > 1 ? <p className="sr-only">{doc.pages} pages</p> : null}
    </div>
  );
}
