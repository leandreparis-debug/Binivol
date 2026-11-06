import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/status";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Colour tone. Default `neutral`. */
  tone?: Tone;
  /** Optional icon placed before the text. */
  icon?: React.ReactNode;
}

export const chipToneClasses: Record<Tone, string> = {
  neutral: "bg-veil text-ink-2",
  accent: "bg-accent-soft text-accent-ink",
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  danger: "bg-danger-soft text-danger-ink",
  ink: "bg-ink text-white",
};

/**
 * Small pill-shaped label. Text is always present: colour alone never carries meaning.
 */
export function Chip({ tone = "neutral", icon, className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-mark px-2.5 text-small font-medium whitespace-nowrap",
        chipToneClasses[tone],
        className,
      )}
      {...rest}
    >
      {icon && <span className="inline-flex shrink-0 [&>svg]:size-3.5">{icon}</span>}
      {children}
    </span>
  );
}
