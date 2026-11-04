import { Bell, GraduationCap, Home, UserPlus, Users } from "lucide-react";
import type { PolicyAction } from "@/lib/actions";

/**
 * Main sections. Routes are French kebab-case. Each entry declares the policy
 * action it needs; the layout only shows the entries `canSome()` allows.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Accueil", icon: Home, action: null },
  { href: "/benevoles", label: "Bénévoles", icon: Users, action: "person.directory.read" },
  { href: "/candidats", label: "Candidats", icon: UserPlus, action: "candidacy.manage" },
  { href: "/formations", label: "Formations", icon: GraduationCap, action: "training.read" },
  { href: "/rappels", label: "Rappels", icon: Bell, action: "notification.readOwn" },
] as const satisfies readonly {
  href: string;
  label: string;
  icon: unknown;
  action: PolicyAction | null;
}[];

export type NavItem = (typeof NAV_ITEMS)[number];
export type NavHref = NavItem["href"];
