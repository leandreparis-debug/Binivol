import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, Users } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { personDisplayName } from "@/components/person/PersonName";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getEnv } from "@/lib/env";
import { alertCountsFor } from "@/server/services/alerts";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { canSome } from "@/server/policy/can";
import {
  directoryShowsArchived,
  hasFilters,
  listDirectory,
  parseDirectoryQuery,
  qualificationOptions,
} from "@/server/services/directory";
import { DirectoryFilters } from "./DirectoryFilters";
import { DirectoryList, type DirectoryItem } from "./DirectoryList";

export const metadata: Metadata = { title: "Bénévoles" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pageHref(params: Record<string, string | string[] | undefined>, cursor: string | null) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v && key !== "apres") next.set(key, v);
  }
  if (cursor) next.set("apres", cursor);
  const query = next.toString();
  return query ? `/benevoles?${query}` : "/benevoles";
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageAccess("person.directory.read");
  const raw = await searchParams;
  const query = parseDirectoryQuery(raw);
  const db = getDb();
  const [page, qualifications] = await Promise.all([
    listDirectory(db, actor, query),
    qualificationOptions(db),
  ]);
  const alerts = await alertCountsFor(
    db,
    actor,
    page.rows.map((r) => r.id),
  );
  const items: DirectoryItem[] = page.rows.map((row) => ({
    id: row.id,
    ref: row.ref,
    nivol: row.nivol,
    name: personDisplayName(row),
    status: row.status,
    email: row.email,
    phone: row.phone,
    archived: row.archived,
    canOpen: row.canOpen,
    alerts: alerts.get(row.id) ?? 0,
    training: row.training,
  }));
  const filtered = hasFilters(query);
  const count = `${String(page.total)} ${page.total > 1 ? "personnes" : "personne"}`;

  return (
    <>
      <PageHeader
        title="Bénévoles"
        subtitle="Retrouver une personne et ouvrir sa fiche."
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      <DirectoryFilters
        statuses={page.statuses}
        qualifications={qualifications}
        alertDays={page.alertDays}
        canSeeArchived={directoryShowsArchived(actor)}
      />
      <p className="mb-3 text-body font-medium text-ink" role="status" aria-live="polite">
        {count}
      </p>
      {page.total === 0 ? (
        filtered ? (
          <EmptyState
            icon={<SearchX />}
            title="Aucun résultat"
            description="Aucune personne visible ne correspond à cette recherche."
            action={
              <Button asChild variant="primary">
                <Link href="/benevoles">Retirer les filtres</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Users />}
            title="Aucune personne visible"
            description="Aucune personne ne relève de vos profils pour le moment."
          />
        )
      ) : (
        <>
          <DirectoryList items={items} showTraining={canSome(actor, "training.read")} />
          <nav aria-label="Pages de l'annuaire" className="mt-4 flex flex-wrap justify-end gap-2">
            {query.apres && (
              <Button asChild variant="outline">
                <Link href={pageHref(raw, null)}>Première page</Link>
              </Button>
            )}
            {page.nextCursor && (
              <Button asChild variant="primary">
                <Link href={pageHref(raw, page.nextCursor)}>Page suivante</Link>
              </Button>
            )}
          </nav>
        </>
      )}
    </>
  );
}
