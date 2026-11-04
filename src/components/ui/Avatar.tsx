import { cn } from "@/lib/cn";
import { initials } from "@/lib/initials";

export type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  firstName?: string | null;
  lastName?: string | null;
  /** Default `md` (36 px). */
  size?: AvatarSize;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-small",
  lg: "size-14 text-section",
};

/**
 * Initials in a round veil disc with a hairline border.
 * The full name is exposed as the accessible label.
 */
export function Avatar({ firstName, lastName, size = "md", className, ...rest }: AvatarProps) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  return (
    <span
      role="img"
      aria-label={fullName || "Avatar"}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill border border-line bg-veil font-semibold text-ink-2 select-none",
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true">{initials(firstName, lastName)}</span>
    </span>
  );
}
