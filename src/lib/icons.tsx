import { icons, Sparkles, type LucideProps } from "lucide-react";

/**
 * Resolve a data-driven icon name (e.g. from an industry dataset) to a
 * lucide-react component. Falls back to Sparkles for unknown names.
 */
export function resolveIcon(name?: string) {
  if (!name) return Sparkles;
  return (icons as Record<string, React.ComponentType<LucideProps>>)[name] ?? Sparkles;
}

export function DataIcon({ name, ...props }: { name?: string } & LucideProps) {
  const Icon = resolveIcon(name);
  return <Icon {...props} />;
}
