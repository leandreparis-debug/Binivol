import type { Profile } from "@/generated/prisma/enums";
import type { NavHref } from "./navigation";

/** What the shell shows about the signed-in responsible (serialisable). */
export interface ShellUser {
  name: string;
  email: string;
  profiles: Profile[];
  canManageAccounts: boolean;
  canImport: boolean;
  /** TOPAZE, log driver only: /admin/courriels. */
  canReadMailLog: boolean;
  /** TOPAZE: /admin/reglages (step 12). */
  canManageSettings: boolean;
  /** TOPAZE: /admin/exports (step 13). */
  canExport: boolean;
}

export interface ShellProps {
  user: ShellUser;
  /** Hrefs of the menu entries the policy allows. */
  allowedHrefs: NavHref[];
  unreadNotifications: number;
  /** Counts shown on menu entries (overdue candidate follow-ups on « Candidats »). */
  navBadges?: Partial<Record<NavHref, number>>;
}
