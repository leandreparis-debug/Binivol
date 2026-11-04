"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { PROFILE_LABELS, type DevUser } from "@/lib/dev-user";

export interface UserMenuProps {
  user: DevUser;
}

/**
 * User pill (avatar, name, profile) opening a dropdown. The items are
 * placeholders until authentication lands at step 3.
 */
export function UserMenu({ user }: UserMenuProps) {
  const profiles = user.profiles.map((p) => PROFILE_LABELS[p]);
  const shortProfiles = user.profiles.join(" · ");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 max-w-full cursor-pointer items-center gap-2 rounded-pill border border-line bg-surface py-1 pr-3 pl-1 text-left focus-ring transition-colors hover:bg-veil motion-reduce:transition-none"
        >
          <Avatar firstName={user.firstName} lastName={user.lastName} size="md" />
          <span className="hidden min-w-0 flex-col leading-tight lg:flex">
            <span className="truncate text-small font-semibold text-ink">
              {user.firstName} {user.lastName}
            </span>
            <span className="truncate text-[11px] text-muted">{shortProfiles}</span>
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted" />
          <span className="sr-only">Menu utilisateur</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block font-medium text-ink">
            {user.firstName} {user.lastName}
          </span>
          {profiles.map((p) => (
            <span key={p} className="block">
              {p}
            </span>
          ))}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserRound />
          Mon profil
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <LogOut />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
