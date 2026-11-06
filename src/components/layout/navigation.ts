import { Bell, GraduationCap, Home, ListTodo, UserPlus, Users } from "lucide-react";
import type { PolicyAction } from "@/lib/actions";

/**
 * Main sections. Routes are French kebab-case. Each entry declares the policy
 * action it needs; the layout only shows the entries `canSome()` allows.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Accueil", icon: Home, action: null },
  { href: "/a-faire", label: "À faire", icon: ListTodo, action: "todo.read" },
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

/** Spoken meaning of a menu badge (« Candidats »: late follow-ups; « À faire »: due or late). */
export function badgeLabel(href: NavHref, count: number): string {
  if (href === "/a-faire") {
    return `${String(count)} tâche${count > 1 ? "s" : ""} en retard ou du jour`;
  }
  return `${String(count)} relance${count > 1 ? "s" : ""} en retard`;
}
