"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { isActivePath } from "@/components/ui/NavPills";
import { NAV_ITEMS, type NavHref } from "./navigation";

/**
 * Bottom navigation shown under 640 px, limited to the entries the policy allows.
 */
export function BottomNav({ allowedHrefs }: { allowedHrefs: NavHref[] }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => allowedHrefs.includes(item.href));
  return (
    <nav
      aria-label="Navigation principale (mobile)"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      data-testid="bottom-nav"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium focus-ring",
                  active ? "text-ink" : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-7 w-11 items-center justify-center rounded-pill transition-colors motion-reduce:transition-none",
                    active && "bg-ink text-white",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
