import { cn } from "@/lib/cn";

export type DotState = "empty" | "hatched" | "filled";

export interface DotMatrixRow {
  label: string;
  cells: DotState[];
}

export interface DotMatrixProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  /** Column headers (days, typically). */
  columns: string[];
  rows: DotMatrixRow[];
  /** Accessible title. */
  title: string;
  /** Legend labels for each state. */
  legend?: Record<DotState, string>;
}

const DEFAULT_LEGEND: Record<DotState, string> = {
  empty: "Absent",
  hatched: "Partiel",
  filled: "Présent",
};

const dotClasses: Record<DotState, string> = {
  empty: "border border-line bg-surface",
  hatched: "bg-hatch-accent",
  filled: "bg-ink",
};

/**
 * Rows × days grid of dots: empty, hatched or filled, with a legend.
 * Rendered as a real table so screen readers get the structure.
 */
export function DotMatrix({
  columns,
  rows,
  title,
  legend = DEFAULT_LEGEND,
  className,
  ...rest
}: DotMatrixProps) {
  return (
    <figure className={cn("flex flex-col gap-3", className)} {...rest}>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-x-2 border-spacing-y-1.5">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                Ligne
              </th>
              {columns.map((c, i) => (
                <th
                  key={`${c}-${i}`}
                  scope="col"
                  className="text-center text-small font-medium text-muted"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="pr-2 text-left text-small font-medium whitespace-nowrap text-ink-2"
                >
                  {row.label}
                </th>
                {row.cells.map((state, i) => (
                  <td key={i} className="text-center">
                    <span
                      className={cn(
                        "inline-block size-4 rounded-pill align-middle",
                        dotClasses[state],
                      )}
                      role="img"
                      aria-label={legend[state]}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="flex flex-wrap items-center gap-4 text-small text-muted">
        {(Object.keys(legend) as DotState[]).map((state) => (
          <span key={state} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-3 rounded-pill", dotClasses[state])} />
            {legend[state]}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
