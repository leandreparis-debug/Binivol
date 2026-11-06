import Link from "next/link";
import { Search } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Logo } from "@/components/ui/Logo";
import type { ShellProps } from "./types";
import { BellMenu } from "./BellMenu";
import { UserMenu } from "./UserMenu";

export { badgeLabel } from "./SideNav";

/**
 * Sticky top bar of the content area (direction « Galet »): the logo on a
 * phone (the side navigation carries it from 640 px), a pill search that
 * opens the directory with the typed text (when the directory is allowed),
 * notifications and the user pill (name and profiles) with its menu.
 */
export function TopBar({ user, unreadNotifications, allowedHrefs }: ShellProps) {
  const canSearch = allowedHrefs.includes("/benevoles");
  return (
    <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
      <div className="mx-auto flex h-20 max-w-app items-center justify-between gap-3 px-gutter sm:px-6">
        <Link
          href="/"
          className="inline-flex h-11 shrink-0 items-center rounded-control focus-ring sm:hidden"
          aria-label="Binivol, accueil"
        >
          <Logo size={22} decorative />
        </Link>
        {canSearch ? (
          <form
            action="/benevoles"
            role="search"
            aria-label="Rechercher un bénévole"
            className="relative hidden max-w-md flex-1 md:block"
          >
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-5 size-[18px] -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              name="q"
              aria-label="Nom, prénom ou NIVOL"
              placeholder="Rechercher un bénévole, un NIVOL…"
              className="h-12 w-full rounded-control bg-surface pr-5 pl-12 text-[16px] text-ink focus-ring placeholder:text-muted sm:text-body"
            />
          </form>
        ) : (
          <span className="hidden md:block" />
        )}
        <div className="flex items-center gap-2">
          {canSearch && (
            <IconButton asChild aria-label="Rechercher un bénévole" variant="surface">
              <Link href="/benevoles" className="md:hidden">
                <Search className="size-5" />
              </Link>
            </IconButton>
          )}
          <BellMenu unread={unreadNotifications} />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
