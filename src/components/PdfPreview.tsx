import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Draws a PDF page by page onto canvases with pdf.js. Desktop browsers would show a
 * PDF in an `<iframe>` with their built-in viewer, but iOS WKWebView (the app) and
 * mobile Safari leave a blob-URL PDF iframe blank, and Android WebView can't show
 * PDFs inline at all — so the pages are rendered here instead, the same way
 * everywhere. pdf.js (~1 MB) is loaded only when a preview is first opened.
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
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const container = host.current;
    if (!container) return;
    container.replaceChildren();
    setState("loading");

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const data = new Uint8Array(await blob.arrayBuffer());
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        setPages(doc.numPages);
        // Fit the page to the container's width; render at device resolution so text
        // stays crisp on a phone, and let CSS scale it down to fit.
        const width = Math.max(280, container.clientWidth - 2);
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${width}px`;
          canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
          canvas.className = "block bg-white shadow-sm";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${title}, page ${n} of ${doc.numPages}`);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas unsupported");
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
          if (n === 1) setState("ready");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob, title]);

  return (
    <div
      className={cn(
        "relative overflow-auto overscroll-contain rounded-xl border bg-muted",
        className,
      )}
    >
      <div ref={host} className="flex flex-col items-center gap-3 p-2" />
      {state === "loading" ? (
        <p
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted-foreground"
          aria-live="polite"
        >
          Preparing preview…
        </p>
      ) : null}
      {state === "error" ? (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-4 text-center text-sm text-destructive">
          Couldn't show the preview here. Download the PDF to open it instead.
        </p>
      ) : null}
      {state === "ready" && pages > 1 ? <p className="sr-only">{pages} pages</p> : null}
    </div>
  );
}
