import { ArrowUpRight } from "lucide-react";
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
   * Shows an arrow in a disc at the top right: the card is the content of a
   * link (the link itself is the caller's). Ignored when `icon` is given.
   */
  arrow?: boolean;
  /**
   * `default` (white), `dark` (ink) or `highlight` (solid accent).
   * Rule: **one `highlight` per screen at most** — it marks the single figure that matters.
   */
  variant?: StatCardVariant;
}

const variantClasses: Record<
  StatCardVariant,
  { root: string; label: string; icon: string; arrow: string; footer: string }
> = {
  default: {
    root: "bg-surface text-ink",
    label: "text-ink-2",
    icon: "bg-veil text-ink",
    arrow: "border border-line text-ink",
    footer: "text-muted",
  },
  highlight: {
    // Solid accent: white text at 5.25:1 (a gradient to the pale accent-2 would fail).
    root: "bg-accent text-white",
    label: "text-white",
    icon: "bg-white/15 text-white",
    arrow: "bg-white text-ink",
    footer: "text-white",
  },
  dark: {
    root: "bg-ink text-white",
    label: "text-white/80",
    icon: "bg-white/10 text-white",
    arrow: "bg-white text-ink",
    footer: "text-white/80",
  },
};

function deltaClasses(variant: StatCardVariant, tone: NonNullable<StatCardProps["deltaTone"]>) {
  // On the solid accent, a white badge with accent-ink text (7.8:1); on ink, a translucent one.
  if (variant === "highlight") return "bg-white text-accent-ink";
  if (variant === "dark") return "bg-white/15 text-white";
  if (tone === "up") return "bg-ok-soft text-ok-ink";
  if (tone === "down") return "bg-danger-soft text-danger-ink";
  return "bg-veil text-ink";
}

/**
 * Key figure card (direction « Galet »): label, icon or arrow disc, big value
 * in Inter Tight, footer with a variation pill.
 */
export function StatCard({
  label,
  value,
  icon,
  delta,
  deltaTone = "neutral",
  footer,
  arrow = false,
  variant = "default",
  className,
  ...rest
}: StatCardProps) {
  const styles = variantClasses[variant];
  return (
    <div
      className={cn(
        "flex min-h-32 animate-rise flex-col gap-4 rounded-card p-5 sm:min-h-40 sm:p-6",
        styles.root,
        className,
      )}
      data-variant={variant}
      {...rest}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-body font-medium", styles.label)}>{label}</p>
        {!icon && arrow && (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-pill",
              styles.arrow,
            )}
          >
            <ArrowUpRight className="size-4" />
          </span>
        )}
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-control [&>svg]:size-4",
              styles.icon,
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-auto font-display text-figure tabular-nums">{value}</p>
      {(delta ?? footer) && (
        <div className={cn("flex flex-wrap items-center gap-2 text-small", styles.footer)}>
          {delta && (
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-pill px-2.5 font-semibold tabular-nums",
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
