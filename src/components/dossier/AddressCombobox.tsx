"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import {
  ADDRESS_DEBOUNCE_MS,
  ADDRESS_QUERY_MIN,
  type AddressQueryKind,
  type AddressSuggestion,
} from "@/lib/geo";

/** Asks the server for suggestions (route `/dossier/adresse`, or the on-site action). */
export type SuggestAddress = (
  kind: AddressQueryKind,
  query: string,
) => Promise<AddressSuggestion[]>;

export interface AddressComboboxProps {
  id: string;
  kind: AddressQueryKind;
  value: string;
  maxLength: number;
  autoComplete?: string;
  inputMode?: "numeric";
  placeholder?: string;
  onChange: (value: string) => void;
  onPick: (suggestion: AddressSuggestion) => void;
  suggest: SuggestAddress;
}

/**
 * A text field that proposes addresses, communes or postal codes (ARIA
 * « combobox » pattern): after 3 characters and 250 ms, up to 5 choices;
 * ↓ ↑ to move, Entrée to choose, Échap to close; the number of results is
 * announced. « Je ne trouve pas mon adresse » closes the list and leaves
 * free typing (abroad, lieu-dit…) — nothing is ever forced. The browser's own
 * autofill (`autocomplete`) is kept.
 */
export function AddressCombobox({
  id,
  kind,
  value,
  maxLength,
  autoComplete,
  inputMode,
  placeholder,
  onChange,
  onPick,
  suggest,
}: AddressComboboxProps) {
  const listId = useId();
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [announce, setAnnounce] = useState("");
  const [free, setFree] = useState(false);
  const typed = useRef(false);
  const request = useRef(0);

  useEffect(() => {
    if (!typed.current || free) return;
    const query = value.trim();
    if (query.length < ADDRESS_QUERY_MIN) {
      setItems([]);
      setOpen(false);
      return;
    }
    const ticket = ++request.current;
    const timer = window.setTimeout(() => {
      void suggest(kind, query)
        .catch(() => [])
        .then((found) => {
          if (ticket !== request.current) return;
          setItems(found);
          setActive(-1);
          setOpen(found.length > 0);
          setAnnounce(
            found.length === 0
              ? ""
              : `${String(found.length)} proposition${found.length > 1 ? "s" : ""}, flèches pour choisir.`,
          );
        });
    }, ADDRESS_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, kind, suggest, free]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const choose = (item: AddressSuggestion) => {
    typed.current = false;
    request.current += 1;
    onPick(item);
    close();
    setAnnounce(`Choisi : ${item.label}.`);
  };

  // The last option of the list is « Je ne trouve pas mon adresse ».
  const count = items.length + 1;
  const optionId = (i: number) => `${listId}-${String(i)}`;

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete ?? "off"}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(event) => {
          typed.current = true;
          if (event.target.value.trim() === "") setFree(false);
          onChange(event.target.value);
        }}
        onBlur={() => {
          window.setTimeout(close, 150);
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((a) => (a + 1) % count);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((a) => (a <= 0 ? count - 1 : a - 1));
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            const item = items[active];
            if (item) choose(item);
            else {
              setFree(true);
              close();
            }
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={
          kind === "address"
            ? "Adresses proposées"
            : kind === "postalCode"
              ? "Communes proposées"
              : "Codes postaux proposés"
        }
        hidden={!open}
        className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-inner border border-line bg-surface py-1 shadow-pop"
      >
        {items.map((item, i) => (
          <li
            key={`${item.label}-${String(i)}`}
            id={optionId(i)}
            role="option"
            aria-selected={active === i}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(item);
            }}
            className={cn(
              "flex min-h-11 cursor-pointer items-center px-4 text-[16px] text-ink sm:text-body",
              active === i && "bg-veil",
            )}
          >
            {item.label}
          </li>
        ))}
        <li
          id={optionId(items.length)}
          role="option"
          aria-selected={active === items.length}
          onMouseDown={(event) => {
            event.preventDefault();
            setFree(true);
            close();
          }}
          className={cn(
            "flex min-h-11 cursor-pointer items-center border-t border-line px-4 text-small text-ink-2",
            active === items.length && "bg-veil",
          )}
        >
          Je ne trouve pas mon adresse : je la saisis moi-même
        </li>
      </ul>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
