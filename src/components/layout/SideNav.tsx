"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { isActivePath } from "./activePath";
import { NAV_ITEMS, type NavHref } from "./navigation";

/**
 * Main navigation of the direction « Galet » (ADR-066): a white panel that
 * floats on the canvas (radius 28), with labels from 1024 px and a compact
 * rail (icon and short label) from 640 px; under 640 px, `BottomNav` takes
 * over. The active entry is an ink pill with white text and carries
 * `aria-current="page"`. With `canImport`, an ink card at the bottom of the
 * sidebar leads to the workbook import (simulation first).
 */
export function SideNav({
  allowedHrefs,
  navBadges,
  canImport = false,
}: {
  allowedHrefs: NavHref[];
  navBadges?: Partial<Record<NavHref, number>>;
  canImport?: boolean;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => allowedHrefs.includes(item.href));
  return (
    <aside className="fixed top-5 bottom-5 left-5 z-40 hidden w-20 flex-col gap-6 overflow-y-auto rounded-panel bg-surface py-5 sm:flex lg:w-60 lg:px-3">
      <Link
        href="/"
        aria-label="Binivol, accueil"
        className="flex h-12 shrink-0 items-center justify-center rounded-inner focus-ring lg:justify-start lg:px-3"
      >
        <Logo variant="mark" size={40} decorative className="lg:hidden" />
        <Logo size={28} decorative className="hidden lg:block" />
      </Link>
      <nav aria-label="Navigation principale" className="flex flex-col gap-2 px-2 lg:px-0">
        <p className="hidden px-4 pb-1 eyebrow text-muted lg:block">Menu</p>
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
                    "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-inner px-1 py-2 text-[11px] font-medium focus-ring transition-colors duration-150 motion-reduce:transition-none",
                    "lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-control lg:px-4 lg:py-0 lg:text-body",
                    active ? "bg-ink text-white" : "text-ink hover:bg-veil",
                  )}
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  <span>{label}</span>
                  {count > 0 && (
                    <>
                      <span
                        aria-hidden="true"
                        className="absolute top-1 right-2 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger px-1.5 text-[11px] font-semibold text-white lg:static lg:ml-auto lg:h-6 lg:min-w-6"
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
      {canImport && (
        <div className="mt-auto hidden flex-col gap-3 rounded-[22px] bg-ink p-5 text-white lg:flex">
          <span
            aria-hidden="true"
            className="inline-flex size-10 items-center justify-center rounded-[12px] bg-accent text-white"
          >
            <FileSpreadsheet className="size-5" />
          </span>
          <p className="font-display text-[18px] leading-[22px] font-bold tracking-[-0.02em]">
            Importer le classeur de l&apos;UL
          </p>
          <p className="text-small text-white/80">
            Simulation d&apos;abord : rien n&apos;est écrit sans votre accord.
          </p>
          <Link
            href="/admin/import"
            className="inline-flex min-h-11 press items-center justify-center rounded-control bg-white px-4 text-small font-semibold text-ink focus-ring"
          >
            Lancer une simulation
          </Link>
        </div>
      )}
    </aside>
  );
}

/** Spoken meaning of the « Candidats » badge. */
export function badgeLabel(count: number): string {
  return `${String(count)} relance${count > 1 ? "s" : ""} en retard`;
}
