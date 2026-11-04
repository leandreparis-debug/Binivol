import { cn } from "@/lib/cn";

export interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  /** Diameter in pixels. Default 16. */
  size?: number;
}

/**
 * Loading indicator (ring). Decorative: the parent carries `aria-busy`.
 */
export function Spinner({ size = 16, className, ...rest }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn("animate-spin motion-reduce:animate-none", className)}
      {...rest}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
