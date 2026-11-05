import type { Metadata } from "next";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { DossierForm, DossierSigned } from "@/components/dossier/DossierForm";
import { SignatureFlow } from "@/components/signature/SignatureFlow";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { getDb } from "@/server/db";
import { requireDossierPage } from "@/server/dossier/page";
import { dossierStatus } from "@/server/dossier/store";
import { dossierFormView, onSiteContext } from "@/server/services/dossierForm";
import { dossierPerson } from "@/server/services/dossiers";
import { onSiteSigningView } from "@/server/signature/service";
import {
  requestOnSiteCodeAction,
  signInPersonAction,
  signOnSiteWithCodeAction,
} from "@/app/(app)/benevoles/[ref]/signatureActions";
import {
  addOnSiteAttachmentAction,
  removeOnSiteAttachmentAction,
  saveOnSiteDossierAction,
  submitOnSiteDossierAction,
} from "@/app/(app)/benevoles/[ref]/dossierActions";

export const metadata: Metadata = {
  title: "Dossier sur place",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * On-site mode: the candidate fills the dossier on the responsible's device,
 * through the ON_SITE link opened from the Intégration tab.
 */
export default async function OnSitePage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { actor, personId, facts } = await requireDossierPage(ref);
  const db = getDb();
  const person = await dossierPerson(db, personId);
  const exitHref = `/benevoles/${person.ref}?onglet=integration`;
  const context = await onSiteContext(db, personId);
  const banner = (
    <div
      className="flex flex-col gap-3 rounded-card bg-surface p-4"
      role="region"
      aria-label="Mode sur place"
    >
      <div className="flex items-center justify-between gap-2">
        <Chip tone="warn" icon={<Smartphone />}>
          Mode sur place
        </Chip>
        <span className="text-small text-muted">{person.firstName}</span>
      </div>
      <Button asChild variant="outline" size="lg">
        <Link href={exitHref}>Rendre l&apos;appareil au responsable</Link>
      </Button>
    </div>
  );
  if (!context) {
    const status = await dossierStatus(db, personId);
    // Sent and waiting for its signatures: the signature screens, with the
    // in-person check of the signed-in responsible (journaled read).
    const signing =
      status.state === "submitted" ? await onSiteSigningView(db, actor, personId, facts) : null;
    return (
      <div className="flex flex-col gap-4">
        {banner}
        {signing ? (
          <>
            <h1 className="text-title text-ink">Dossier de bénévole</h1>
            <SignatureFlow
              view={signing}
              previewBase={`/benevoles/${person.ref}/dossier/apercu`}
              onSite={{ personId, verifierName: actor.name, exitHref }}
              actions={{
                requestCode: requestOnSiteCodeAction,
                signWithCode: signOnSiteWithCodeAction,
                signInPerson: signInPersonAction,
              }}
            />
          </>
        ) : status.state === "submitted" ? (
          <DossierSigned exitHref={exitHref} />
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <h1 className="text-title text-ink">Le mode sur place n&apos;est pas ouvert</h1>
              <p className="text-body text-ink-2">
                Ouvrez-le depuis l&apos;onglet Intégration de la fiche (« Remplir sur place »).
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  const view = await dossierFormView(db, context);
  return (
    <div className="flex flex-col gap-4">
      {banner}
      <h1 className="text-title text-ink">Dossier de bénévole</h1>
      <DossierForm
        view={view}
        personId={personId}
        exitHref={exitHref}
        actions={{
          save: saveOnSiteDossierAction,
          addAttachment: addOnSiteAttachmentAction,
          removeAttachment: removeOnSiteAttachmentAction,
          submit: submitOnSiteDossierAction,
        }}
      />
    </div>
  );
}
