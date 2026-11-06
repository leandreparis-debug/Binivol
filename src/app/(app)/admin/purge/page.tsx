import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { requirePageAccess } from "@/server/auth/page";
import { automationSettings } from "@/server/automationSettings";
import { getDb } from "@/server/db";
import { PURGE_RULE_LABELS } from "@/server/purgeRules";
import { purgeCandidates, storageOrphans } from "@/server/services/purge";
import { EarlyPurgeForm, PurgeForm, RetryOrphans } from "./PurgeForms";

export const metadata: Metadata = { title: "Purge RGPD" };
export const dynamic = "force-dynamic";

/**
 * Purge RGPD (step 14, TOPAZE, docs/rgpd.md): the people whose retention is
 * over, validated by hand (MANUAL mode, the default), early erasure with a
 * reason, and the stored files whose deletion failed.
 */
export default async function PurgePage() {
  const actor = await requirePageAccess("person.purge");
  const db = getDb();
  const [candidates, orphans, settings] = await Promise.all([
    purgeCandidates(db, actor),
    storageOrphans(db, actor),
    automationSettings(db),
  ]);
  return (
    <>
      <PageHeader
        title="Purge RGPD"
        subtitle="La seule suppression définitive : la fiche, tout ce qui en dépend et ses fichiers. Les journaux sont anonymisés."
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Fiches éligibles ({candidates.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-small text-ink-2">
              Mode{" "}
              {settings.purgeMode === "MANUAL"
                ? "manuel : rien ne part sans ta validation"
                : "automatique : la tâche quotidienne purge seule"}
              . Candidature abandonnée : purge après {settings.abandonedRetentionMonths} mois.
            </p>
            {candidates.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck />}
                title="Aucune fiche à purger"
                description="Les fiches arrivent ici au terme de leur durée de conservation."
              />
            ) : (
              <PurgeForm
                people={candidates.map((c) => ({
                  id: c.id,
                  label: `${c.name} (${c.ref})`,
                  detail: `${PURGE_RULE_LABELS[c.rule]}${c.since ? `, depuis le ${formatDate(c.since)}` : ""}`,
                }))}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">Effacement anticipé</CardTitle>
          </CardHeader>
          <CardContent>
            <EarlyPurgeForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2">Fichiers à supprimer ({orphans.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {orphans.length === 0 ? (
              <p className="text-body text-muted">Aucun fichier en attente.</p>
            ) : (
              <>
                <ul className="flex flex-col divide-y divide-line">
                  {orphans.map((o) => (
                    <li key={o.id} className="flex flex-col py-2 text-small text-ink-2">
                      <span>
                        {o.attempts} tentative{o.attempts > 1 ? "s" : ""}, la dernière le{" "}
                        {formatDateTime(o.lastTriedAt)}
                      </span>
                      {o.lastError && <span className="text-muted">{o.lastError}</span>}
                    </li>
                  ))}
                </ul>
                <RetryOrphans />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
