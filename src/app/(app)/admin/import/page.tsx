import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listImportRuns } from "@/server/import/history";
import { ImportWizard } from "./ImportWizard";

export const metadata: Metadata = { title: "Import du classeur" };

/** TOPAZE: import of the legacy workbook (simulation, then real import). */
export default async function ImportPage() {
  await requirePageAccess("import.run");
  const runs = await listImportRuns(getDb());
  return (
    <>
      <PageHeader
        title="Import du classeur"
        subtitle="Reprise de l'ancien classeur v03 : simulation d'abord, import réel ensuite, du même fichier."
      />
      <ImportWizard runs={runs} />
    </>
  );
}
