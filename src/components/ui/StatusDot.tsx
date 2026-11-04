import { cn } from "@/lib/cn";
import { getStatus, type Status, type Tone } from "@/lib/status";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** A volunteer status or a deadline status (see `src/lib/status.ts`). */
  status: Status;
  /** Overrides the default label (rarely needed). The label is never empty. */
  label?: string;
}

export const dotToneClasses: Record<Tone, string> = {
  neutral: "bg-muted",
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  ink: "bg-ink",
};

/**
 * Coloured dot **and** label. Covers volunteer statuses and deadline statuses.
 */
export function StatusDot({ status, label, className, ...rest }: StatusDotProps) {
  const meta = getStatus(status);
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-small text-ink", className)}
      data-status={status}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn("size-2.5 shrink-0 rounded-pill", dotToneClasses[meta.tone])}
      />
      <span>{label ?? meta.label}</span>
    </span>
  );
}
