import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { REFERENCE_CATEGORY_LABELS } from "@/lib/labels";
import type { MatrixCell } from "@/lib/matrix";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { canSome } from "@/server/policy/can";
import { MATRIX_CATEGORIES, matrixView } from "@/server/services/matrix";

export const metadata: Metadata = { title: "Matrice des compétences" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TONE: Record<MatrixCell["tone"], string> = {
  ok: "text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  danger: "bg-danger-soft text-danger-ink",
  accent: "text-accent-ink",
  none: "text-muted",
};

/**
 * Competence matrix (step 13): people of the perimeter × trainings, from the
 * single state of step 10. Headers stay in place while scrolling; the table
 * scrolls with the keyboard; on a phone, one card per person.
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
                      "inline-flex min-h-11 items-center rounded-pill px-4 text-small focus-ring",
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
            className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-line bg-surface px-4 text-small font-medium text-ink focus-ring hover:bg-veil"
          >
            <Download aria-hidden="true" className="size-4" /> Exporter la vue (CSV)
          </a>
        )}
      </div>
      <p className="text-body text-ink" role="status">
        {view.rows.length} bénévole{view.rows.length > 1 ? "s" : ""} × {view.columns.length}{" "}
        formation{view.columns.length > 1 ? "s" : ""}
      </p>
      {/* Desktop: the table. Sticky first row and first column. */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div
            className="max-h-[70vh] overflow-auto rounded-card focus-ring"
            tabIndex={0}
            role="region"
            aria-label="Matrice des compétences (défilement au clavier)"
            data-testid="matrix"
          >
            <table className="border-separate border-spacing-0 text-small">
              <caption className="sr-only">
                Compétences des bénévoles : une ligne par personne, une colonne par formation.
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky top-0 left-0 z-20 min-w-48 border-b border-line bg-surface px-3 py-2 text-left font-medium text-ink-2"
                  >
                    Bénévole
                  </th>
                  {view.columns.map((c) => (
                    <th
                      key={c.id}
                      scope="col"
                      title={c.label}
                      className="sticky top-0 z-10 min-w-20 border-b border-line bg-surface px-2 py-2 text-center font-mono font-medium text-ink"
                    >
                      <abbr title={c.label} className="no-underline">
                        {c.code}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((r) => (
                  <tr key={r.id}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-line bg-surface px-3 py-1 text-left font-normal"
                    >
                      <Link
                        href={`/benevoles/${r.ref}?onglet=formations`}
                        className="inline-flex min-h-11 items-center text-ink underline-offset-4 focus-ring hover:underline"
                      >
                        {r.name}
                      </Link>
                    </th>
                    {r.cells.map((cell, i) => (
                      <td
                        key={view.columns[i]?.id ?? i}
                        aria-label={cell.label}
                        className={cn(
                          "border-b border-line px-2 py-1 text-center whitespace-nowrap",
                          TONE[cell.tone],
                        )}
                      >
                        <span aria-hidden="true">{cell.symbol}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
                          className={cn("rounded-inner px-2 py-1 text-small", TONE[c.tone])}
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
