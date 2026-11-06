import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * White surface, 24 px radius, no shadow: the card stands out from the canvas by contrast
 * only. It rises into place (0.6 s), never under reduced motion.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("animate-rise rounded-card bg-surface p-5 text-ink sm:p-6", className)}
      {...rest}
    />
  );
});

/** Header row of a card: title on the left, optional actions on the right. */
export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", className)}
      {...rest}
    />
  );
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Heading level. Default `h2`. */
  as?: "h1" | "h2" | "h3" | "h4";
}

/** Card title in the « section » type style. */
export function CardTitle({ as: Tag = "h2", className, ...rest }: CardTitleProps) {
  return <Tag className={cn("text-section text-ink", className)} {...rest} />;
}

/** Body of a card. */
export function CardContent({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-body text-ink", className)} {...rest} />;
}
