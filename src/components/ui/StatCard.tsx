import { cn } from "@/lib/cn";

export type StatCardVariant = "default" | "highlight" | "dark";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  /** Main value, rendered large with tabular figures. */
  value: React.ReactNode;
  /** Icon in a small disc at the top right. */
  icon?: React.ReactNode;
  /** Variation shown in the footer pill, e.g. « +4 » or « −2 ». */
  delta?: string;
  /** Direction of the variation, which picks the pill colour. */
  deltaTone?: "up" | "down" | "neutral";
  /** Footer text, after the pill. */
  footer?: string;
  /**
   * `default` (veil), `dark` (ink) or `highlight` (accent gradient).
   * Rule: **one `highlight` per screen at most** — it marks the single figure that matters.
   */
  variant?: StatCardVariant;
}

const variantClasses: Record<
  StatCardVariant,
  { root: string; label: string; icon: string; footer: string }
> = {
  default: {
    root: "bg-veil text-ink",
    label: "text-muted",
    icon: "bg-surface text-ink",
    footer: "text-muted",
  },
  highlight: {
    root: "bg-accent-gradient text-white",
    label: "text-white/85",
    icon: "bg-white/20 text-white",
    footer: "text-white/85",
  },
  dark: {
    root: "bg-ink text-white",
    label: "text-white/70",
    icon: "bg-white/10 text-white",
    footer: "text-white/70",
  },
};

function deltaClasses(variant: StatCardVariant, tone: NonNullable<StatCardProps["deltaTone"]>) {
  if (variant !== "default") return "bg-white/20 text-white";
  if (tone === "up") return "bg-ok-soft text-ok-ink";
  if (tone === "down") return "bg-danger-soft text-danger-ink";
  return "bg-surface text-ink-2";
}

/**
 * Key figure card: label, icon, big value, footer with a variation pill.
 */
export function StatCard({
  label,
  value,
  icon,
  delta,
  deltaTone = "neutral",
  footer,
  variant = "default",
  className,
  ...rest
}: StatCardProps) {
  const styles = variantClasses[variant];
  return (
    <div
      className={cn("flex flex-col gap-4 rounded-card p-5 sm:p-6", styles.root, className)}
      data-variant={variant}
      {...rest}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-small font-medium", styles.label)}>{label}</p>
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-pill [&>svg]:size-4",
              styles.icon,
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="text-figure tabular-nums">{value}</p>
      {(delta ?? footer) && (
        <div className={cn("flex flex-wrap items-center gap-2 text-small", styles.footer)}>
          {delta && (
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-pill px-2 font-medium tabular-nums",
                deltaClasses(variant, deltaTone),
              )}
            >
              {delta}
            </span>
          )}
          {footer && <span>{footer}</span>}
        </div>
      )}
    </div>
  );
}
