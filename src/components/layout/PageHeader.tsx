import { cn } from "@/lib/cn";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  /** Right-side actions. */
  actions?: React.ReactNode;
}

/** Page title block: display title, optional subtitle and actions. */
export function PageHeader({ title, subtitle, actions, className, ...rest }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)} {...rest}>
      <div className="min-w-0">
        <h1 className="text-title text-ink sm:text-display">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
