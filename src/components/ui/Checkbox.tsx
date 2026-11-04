import { forwardRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Visible label (mandatory). */
  label: React.ReactNode;
  /** Secondary line under the label. */
  hint?: string;
}

/**
 * Form checkbox: a real input, visually replaced, with its label. The whole
 * row is the click target (at least 44 px high).
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, className, disabled, ...props },
  ref,
) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-inner px-2 py-1.5 hover:bg-veil",
        disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
        className,
      )}
    >
      <input ref={ref} type="checkbox" className="peer sr-only" disabled={disabled} {...props} />
      <span
        aria-hidden="true"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border border-line bg-surface text-white peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 [&>svg]:hidden peer-checked:[&>svg]:block"
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      <span className="flex flex-col">
        <span className="text-body text-ink">{label}</span>
        {hint && <span className="text-small text-muted">{hint}</span>}
      </span>
    </label>
  );
});
