import { cn } from "@/lib/cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icon shown in a round veil disc. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Optional call to action (a `Button`). */
  action?: React.ReactNode;
}

/**
 * Centered placeholder for an empty list or a section not available yet.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card bg-surface px-6 py-12 text-center",
        className,
      )}
      {...rest}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="inline-flex size-12 items-center justify-center rounded-pill bg-veil text-muted [&>svg]:size-6"
        >
          {icon}
        </span>
      )}
      <p className="text-section text-ink">{title}</p>
      {description && <p className="max-w-md text-body text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
