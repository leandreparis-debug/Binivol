import type { Metadata } from "next";
import { DossierForm, DossierSubmitted } from "@/components/dossier/DossierForm";
import { InvalidLink } from "@/components/dossier/InvalidLink";
import { getDb } from "@/server/db";
import { candidateSession } from "@/server/dossier/current";
import { dossierFormView } from "@/server/services/dossierForm";
import {
  addDossierAttachmentAction,
  removeDossierAttachmentAction,
  saveDossierAction,
  submitDossierAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Votre dossier de bénévole",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The candidate's dossier, behind the dossier cookie set by `/dossier/[token]`
 * (no responsible session, no token in the address).
 */
export default async function DossierPage() {
  const db = getDb();
  const session = await candidateSession(db);
  if (session.state === "none") return <InvalidLink />;
  if (session.state === "submitted") return <DossierSubmitted />;
  const view = await dossierFormView(db, session.context);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-ink">Votre dossier de bénévole</h1>
      <DossierForm
        view={view}
        actions={{
          save: saveDossierAction,
          addAttachment: addDossierAttachmentAction,
          removeAttachment: removeDossierAttachmentAction,
          submit: submitDossierAction,
        }}
      />
    </div>
  );
}
