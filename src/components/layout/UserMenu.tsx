"use client";

import Link from "next/link";
import { useTransition } from "react";
import {
  ChevronDown,
  FileSpreadsheet,
  LogOut,
  ShieldCheck,
  UserRound,
  Mail,
  SlidersHorizontal,
  Download,
  LifeBuoy,
  Building2,
  ScrollText,
  Eraser,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { PROFILE_LABELS } from "@/lib/labels";
import { signOutAction } from "@/app/(app)/actions";
import type { ShellUser } from "./types";

export interface UserMenuProps {
  user: ShellUser;
}

function splitName(name: string): [string, string] {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return [first, rest.join(" ")];
}

/**
 * User pill (avatar, name, profiles) opening a menu: my account, account
 * management (TOPAZE) and sign-out.
 */
export function UserMenu({ user }: UserMenuProps) {
  const [pending, startTransition] = useTransition();
  const [first, last] = splitName(user.name);
  const shortProfiles = user.profiles.map((p) => p.replace("_", " ")).join(" · ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 max-w-full cursor-pointer items-center gap-2 rounded-pill border border-line bg-surface py-1 pr-3 pl-1 text-left focus-ring transition-colors hover:bg-veil motion-reduce:transition-none"
        >
          <Avatar firstName={first} lastName={last} size="md" />
          <span className="hidden min-w-0 flex-col leading-tight lg:flex">
            <span className="truncate text-small font-semibold text-ink">{user.name}</span>
            <span className="truncate text-[11px] text-muted">{shortProfiles}</span>
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted" />
          <span className="sr-only">Menu du compte</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <span className="block font-medium text-ink">{user.name}</span>
          <span className="block truncate">{user.email}</span>
          <span className="mt-2 flex flex-wrap gap-1.5" aria-label="Mes profils">
            {user.profiles.map((profile) => (
              <Chip key={profile} tone="ink" title={PROFILE_LABELS[profile]}>
                {profile.replace("_", " ")}
              </Chip>
            ))}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/moi">
            <UserRound />
            Mon compte et mes droits
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/aide">
            <LifeBuoy />
            Aide
          </Link>
        </DropdownMenuItem>
        {user.canManageAccounts && (
          <DropdownMenuItem asChild>
            <Link href="/admin/comptes">
              <ShieldCheck />
              Gérer les comptes
            </Link>
          </DropdownMenuItem>
        )}
        {user.canImport && (
          <DropdownMenuItem asChild>
            <Link href="/admin/import">
              <FileSpreadsheet />
              Importer le classeur
            </Link>
          </DropdownMenuItem>
        )}
        {user.canManageSettings && (
          <DropdownMenuItem asChild>
            <Link href="/admin/reglages">
              <SlidersHorizontal />
              Réglages
            </Link>
          </DropdownMenuItem>
        )}
        {user.canManageSettings && (
          <DropdownMenuItem asChild>
            <Link href="/admin/parametres">
              <Building2 />
              Paramètres de l&apos;UL
            </Link>
          </DropdownMenuItem>
        )}
        {user.canReadLogs && (
          <DropdownMenuItem asChild>
            <Link href="/admin/journaux">
              <ScrollText />
              Journaux
            </Link>
          </DropdownMenuItem>
        )}
        {user.canPurge && (
          <DropdownMenuItem asChild>
            <Link href="/admin/purge">
              <Eraser />
              Purge RGPD
            </Link>
          </DropdownMenuItem>
        )}
        {user.canExport && (
          <DropdownMenuItem asChild>
            <Link href="/admin/exports">
              <Download />
              Exports
            </Link>
          </DropdownMenuItem>
        )}
        {user.canReadMailLog && (
          <DropdownMenuItem asChild>
            <Link href="/admin/courriels">
              <Mail />
              Courriels envoyés
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={(event) => {
            event.preventDefault();
            startTransition(async () => {
              await signOutAction({});
            });
          }}
        >
          <LogOut />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
