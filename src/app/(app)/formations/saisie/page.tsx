import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { entryCandidates, referenceOptions } from "@/server/services/trainings";
import { GroupEntryForm } from "../TrainingForms";

export const metadata: Metadata = { title: "Saisie de groupe" };
export const dynamic = "force-dynamic";

/** Group entry (legacy tool): one training, a date, a result, then the people. */
export default async function GroupEntryPage() {
  const actor = await requirePageAccess("trainingSession.manage");
  const db = getDb();
  const [trainings, people] = await Promise.all([
    referenceOptions(db, { kind: "TRAINING" }),
    entryCandidates(db, actor),
  ]);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Saisie de groupe</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-small text-ink-2">
          Les avertissements (prérequis, doublon, date future, personne non présente) sont calculés
          pour tout le groupe avant l&apos;enregistrement : rien n&apos;est bloqué.
        </p>
        <GroupEntryForm
          trainings={trainings.map((t) => ({ id: t.id, code: t.code, label: t.label }))}
          people={people}
        />
      </CardContent>
    </Card>
  );
}
