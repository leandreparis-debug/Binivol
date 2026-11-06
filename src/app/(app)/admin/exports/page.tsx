import type { Metadata } from "next";
import Link from "next/link";
import { Download, TriangleAlert } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getEnv } from "@/lib/env";
import { requirePageAccess } from "@/server/auth/page";
import { automationSettings } from "@/server/automationSettings";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Exports" };
export const dynamic = "force-dynamic";

const DOWNLOAD =
  "inline-flex min-h-11 items-center gap-2 self-start rounded-pill bg-ink px-5 text-body font-medium text-white focus-ring hover:bg-ink-2";

/**
 * Exports (step 13, TOPAZE, docs/exports.md). Every download is written to
 * the access log (who, when, how many lines).
 */
export default async function ExportsPage() {
  await requirePageAccess("person.export");
  const { prefectureCodes } = await automationSettings(getDb());
  return (
    <>
      <PageHeader
        title="Exports"
        subtitle="Fichiers CSV pour Excel. Chaque export est enregistré dans le journal des accès."
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">Export préfecture</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-body text-ink-2">
              Obligation annuelle : bénévoles actifs avec {prefectureCodes.join(" ou ")} valide.
              Colonnes : nom, prénom, NIVOL, formation, date d&apos;obtention, échéance.
            </p>
            <p
              role="note"
              className="flex items-start gap-2 rounded-inner bg-warn-soft p-3 text-small text-warn-ink"
            >
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />À vérifier dans
              Pegass avant envoi : Pegass fait foi pour les diplômes.
            </p>
            <a href="/api/exports/prefecture" download className={DOWNLOAD}>
              <Download aria-hidden="true" className="size-4" /> Télécharger l&apos;export
              préfecture
            </a>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">Annuaire et matrice</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-body text-ink-2">
              L&apos;annuaire s&apos;exporte avec ses filtres, colonnes non sensibles seulement ; la
              matrice, avec sa catégorie.
            </p>
            <Link
              href="/benevoles"
              className="inline-flex min-h-11 items-center text-body text-ink underline-offset-4 focus-ring hover:underline"
            >
              Ouvrir l&apos;annuaire
            </Link>
            <Link
              href="/formations/matrice"
              className="inline-flex min-h-11 items-center text-body text-ink underline-offset-4 focus-ring hover:underline"
            >
              Ouvrir la matrice des compétences
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
