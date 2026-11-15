import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { REFERENCE_CATEGORY_LABELS } from "@/lib/labels";
import { toParisDay } from "@/lib/dates";
import { MATRIX_TONE } from "@/lib/matrix";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { canSome } from "@/server/policy/can";
import { MATRIX_CATEGORIES, matrixView } from "@/server/services/matrix";
import { MatrixTable } from "./MatrixTable";

export const metadata: Metadata = { title: "Matrice des compétences" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Competence matrix (step 13): people of the perimeter × trainings, from the
 * single state of step 10. Headers stay in place while scrolling; the table
 * scrolls with the keyboard; on a phone, one card per person. With
 * `training.write` on a person, a click on her cell opens her lines of this
 * training (add, change, remove).
 */
export default async function MatrixPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageAccess("training.read");
  const raw = (await searchParams).categorie;
  const category = MATRIX_CATEGORIES.find((c) => c === raw) ?? null;
  const view = await matrixView(getDb(), actor, { category });
  const canExport = canSome(actor, "training.matrix.export");
  const exportHref = `/api/exports/matrice${category ? `?categorie=${category}` : ""}`;
  const filters = [
    { href: "/formations/matrice", label: "Toutes" },
    ...MATRIX_CATEGORIES.map((c) => ({
      href: `/formations/matrice?categorie=${c}`,
      label: REFERENCE_CATEGORY_LABELS[c],
    })),
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Catégories de la matrice">
          <ul className="flex flex-wrap gap-2">
            {filters.map((f) => {
              const active =
                f.href ===
                (category ? `/formations/matrice?categorie=${category}` : "/formations/matrice");
              return (
                <li key={f.href}>
                  <Link
                    href={f.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-control px-4 text-small focus-ring",
                      active ? "bg-ink text-white" : "bg-surface text-ink hover:bg-veil",
                    )}
                  >
                    {f.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {canExport && (
          <a
            href={exportHref}
            download
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-4 text-small font-medium text-ink focus-ring hover:bg-veil"
          >
            <Download aria-hidden="true" className="size-4" /> Exporter la vue (CSV)
          </a>
        )}
      </div>
      <p className="text-body text-ink" role="status">
        {view.rows.length} bénévole{view.rows.length > 1 ? "s" : ""} × {view.columns.length}{" "}
        formation{view.columns.length > 1 ? "s" : ""}
      </p>
      {/* Desktop: the table (cells editable with `training.write`). */}
      <MatrixTable view={view} today={toParisDay().toISOString().slice(0, 10)} />
      {/* Phone: one card per person, only the held competences. */}
      <ul className="flex flex-col gap-3 md:hidden" data-testid="matrix-mobile">
        {view.rows.map((r) => {
          const held = r.cells.filter((c) => c.tone !== "none");
          return (
            <li key={r.id}>
              <Card>
                <CardContent className="flex flex-col gap-2 pt-6">
                  <Link
                    href={`/benevoles/${r.ref}?onglet=formations`}
                    className="inline-flex min-h-11 items-center text-body font-semibold text-ink underline-offset-4 focus-ring hover:underline"
                  >
                    {r.name}
                  </Link>
                  {held.length === 0 ? (
                    <p className="text-small text-muted">Aucune formation de cette catégorie.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {held.map((c) => (
                        <li
                          key={c.label}
                          className={cn("rounded-inner px-2 py-1 text-small", MATRIX_TONE[c.tone])}
                        >
                          {c.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
