import type { ReactNode } from "react";
import { Tooltip } from "recharts";

/** One row of a tooltip: a series, its colour and its value at the hovered point. */
export type ChartTooltipRow = {
  name?: ReactNode;
  value?: number | string | undefined;
  color?: string | undefined;
};

/**
 * The card a chart tooltip is drawn on, split out from {@link ChartTooltip} so it can be
 * rendered on its own.
 */
export function ChartTooltipCard({
  heading,
  rows,
  formatValue,
}: {
  heading?: string | null;
  rows: readonly ChartTooltipRow[];
  formatValue?: (value: number) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {heading ? <p className="mb-1.5 font-semibold">{heading}</p> : null}
      <ul className="grid gap-1">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-2">
            {row.color ? (
              // The hairline keeps a deliberately low-contrast series readable — the grey
              // capacity track on the occupancy chart is all but the card's own colour.
              <span
                className="size-2 shrink-0 rounded-full ring-1 ring-current/20 ring-inset"
                style={{ background: row.color }}
                aria-hidden
              />
            ) : null}
            {row.name ? <span className="text-muted-foreground">{row.name}</span> : null}
            <span className="ml-auto font-semibold tabular-nums">
              {formatValue ? formatValue(Number(row.value)) : String(row.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The hover tooltip for every chart in the app, drawn from the same tokens as the rest of
 * the interface.
 *
 * Recharts' own default is a hard-coded white box with a `#ccc` border and a label that
 * inherits the page's text colour. In dark mode that puts near-invisible light grey text
 * on white, and washes the hovered bar out with a pale grey slab. It also prints the raw
 * dataKey as the series name — "value : £991.00" — when the axis label underneath already
 * says which bar is being pointed at.
 */
export function ChartTooltip({
  formatValue,
}: {
  /** How to print the number: money, a count, a percentage. Defaults to the raw value. */
  formatValue?: (value: number) => string;
}) {
  return (
    <Tooltip
      // The bar under the cursor gets a wash in the theme's muted tone rather than the
      // built-in grey, which reads as a lighter bar of its own against a dark card. The
      // raw token, not the `--color-muted` alias: an alias resolves once on `:root`, so it
      // would hand dark mode the light value (see the chart rules in styles.css).
      cursor={{ fill: "var(--muted)", fillOpacity: 0.45 }}
      content={({ active, payload, label }) => {
        if (!active) return null;
        const rows = (payload ?? [])
          .filter((row) => row.type !== "none" && row.value != null)
          .map((row) => ({
            // A pie slice carries its own name; a bar keyed `value` has nothing to add to
            // the category already in the heading.
            name: typeof row.name === "string" && row.name !== "value" ? row.name : undefined,
            value: row.value as number | string | undefined,
            color: row.color,
          }));
        return (
          <ChartTooltipCard
            heading={label == null || label === "" ? null : String(label)}
            rows={rows}
            {...(formatValue ? { formatValue } : {})}
          />
        );
      }}
    />
  );
}
