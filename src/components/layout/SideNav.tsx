"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { isActivePath } from "./activePath";
import { NAV_ITEMS, type NavHref } from "./navigation";

/**
 * Main navigation of the direction « Suisse » (ADR-064), on white: a sidebar
 * with labels from 1024 px, a compact rail (icon and short label) from
 * 640 px; under 640 px, `BottomNav` takes over. The active entry is ink with
 * white text (radius 6) and carries `aria-current="page"`.
 */
export function SideNav({
  allowedHrefs,
  navBadges,
}: {
  allowedHrefs: NavHref[];
  navBadges?: Partial<Record<NavHref, number>>;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => allowedHrefs.includes(item.href));
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col border-r border-line bg-surface sm:flex lg:w-60">
      <Link
        href="/"
        aria-label="Binivol, accueil"
        className="flex h-16 shrink-0 items-center justify-center rounded-control focus-ring lg:justify-start lg:px-6"
      >
        <Logo variant="mark" size={36} decorative className="lg:hidden" />
        <Logo size={26} decorative className="hidden lg:block" />
      </Link>
      <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-2 py-4 lg:px-3">
        <ul className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href, true);
            const count = navBadges?.[href] ?? 0;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-mark px-1 py-2 text-[11px] font-medium focus-ring transition-colors duration-150 motion-reduce:transition-none",
                    "lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-0 lg:text-body",
                    active ? "bg-ink text-white" : "text-ink-2 hover:bg-veil hover:text-ink",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  <span>{label}</span>
                  {count > 0 && (
                    <>
                      <span
                        aria-hidden="true"
                        className="absolute top-1 right-2 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger px-1.5 text-[11px] font-semibold text-white lg:static lg:ml-auto"
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                      <span className="sr-only">, {badgeLabel(count)}</span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

/** Spoken meaning of the « Candidats » badge. */
export function badgeLabel(count: number): string {
  return `${String(count)} relance${count > 1 ? "s" : ""} en retard`;
}
