import { useId } from "react";
import { cn } from "@/lib/cn";

export interface BarDatum {
  label: string;
  /** Main series (ink). */
  primary: number;
  /** Secondary series, stacked after the main one (accent hatch). */
  secondary?: number;
  /** Optional text shown after the bar instead of the total (« 67 % »). */
  note?: string;
}

export interface BarChartProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  title: string;
  data: BarDatum[];
  primaryLabel: string;
  secondaryLabel?: string;
  /** Heading level of the title inside the figure. Default 3. */
  level?: 3 | 4;
}

/**
 * Horizontal bars drawn by hand in SVG (step 13, ADR-059): no chart library.
 * Accessible: a titled figure, a textual summary for screen readers, and the
 * data as a table in a disclosure. The secondary series is hatched (pattern
 * reserved to data), never told by colour alone: the legend names it.
 */
export function BarChart({
  title,
  data,
  primaryLabel,
  secondaryLabel,
  level = 3,
  className,
  ...rest
}: BarChartProps) {
  const id = useId().replace(/:/g, "");
  const max = Math.max(1, ...data.map((d) => d.primary + (d.secondary ?? 0)));
  const Heading = level === 3 ? "h3" : "h4";
  const summary = data
    .map(
      (d) =>
        `${d.label} : ${String(d.primary)} ${primaryLabel}${
          d.secondary !== undefined && secondaryLabel
            ? `, ${String(d.secondary)} ${secondaryLabel}`
            : ""
        }${d.note ? ` (${d.note})` : ""}`,
    )
    .join(" ; ");
  return (
    <figure className={cn("flex flex-col gap-3", className)} {...rest}>
      <figcaption className="flex flex-col gap-1">
        <Heading className="text-body font-semibold text-ink">{title}</Heading>
        <span className="sr-only">{summary}.</span>
      </figcaption>
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <defs>
          <pattern
            id={`hatch-${id}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" className="fill-accent-soft" />
            <line x1="0" y1="0" x2="0" y2="6" className="stroke-accent" strokeWidth="2.5" />
          </pattern>
        </defs>
      </svg>
      <ul className="flex flex-col gap-2" aria-hidden="true">
        {data.map((d) => {
          const p = (d.primary / max) * 100;
          const s = ((d.secondary ?? 0) / max) * 100;
          return (
            <li
              key={d.label}
              className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3"
            >
              <span className="truncate text-small text-ink-2">{d.label}</span>
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-4 w-full">
                <rect x="0" y="0" width="100" height="10" rx="2" className="fill-veil" />
                {p > 0 && <rect x="0" y="0" width={p} height="10" rx="2" className="fill-ink" />}
                {s > 0 && (
                  <rect x={p} y="0" width={s} height="10" rx="2" fill={`url(#hatch-${id})`} />
                )}
              </svg>
              <span className="min-w-8 text-right font-mono text-small text-ink tabular-nums">
                {d.note ?? String(d.primary + (d.secondary ?? 0))}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-4 text-small text-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-[3px] bg-ink" />
          {primaryLabel}
        </span>
        {secondaryLabel && (
          <span className="inline-flex items-center gap-2">
            <span className="size-3 rounded-[3px] bg-hatch-accent" />
            {secondaryLabel}
          </span>
        )}
      </div>
      <details className="text-small">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-ink-2 focus-ring">
          Voir les données
        </summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 font-medium">
                &nbsp;
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {primaryLabel}
              </th>
              {secondaryLabel && (
                <th scope="col" className="py-1 text-right font-medium">
                  {secondaryLabel}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-line">
                <th scope="row" className="py-1 font-normal text-ink">
                  {d.label}
                  {d.note ? ` (${d.note})` : ""}
                </th>
                <td className="py-1 text-right tabular-nums">{d.primary}</td>
                {secondaryLabel && (
                  <td className="py-1 text-right tabular-nums">{d.secondary ?? 0}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
