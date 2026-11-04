import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { BinivolLogo } from "@/components/brand/BinivolLogo";
import { IconButton } from "@/components/ui/IconButton";
import { NavPills } from "@/components/ui/NavPills";
import type { DevUser } from "@/lib/dev-user";
import { NAV_ITEMS } from "./navigation";
import { UserMenu } from "./UserMenu";

export interface TopBarProps {
  user: DevUser;
  /** Synthetic notification count shown in the badge. */
  notificationCount?: number;
}

/**
 * Sticky top bar: logo pill, segmented navigation, search, notifications and
 * the user menu. Under 1024 px the navigation drops below the bar; under
 * 640 px it is replaced by `BottomNav`.
 */
export function TopBar({ user, notificationCount = 0 }: TopBarProps) {
  const items = NAV_ITEMS.map(({ href, label }) => ({ href, label }));
  const badge = notificationCount > 9 ? "9+" : String(notificationCount);
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
      <div className="mx-auto flex max-w-app flex-col gap-3 px-gutter py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex h-11 shrink-0 items-center rounded-pill bg-surface pr-4 pl-2 focus-ring"
            aria-label="Binivol, accueil"
          >
            <BinivolLogo size={28} aria-hidden="true" role="presentation" />
          </Link>

          <div className="hidden lg:block">
            <NavPills items={items} />
          </div>

          <div className="flex items-center gap-2">
            <IconButton aria-label="Rechercher" variant="outline">
              <Search className="size-5" />
            </IconButton>
            <IconButton
              aria-label={`Notifications, ${notificationCount} non lue${notificationCount > 1 ? "s" : ""}`}
              variant="outline"
            >
              <Bell className="size-5" />
              {notificationCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-1 text-[11px] font-semibold text-white tabular-nums"
                >
                  {badge}
                </span>
              )}
            </IconButton>
            <UserMenu user={user} />
          </div>
        </div>

        <div className="hidden sm:block lg:hidden">
          <NavPills items={items} />
        </div>
      </div>
    </header>
  );
}
