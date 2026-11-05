import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { isHostedDemo } from "@/lib/env";
import { requirePageAccess } from "@/server/auth/page";
import { IMPORT_DISABLED_MESSAGE } from "@/server/messages";
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
      {isHostedDemo() ? (
        <p role="status" className="rounded-card bg-warn-soft p-6 text-body text-warn-ink">
          {IMPORT_DISABLED_MESSAGE}
        </p>
      ) : (
        <ImportWizard runs={runs} />
      )}
    </>
  );
}
