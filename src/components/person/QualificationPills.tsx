import { cn } from "@/lib/cn";

export interface QualificationPillsProps extends React.HTMLAttributes<HTMLUListElement> {
  codes: string[];
  /** Number of other qualifications (« +N »). */
  extra?: number;
}

/** The main valid qualifications as mono pills, then « +N ». */
export function QualificationPills({
  codes,
  extra = 0,
  className,
  ...rest
}: QualificationPillsProps) {
  if (codes.length === 0) return <span className="text-small text-muted">Aucune</span>;
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label="Qualifications" {...rest}>
      {codes.map((code) => (
        <li
          key={code}
          className="inline-flex h-6 items-center rounded-mark bg-veil px-2 font-mono text-mono text-ink-2"
        >
          {code}
        </li>
      ))}
      {extra > 0 && (
        <li className="inline-flex h-6 items-center px-1 text-small text-muted">
          <span aria-hidden="true">+{extra}</span>
          <span className="sr-only">et {extra} autres</span>
        </li>
      )}
    </ul>
  );
}
