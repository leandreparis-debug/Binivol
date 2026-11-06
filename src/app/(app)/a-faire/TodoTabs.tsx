"use client";

import { SectionTabs } from "@/components/ui/SectionTabs";

/** The three tabs of « À faire ». */
export function TodoTabs() {
  return (
    <SectionTabs
      label="Sections de « À faire »"
      items={[
        { href: "/a-faire", label: "Ma liste", exact: true },
        { href: "/a-faire/confiees", label: "Confiées" },
        { href: "/a-faire/projets", label: "Projets" },
      ]}
    />
  );
}
