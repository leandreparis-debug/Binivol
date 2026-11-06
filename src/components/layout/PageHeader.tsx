import { cn } from "@/lib/cn";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  /** Small line above the title (e.g. today's date on the home page). */
  eyebrow?: string;
  /** Right-side actions. */
  actions?: React.ReactNode;
}

/** Page title block: display title, optional subtitle and actions. */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
  ...rest
}: PageHeaderProps) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", className)} {...rest}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 text-body text-muted">{eyebrow}</p>}
        <h1 className="text-title text-ink sm:text-display">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
