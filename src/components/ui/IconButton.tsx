import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";

export type IconButtonVariant = "outline" | "ink" | "accent";

export interface IconButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> {
  /** Accessible name — mandatory, the button has no visible text. */
  "aria-label": string;
  /** Visual role. Default `outline`. */
  variant?: IconButtonVariant;
  /** Renders the child element instead of a `<button>` (Radix Slot). */
  asChild?: boolean;
  /** The icon (a `lucide-react` icon, typically 20 px). */
  children: React.ReactNode;
}

const variantClasses: Record<IconButtonVariant, string> = {
  outline: "bg-surface text-ink border border-line hover:bg-veil",
  ink: "bg-ink text-white hover:bg-ink-2",
  accent: "bg-accent text-white hover:bg-accent-ink",
};

/**
 * Round 44 × 44 px button for a single icon. `aria-label` is required by the type.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "outline", asChild = false, className, children, type, ...rest },
  ref,
) {
  const classes = cn(
    "relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control focus-ring transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
    variantClasses[variant],
    className,
  );
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...rest}>
        {children}
      </Slot>
    );
  }
  return (
    <button ref={ref} type={type ?? "button"} className={classes} {...rest}>
      {children}
    </button>
  );
});
