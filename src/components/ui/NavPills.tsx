"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface NavPillItem {
  href: string;
  label: string;
  /** Optional icon shown before the label. */
  icon?: React.ReactNode;
}

export interface NavPillsProps extends React.HTMLAttributes<HTMLElement> {
  items: NavPillItem[];
  /** Accessible name of the `<nav>`. Default « Navigation principale ». */
  label?: string;
}

/** `/` matches only itself; other hrefs match their sub-routes too. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Segmented pill navigation. The active item is ink with white text and
 * carries `aria-current="page"`. Scrolls horizontally when space is short.
 */
export function NavPills({
  items,
  label = "Navigation principale",
  className,
  ...rest
}: NavPillsProps) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className={cn(
        "max-w-full [scrollbar-width:none] overflow-x-auto overscroll-x-contain",
        className,
      )}
      {...rest}
    >
      <ul className="flex w-max items-center gap-1 rounded-pill bg-veil p-1">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-pill px-4 text-body font-medium whitespace-nowrap focus-ring transition-colors duration-150 motion-reduce:transition-none",
                  active ? "bg-ink text-white" : "text-ink-2 hover:bg-surface hover:text-ink",
                )}
              >
                {item.icon && (
                  <span className="inline-flex shrink-0 [&>svg]:size-4">{item.icon}</span>
                )}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
