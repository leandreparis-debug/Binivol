"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, Select } from "@/components/ui/Field";

/** Filters of /candidats, kept in the URL: owner (« moi » by default), overdue only, source, abandoned. */
export function BoardFilters({
  owners,
  sources,
}: {
  owners: { id: string; name: string }[];
  sources: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const push = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };
  return (
    <section
      aria-label="Filtres des candidats"
      className="flex flex-wrap items-end gap-x-6 gap-y-3"
    >
      <Field label="Responsable" htmlFor="filtre-responsable" className="min-w-48">
        <Select
          id="filtre-responsable"
          value={params.get("responsable") ?? "moi"}
          onChange={(e) => {
            push("responsable", e.target.value === "moi" ? null : e.target.value);
          }}
        >
          <option value="moi">Moi</option>
          <option value="tous">Tous les responsables</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Source" htmlFor="filtre-source" className="min-w-48">
        <Select
          id="filtre-source"
          value={params.get("source") ?? ""}
          onChange={(e) => {
            push("source", e.target.value || null);
          }}
        >
          <option value="">Toutes</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox
        label="Relances en retard seulement"
        checked={params.get("retard") === "1"}
        onChange={(e) => {
          push("retard", e.target.checked ? "1" : null);
        }}
      />
      <Checkbox
        label="À créer dans Gaia seulement"
        checked={params.get("gaia") === "1"}
        onChange={(e) => {
          push("gaia", e.target.checked ? "1" : null);
        }}
      />
      <Checkbox
        label="Afficher les abandons"
        checked={params.get("abandons") === "1"}
        onChange={(e) => {
          push("abandons", e.target.checked ? "1" : null);
        }}
      />
    </section>
  );
}
