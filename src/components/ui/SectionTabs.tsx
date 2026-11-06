"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath } from "@/components/layout/activePath";
import { cn } from "@/lib/cn";

export interface SectionTabItem {
  href: string;
  label: string;
  /** Optional icon shown before the label. */
  icon?: React.ReactNode;
  /** Count shown as a danger badge after the label (0 hides it), with its spoken meaning. */
  badge?: { count: number; label: string };
  /** Active on this exact path only (a section's first tab, whose sub-routes are other tabs). */
  exact?: boolean;
}

export interface SectionTabsProps extends React.HTMLAttributes<HTMLElement> {
  items: SectionTabItem[];
  /** Accessible name of the `<nav>` (« Sections des formations »…). */
  label: string;
}

/**
 * Horizontal sub-navigation of a section (Formations, Rappels…): items on a
 * white band, the active one ink with white text and `aria-current="page"`,
 * 6 px radius. Scrolls horizontally when space is short. The main
 * navigation is `SideNav` (computer, tablet) and `BottomNav` (phone).
 */
export function SectionTabs({ items, label, className, ...rest }: SectionTabsProps) {
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
      <ul className="flex w-max items-center gap-1 rounded-control border border-line bg-surface p-1">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-mark px-4 text-body font-medium whitespace-nowrap focus-ring transition-colors duration-150 motion-reduce:transition-none",
                  active ? "bg-ink text-white" : "text-ink-2 hover:bg-veil hover:text-ink",
                )}
              >
                {item.icon && (
                  <span className="inline-flex shrink-0 [&>svg]:size-4">{item.icon}</span>
                )}
                {item.label}
                {item.badge && item.badge.count > 0 && (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger px-1.5 text-[11px] font-semibold text-white"
                    >
                      {item.badge.count > 99 ? "99+" : item.badge.count}
                    </span>
                    <span className="sr-only">, {item.badge.label}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
