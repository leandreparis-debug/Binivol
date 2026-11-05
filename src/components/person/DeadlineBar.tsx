import { cn } from "@/lib/cn";
import type { DeadlineClass } from "@/lib/deadlines";

const SEGMENTS: { key: DeadlineClass; label: string; className: string }[] = [
  { key: "ok", label: "À jour", className: "bg-hatch-ink" },
  { key: "soon", label: "À échéance", className: "bg-warn" },
  { key: "expired", label: "Expirées", className: "bg-danger" },
  { key: "none", label: "Sans date", className: "bg-hatch-track" },
];

/**
 * Hatched bar summarising the qualifications of a person: up to date, due
 * soon, expired, without date. Data, so hatching is allowed; each segment is
 * also named in the legend with its count (never colour alone).
 */
export function DeadlineBar({
  counts,
  className,
}: {
  counts: Record<DeadlineClass, number>;
  className?: string;
}) {
  const total = SEGMENTS.reduce((n, s) => n + counts[s.key], 0);
  const summary = SEGMENTS.map((s) => `${s.label} : ${String(counts[s.key])}`).join(", ");
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        role="img"
        aria-label={`Qualifications — ${summary}`}
        className="flex h-4 w-full overflow-hidden rounded-pill bg-veil"
      >
        {total > 0 &&
          SEGMENTS.filter((s) => counts[s.key] > 0).map((s) => (
            <span
              key={s.key}
              className={cn("h-full", s.className)}
              style={{ width: `${String((counts[s.key] / total) * 100)}%` }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-small text-ink" aria-hidden="true">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2">
            <span className={cn("size-3 rounded-[4px]", s.className)} />
            {s.label} <span className="font-mono text-mono">{counts[s.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
