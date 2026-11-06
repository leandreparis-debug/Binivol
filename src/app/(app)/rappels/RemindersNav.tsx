"use client";

import { SectionTabs, type SectionTabItem } from "@/components/ui/SectionTabs";

/** Sub-navigation of « Rappels »: the dated reminders and the computed alerts. */
export function RemindersNav({ items }: { items: SectionTabItem[] }) {
  return <SectionTabs items={items} label="Rappels et alertes" />;
}
