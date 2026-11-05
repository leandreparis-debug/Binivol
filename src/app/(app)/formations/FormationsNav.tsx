"use client";

import { NavPills, type NavPillItem } from "@/components/ui/NavPills";

/** Sub-navigation of /formations (pills), items filtered by the server. */
export function FormationsNav({ items }: { items: NavPillItem[] }) {
  return <NavPills items={items} label="Sections des formations" />;
}
