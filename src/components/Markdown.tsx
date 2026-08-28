import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Styled explicitly rather than via `prose`, since the Tailwind typography
 * plugin isn't installed. Raw HTML is intentionally not enabled: policy bodies
 * are operator-authored and, in the seeded documents, carry HTML comments that
 * should never reach the page.
 */
const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mt-4 text-base font-semibold text-foreground first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-4 text-sm font-semibold text-foreground first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 text-sm font-medium text-foreground first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mt-2 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-2 border-l-2 pl-3 italic">{children}</blockquote>
  ),
  hr: () => <hr className="my-4" />,
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b px-2 py-1 font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b px-2 py-1 align-top">{children}</td>,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-sm leading-relaxed", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
