"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import type { PersonStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, SearchInput, Select } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { PERSON_STATUS_LABELS } from "@/lib/labels";

const STATUS_OPTIONS: PersonStatus[] = [
  "ACTIVE",
  "PAUSED",
  "SUSPENDED",
  "INACTIVE",
  "LEFT",
  "CANDIDATE",
];
const PERIMETER_OPTIONS = [
  ["ACTION", "ACTION (secours)"],
  ["LASER", "LASER (urgence)"],
  ["FORMAT_GP", "FORMAT GP (grand public)"],
] as const;
const DEBOUNCE_MS = 300;

export interface DirectoryFiltersProps {
  /** Statuses applied (the defaults when the URL has none). */
  statuses: readonly PersonStatus[];
  qualifications: { code: string; label: string }[];
  alertDays: number;
  /** Shows the « personnes archivées » option (TOPAZE). */
  canSeeArchived: boolean;
}

/**
 * Search and filters of the directory. Everything lives in the URL
 * (shareable, back button): typing waits {@link DEBOUNCE_MS} ms, any change
 * restarts from the first page.
 */
export function DirectoryFilters({
  statuses,
  qualifications,
  alertDays,
  canSeeArchived,
}: DirectoryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusGroup = useId();
  const panelId = useId();
  // Under 640 px the filters fold behind a button, so the list stays on the first screen.
  const [open, setOpen] = useState(false);

  const push = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    next.delete("apres");
    const query = next.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onSearch = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      push({ q: value.trim() || null });
    }, DEBOUNCE_MS);
  };

  const toggleStatus = (status: PersonStatus) => {
    const set = new Set(statuses);
    if (set.has(status)) set.delete(status);
    else set.add(status);
    push({ statut: set.size > 0 ? [...set].join(",") : null });
  };

  const hasFilters = [...params.keys()].some((k) => k !== "apres");
  const activeFilters = [...params.keys()].filter((k) => k !== "apres" && k !== "q").length;

  return (
    <section aria-label="Recherche et filtres" className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          aria-label="Rechercher un nom, un prénom ou un NIVOL"
          placeholder="Nom, prénom ou NIVOL"
          value={q}
          onChange={(e) => {
            onSearch(e.target.value);
          }}
          className="min-w-0 flex-1 basis-64"
        />
        <Button
          variant="outline"
          className="sm:hidden"
          aria-expanded={open}
          aria-controls={panelId}
          leftIcon={<SlidersHorizontal aria-hidden="true" />}
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          Filtres{activeFilters > 0 ? ` (${String(activeFilters)})` : ""}
        </Button>
        {hasFilters && (
          <Button
            variant="ghost"
            leftIcon={<X aria-hidden="true" />}
            onClick={() => {
              setQ("");
              startTransition(() => {
                router.replace(pathname, { scroll: false });
              });
            }}
          >
            Retirer les filtres
          </Button>
        )}
      </div>

      <div id={panelId} className={cn("flex-col gap-4 sm:flex", open ? "flex" : "hidden")}>
        <fieldset className="flex flex-col gap-2" aria-describedby={`${statusGroup}-hint`}>
          <legend className="text-small font-medium text-ink">Statut</legend>
          <p id={`${statusGroup}-hint`} className="sr-only">
            Plusieurs choix possibles.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {STATUS_OPTIONS.map((status) => (
              <Checkbox
                key={status}
                label={PERSON_STATUS_LABELS[status]}
                checked={statuses.includes(status)}
                onChange={() => {
                  toggleStatus(status);
                }}
              />
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Périmètre" htmlFor="filtre-perimetre">
            <Select
              id="filtre-perimetre"
              value={params.get("perimetre") ?? ""}
              onChange={(e) => {
                push({ perimetre: e.target.value || null });
              }}
            >
              <option value="">Tous</option>
              {PERIMETER_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Avec la qualification" htmlFor="filtre-qualification">
            <Select
              id="filtre-qualification"
              value={params.get("qualification") ?? ""}
              onChange={(e) => {
                push({ qualification: e.target.value || null });
              }}
            >
              <option value="">Toutes</option>
              {qualifications.map((q) => (
                <option key={q.code} value={q.code}>
                  {q.code} — {q.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sans la qualification" htmlFor="filtre-sans">
            <Select
              id="filtre-sans"
              value={params.get("sans") ?? ""}
              onChange={(e) => {
                push({ sans: e.target.value || null });
              }}
            >
              <option value="">—</option>
              {qualifications.map((q) => (
                <option key={q.code} value={q.code}>
                  {q.code} — {q.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Échéance" htmlFor="filtre-echeance">
            <Select
              id="filtre-echeance"
              value={params.get("echeance") ?? ""}
              onChange={(e) => {
                push({ echeance: e.target.value || null });
              }}
            >
              <option value="">Toutes</option>
              <option value="proche">Dans les {alertDays} jours</option>
              <option value="expiree">Déjà expirée</option>
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Checkbox
            label="Mineurs"
            checked={params.get("mineur") === "1"}
            onChange={(e) => {
              push({ mineur: e.target.checked ? "1" : null });
            }}
          />
          <Checkbox
            label="Formateurs"
            checked={params.get("formateur") === "1"}
            onChange={(e) => {
              push({ formateur: e.target.checked ? "1" : null });
            }}
          />
          {canSeeArchived && (
            <Checkbox
              label="Inclure les personnes archivées"
              checked={params.get("archives") === "1"}
              onChange={(e) => {
                push({ archives: e.target.checked ? "1" : null });
              }}
            />
          )}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {pending ? "Recherche en cours…" : ""}
      </p>
    </section>
  );
}
