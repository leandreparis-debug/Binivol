import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db";
import { requireDossierPage } from "@/server/dossier/page";
import { dossierStatus } from "@/server/dossier/store";
import { dossierPerson } from "@/server/services/dossiers";
import { DossierReview } from "./DossierReview";

export const metadata: Metadata = { title: "Dossier envoyé" };
export const dynamic = "force-dynamic";

/**
 * Review of the submitted dossier (`dossier.manage`). Nothing of the dossier
 * is in the initial render: the comparison is loaded on demand, journaled.
 */
export default async function DossierReviewPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { personId } = await requireDossierPage(ref);
  const db = getDb();
  const [person, status] = await Promise.all([
    dossierPerson(db, personId),
    dossierStatus(db, personId),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/benevoles/${person.ref}?onglet=integration`}
        className="inline-flex min-h-11 w-max items-center gap-2 rounded-pill text-small text-ink-2 focus-ring hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Retour à la fiche
      </Link>
      <PageHeader
        title={`Dossier de ${person.firstName} ${person.lastName}`}
        subtitle="Relire, puis reporter dans la fiche"
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      {status.state === "submitted" ? (
        <DossierReview personId={personId} />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <StatusDot status={`dossier-${status.state}`} />
            <p className="text-body text-ink-2">
              Le dossier n&apos;a pas encore été envoyé : il se relit une fois envoyé par le
              candidat.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
