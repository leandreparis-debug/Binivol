"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { searchCatalog, type DiplomaCatalogItem } from "@/lib/diplomas";

export interface DiplomaPickerProps {
  id: string;
  catalog: readonly DiplomaCatalogItem[];
  /** The label typed or chosen. */
  value: string;
  /** Chosen from the catalogue (code), or typed freely (no code: « Autre »). */
  onChange: (next: { label: string; code?: string }) => void;
}

/**
 * A diploma chosen in the catalogue with a search (ARIA combobox: ↓ ↑,
 * Entrée, Échap), grouped by kind; anything else is typed freely and becomes
 * « Autre (préciser) ». The list is local: nothing leaves the page.
 */
export function DiplomaPicker({ id, catalog, value, onChange }: DiplomaPickerProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const items = searchCatalog(catalog, value);
  const trimmed = value.trim();
  const exact = catalog.some((c) => c.label === trimmed);
  // Last option: keep what is typed as « Autre (préciser) ».
  const count = items.length + (trimmed && !exact ? 1 : 0);
  const optionId = (i: number) => `${listId}-${String(i)}`;

  const pick = (item: DiplomaCatalogItem) => {
    onChange({ label: item.label, code: item.code });
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && count > 0}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        value={value}
        maxLength={60}
        autoComplete="off"
        placeholder="PSE1, PSC, BNSSA… ou autre"
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
          }, 150);
        }}
        onChange={(event) => {
          // Typed freely: no catalogue code until an item is chosen.
          onChange({ label: event.target.value });
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!open || count === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((a) => (a + 1) % count);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((a) => (a <= 0 ? count - 1 : a - 1));
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            const item = items[active];
            if (item) pick(item);
            else setOpen(false);
          }
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Diplômes proposés"
        hidden={!open || count === 0}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-inner border border-line bg-surface py-1 shadow-pop"
      >
        {items.map((item, i) => (
          <li
            key={item.code}
            id={optionId(i)}
            role="option"
            aria-selected={active === i}
            onMouseDown={(event) => {
              event.preventDefault();
              pick(item);
            }}
            className={cn(
              "flex min-h-11 cursor-pointer flex-col justify-center px-4 py-1",
              active === i && "bg-veil",
            )}
          >
            <span className="text-[16px] text-ink sm:text-body">{item.label}</span>
            <span className="text-small text-muted">{item.group}</span>
          </li>
        ))}
        {trimmed && !exact && (
          <li
            id={optionId(items.length)}
            role="option"
            aria-selected={active === items.length}
            onMouseDown={(event) => {
              event.preventDefault();
              setOpen(false);
            }}
            className={cn(
              "flex min-h-11 cursor-pointer items-center border-t border-line px-4 text-small text-ink-2",
              active === items.length && "bg-veil",
            )}
          >
            Autre (préciser) : « {trimmed} »
          </li>
        )}
      </ul>
    </div>
  );
}
