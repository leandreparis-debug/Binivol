"use client";

import { SectionTabs, type SectionTabItem } from "@/components/ui/SectionTabs";

/** Sub-navigation of /formations (pills), items filtered by the server. */
export function FormationsNav({ items }: { items: SectionTabItem[] }) {
  return <SectionTabs items={items} label="Sections des formations" />;
}
