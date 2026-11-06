import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "accent" | "soft" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual role. `primary` (ink) is the default: black acts, the accent signals. */
  variant?: ButtonVariant;
  /** `md` (44 px) is the default and the minimum for touch targets. `sm` is for dense tables only. */
  size?: ButtonSize;
  /** Disables the button, sets `aria-busy` and shows a spinner in place of the left icon. */
  loading?: boolean;
  /** Renders the child element instead of a `<button>` (Radix Slot), e.g. a Next `Link`. */
  asChild?: boolean;
  /** Icon placed before the label. */
  leftIcon?: React.ReactNode;
  /** Icon placed after the label. */
  rightIcon?: React.ReactNode;
}

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2 active:bg-ink",
  accent: "bg-accent text-white hover:bg-accent-ink active:bg-accent",
  soft: "bg-veil text-ink hover:bg-line active:bg-veil",
  outline: "bg-surface text-ink border border-ink hover:bg-veil active:bg-surface",
  ghost: "bg-transparent text-ink hover:bg-veil active:bg-transparent",
};

export const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-small gap-1.5",
  md: "h-11 px-5 text-body gap-2",
  lg: "h-12 px-6 text-body gap-2",
};

export const buttonBaseClasses =
  "focus-ring inline-flex shrink-0 cursor-pointer select-none items-center justify-center rounded-control font-medium whitespace-nowrap transition-[color,background-color,border-color,transform] duration-150 press disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";

/**
 * Button of the direction « Galet » (ADR-066): a pill; `primary` ink on white text,
 * `outline` (secondary) white with a 1 px ink border. Pressed: scale 0.97
 * (none under reduced motion). Supports `asChild` to render a link.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    asChild = false,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  const classes = cn(
    buttonBaseClasses,
    buttonVariantClasses[variant],
    buttonSizeClasses[size],
    className,
  );

  if (asChild) {
    return (
      <Slot ref={ref} className={classes} aria-busy={loading || undefined} {...rest}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === "sm" ? 14 : 16} />
      ) : (
        leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
      )}
      {children}
      {rightIcon && !loading && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </button>
  );
});
