import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { DEADLINE_CLASS_LABELS, type DeadlineClass } from "@/lib/deadlines";
import { dotToneClasses } from "@/components/ui/StatusDot";

const TONE = { ok: "ok", soon: "warn", expired: "danger", none: "neutral" } as const;

export interface DeadlineDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  deadline: DeadlineClass;
  /** Last valid day, shown in mono after the label. */
  date?: Date | null;
  /** Prefix (a code), shown before the label. */
  code?: string;
}

/**
 * A deadline as a dot **and** a label (never colour alone): « À jour »,
 * « Échéance proche », « Expirée », « Sans date », with the date in mono.
 */
export function DeadlineDot({ deadline, date, code, className, ...rest }: DeadlineDotProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-small text-ink", className)}
      data-deadline={deadline}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn("size-2.5 shrink-0 rounded-pill", dotToneClasses[TONE[deadline]])}
      />
      <span>
        {code && <span className="font-mono text-mono">{code} · </span>}
        {DEADLINE_CLASS_LABELS[deadline]}
        {date && <span className="font-mono text-mono text-muted"> {formatDate(date)}</span>}
      </span>
    </span>
  );
}
