import Link from "next/link";
import { cn } from "@/lib/cn";

export interface TabLink {
  key: string;
  label: string;
  href: string;
}

/**
 * Segmented navigation between the tabs of a page, kept in the URL
 * (`?onglet=`). The active tab is ink and carries `aria-current="page"`.
 */
export function TabNav({
  tabs,
  active,
  label,
}: {
  tabs: TabLink[];
  active: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="max-w-full [scrollbar-width:none] overflow-x-auto">
      <ul className="flex w-max items-center gap-1 rounded-control border border-line bg-surface p-1">
        {tabs.map((tab) => {
          const current = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                scroll={false}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-mark px-4 text-body font-medium whitespace-nowrap focus-ring",
                  current ? "bg-ink text-white" : "text-ink-2 hover:bg-veil hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
