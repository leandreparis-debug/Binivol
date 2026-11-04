import { cn } from "@/lib/cn";

export interface HatchedBarDatum {
  label: string;
  /** Main series (ink). */
  primary: number;
  /** Secondary series stacked on top (accent hatch). */
  secondary?: number;
}

export interface HatchedBarChartProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  data: HatchedBarDatum[];
  /** Legend of the main series. */
  primaryLabel: string;
  /** Legend of the secondary series. */
  secondaryLabel?: string;
  /** Accessible title of the chart. */
  title: string;
  /** Height of the plot area in pixels. Default 160. */
  height?: number;
}

/** Picks a round upper bound for the axis (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ). */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => normalized <= s) ?? 10;
  return step * magnitude;
}

/**
 * Stacked bars without any chart library: the main value in ink, the
 * secondary one hatched in accent. Exposes `role="img"` and a textual summary.
 */
export function HatchedBarChart({
  data,
  primaryLabel,
  secondaryLabel,
  title,
  height = 160,
  className,
  ...rest
}: HatchedBarChartProps) {
  const totals = data.map((d) => d.primary + (d.secondary ?? 0));
  const max = niceMax(Math.max(0, ...totals));
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  const summary = data
    .map((d) => {
      const secondary =
        d.secondary !== undefined && secondaryLabel ? `, ${secondaryLabel} ${d.secondary}` : "";
      return `${d.label} : ${primaryLabel} ${d.primary}${secondary}`;
    })
    .join(" ; ");

  return (
    <figure
      role="img"
      aria-label={`${title}. ${summary}.`}
      className={cn("flex flex-col gap-3", className)}
      {...rest}
    >
      <div className="flex gap-3">
        <div
          className="flex shrink-0 flex-col justify-between text-right font-mono text-mono text-muted tabular-nums"
          style={{ height }}
          aria-hidden="true"
        >
          {[...ticks].reverse().map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height }} aria-hidden="true">
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <div key={t} className="h-px w-full bg-line" />
            ))}
          </div>
          <div className="absolute inset-0 flex items-end justify-around gap-2 px-2">
            {data.map((d) => {
              const primaryPct = (d.primary / max) * 100;
              const secondaryPct = ((d.secondary ?? 0) / max) * 100;
              return (
                <div key={d.label} className="flex h-full w-full max-w-12 flex-col justify-end">
                  {secondaryPct > 0 && (
                    <div
                      className="rounded-t-[6px] bg-hatch-accent"
                      style={{ height: `${secondaryPct}%` }}
                    />
                  )}
                  <div
                    className={cn("bg-ink", secondaryPct > 0 ? "" : "rounded-t-[6px]")}
                    style={{ height: `${primaryPct}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex gap-3 pl-9" aria-hidden="true">
        <div className="flex flex-1 justify-around gap-2 px-2">
          {data.map((d) => (
            <span key={d.label} className="w-full max-w-12 text-center text-small text-muted">
              {d.label}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center gap-4 text-small text-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-[3px] bg-ink" />
          {primaryLabel}
        </span>
        {secondaryLabel && (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-[3px] bg-hatch-accent" />
            {secondaryLabel}
          </span>
        )}
        <span className="sr-only">{summary}</span>
      </figcaption>
    </figure>
  );
}
