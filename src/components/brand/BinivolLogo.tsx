import { cn } from "@/lib/cn";
import { BinivolMark, type MarkVariant } from "./BinivolMark";

export interface BinivolLogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Height of the mark in pixels; the wordmark scales with it. Default 28. */
  size?: number;
  /** Variant passed to the mark. */
  variant?: MarkVariant;
  /** Hide the wordmark and keep only the symbol. */
  markOnly?: boolean;
}

/**
 * The symbol followed by the « Binivol » wordmark (Geist 600, tracking -0.03em).
 * The whole group carries one accessible name, the mark itself stays decorative.
 */
export function BinivolLogo({
  size = 28,
  variant,
  markOnly = false,
  className,
  ...rest
}: BinivolLogoProps) {
  const fontSize = Math.round(size * 0.78);
  return (
    <span
      className={cn("inline-flex items-center gap-2 whitespace-nowrap", className)}
      role="img"
      aria-label="Binivol"
      {...rest}
    >
      <BinivolMark size={size} variant={variant} />
      {!markOnly && (
        <span
          className={cn(
            "leading-none font-semibold tracking-[-0.03em]",
            variant === "inverse" ? "text-white" : "text-ink",
          )}
          style={{ fontSize }}
          aria-hidden="true"
        >
          Binivol
        </span>
      )}
    </span>
  );
}
