import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { getEnv } from "@/lib/env";
import { getDb } from "@/server/db";
import { requireDossierPage } from "@/server/dossier/page";
import { defaultQuality, signatureStatus } from "@/server/dossier/signing";
import { dossierPerson } from "@/server/services/dossiers";
import { Countersign } from "./Countersign";

export const metadata: Metadata = { title: "Contresigner la charte" };
export const dynamic = "force-dynamic";

/** Countersignature of the charte (`dossier.manage`), once every signer has signed. */
export default async function CountersignPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { actor, personId } = await requireDossierPage(ref);
  const db = getDb();
  const [person, status] = await Promise.all([
    dossierPerson(db, personId),
    signatureStatus(db, personId),
  ]);
  const waiting =
    status?.waitingFor === "VOLUNTEER"
      ? "Le bénévole n'a pas encore signé."
      : status?.waitingFor === "PARENT"
        ? "Le représentant légal n'a pas encore signé : pas de contresignature possible."
        : status?.status === "COMPLETE"
          ? "Ce dossier est déjà contresigné."
          : status
            ? null
            : "Aucun dossier envoyé pour cette personne.";
  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/benevoles/${person.ref}?onglet=integration`}
        className="inline-flex min-h-11 w-max items-center gap-2 rounded-pill text-small text-ink-2 focus-ring hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Retour à la fiche
      </Link>
      <PageHeader
        title={`Contresigner la charte de ${person.firstName} ${person.lastName}`}
        subtitle="Signature du représentant de la Croix-Rouge française"
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      {waiting ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-body text-ink-2">{waiting}</p>
          </CardContent>
        </Card>
      ) : (
        <Countersign
          personId={personId}
          personRef={person.ref}
          actorName={actor.name}
          defaultQuality={defaultQuality(actor)}
        />
      )}
    </div>
  );
}
