import { Bell, GraduationCap, Home, UserPlus, Users } from "lucide-react";

/** Main sections of the application. Routes are French kebab-case. */
export const NAV_ITEMS = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/benevoles", label: "Bénévoles", icon: Users },
  { href: "/candidats", label: "Candidats", icon: UserPlus },
  { href: "/formations", label: "Formations", icon: GraduationCap },
  { href: "/rappels", label: "Rappels", icon: Bell },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
