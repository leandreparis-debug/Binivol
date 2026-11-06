"use client";

import { NavPills, type NavPillItem } from "@/components/ui/NavPills";

/** Sub-navigation of « Rappels »: the dated reminders and the computed alerts. */
export function RemindersNav({ items }: { items: NavPillItem[] }) {
  return <NavPills items={items} label="Rappels et alertes" />;
}
