import { cn } from "@/lib/cn";
import { niceMax } from "./HatchedBarChart";

export interface FlowDatum {
  label: string;
  arrivals: number;
  departures: number;
  /** The current month: its arrivals bar is in accent. */
  current?: boolean;
}

export interface FlowChartProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  title: string;
  data: FlowDatum[];
  /** Heading level of the title. Default 3. */
  level?: 3 | 4;
  /** Height of the plot area in pixels. Default 150. */
  height?: number;
}

/**
 * Arrivals and departures per month, side by side, drawn by hand (no chart
 * library): arrivals in ink (the current month in accent), departures hatched
 * ink (pattern reserved to data), never told by colour alone — the legend
 * names both, a sentence sums them up for screen readers and the figures,
 * with the balance, sit in a table that unfolds.
 */
export function FlowChart({
  title,
  data,
  level = 3,
  height = 150,
  className,
  ...rest
}: FlowChartProps) {
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.arrivals, d.departures])));
  const Heading = level === 3 ? "h3" : "h4";
  const totalIn = data.reduce((s, d) => s + d.arrivals, 0);
  const totalOut = data.reduce((s, d) => s + d.departures, 0);
  const summary = `${String(totalIn)} arrivée${totalIn > 1 ? "s" : ""} et ${String(totalOut)} départ${totalOut > 1 ? "s" : ""} sur la période, solde ${totalIn - totalOut >= 0 ? "+" : ""}${String(totalIn - totalOut)}. ${data
    .map((d) => `${d.label} : ${String(d.arrivals)} / ${String(d.departures)}`)
    .join(" ; ")}.`;
  return (
    <figure className={cn("flex flex-col gap-3", className)} {...rest}>
      <figcaption className="flex flex-col gap-1">
        <Heading className="text-body font-semibold text-ink">{title}</Heading>
        <span className="sr-only">{summary}</span>
      </figcaption>
      <div
        aria-hidden="true"
        className="grid items-end gap-1 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${String(data.length)}, minmax(0, 1fr))`, height }}
      >
        {data.map((d) => (
          <div key={d.label} className="flex h-full items-end justify-center gap-0.5">
            <span
              className={cn(
                "w-1/2 max-w-4 origin-bottom animate-grow rounded-t-bar",
                d.current ? "bg-accent" : "bg-ink",
              )}
              style={{ height: `${String((d.arrivals / max) * 100)}%` }}
            />
            <span
              className="w-1/2 max-w-4 origin-bottom animate-grow rounded-t-bar bg-hatch-ink"
              style={{ height: `${String((d.departures / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="grid gap-1 text-[11px] text-muted sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${String(data.length)}, minmax(0, 1fr))` }}
      >
        {data.map((d) => (
          <span key={d.label} className="truncate text-center">
            {d.label.split(" ")[0]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-small text-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-bar bg-ink" />
          Arrivées
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-bar bg-accent" />
          Mois en cours
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-bar bg-hatch-ink" />
          Départs
        </span>
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
                Mois
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Arrivées
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Départs
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Solde
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-line">
                <th scope="row" className="py-1 font-normal text-ink">
                  {d.label}
                </th>
                <td className="py-1 text-right tabular-nums">{d.arrivals}</td>
                <td className="py-1 text-right tabular-nums">{d.departures}</td>
                <td className="py-1 text-right tabular-nums">
                  {d.arrivals - d.departures > 0 ? "+" : ""}
                  {d.arrivals - d.departures}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
