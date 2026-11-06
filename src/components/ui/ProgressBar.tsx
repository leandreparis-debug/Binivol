import { cn } from "@/lib/cn";

export interface ProgressBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Current value, clamped to `[0, max]`. */
  value: number;
  /** Default 100. */
  max?: number;
  /** Accessible name (mandatory): what is progressing. */
  label: string;
  /** Shows « value / max » (or a custom text) next to the bar. */
  valueText?: string;
  showValue?: boolean;
}

/** Clamps a value into `[0, max]`; NaN becomes 0. */
export function clampProgress(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), max);
}

/**
 * Hatched track with an accent fill. Exposes `role="progressbar"` with the
 * clamped value.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  showValue = false,
  className,
  ...rest
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = clampProgress(value, safeMax);
  const percent = Math.round((clamped / safeMax) * 100);
  const text = valueText ?? `${percent} %`;
  return (
    <div className={cn("flex items-center gap-3", className)} {...rest}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        aria-valuetext={text}
        className="h-2.5 flex-1 overflow-hidden rounded-bar bg-hatch-track"
      >
        <div
          className="h-full rounded-bar bg-accent transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      {showValue && <span className="text-small text-muted tabular-nums">{text}</span>}
    </div>
  );
}
