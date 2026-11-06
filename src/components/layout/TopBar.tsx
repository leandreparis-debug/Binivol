import Link from "next/link";
import { Search } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { IconButton } from "@/components/ui/IconButton";
import { Logo } from "@/components/ui/Logo";
import type { ShellProps } from "./types";
import { BellMenu } from "./BellMenu";
import { UserMenu } from "./UserMenu";

export { badgeLabel } from "./SideNav";

/**
 * Sticky top bar of the content area: the logo on a phone (the side
 * navigation carries it from 640 px), then search, notifications, the user's
 * profiles (from 1280 px) and the user menu with sign-out.
 */
export function TopBar({ user, unreadNotifications }: ShellProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
      <div className="mx-auto flex h-16 max-w-app items-center justify-between gap-3 px-gutter sm:px-6">
        <Link
          href="/"
          className="inline-flex h-11 shrink-0 items-center rounded-control focus-ring sm:hidden"
          aria-label="Binivol, accueil"
        >
          <Logo size={22} decorative />
        </Link>
        <span className="hidden sm:block" />
        <div className="flex items-center gap-2">
          <ul className="hidden items-center gap-1.5 2xl:flex" aria-label="Mes profils">
            {user.profiles.map((profile) => (
              <li key={profile}>
                <Chip tone="neutral">{profile.replace("_", " ")}</Chip>
              </li>
            ))}
          </ul>
          <IconButton aria-label="Rechercher" variant="outline">
            <Search className="size-5" />
          </IconButton>
          <BellMenu unread={unreadNotifications} />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
