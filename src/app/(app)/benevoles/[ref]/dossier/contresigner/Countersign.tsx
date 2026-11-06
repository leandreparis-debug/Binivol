"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { SignaturePad, type SignatureValue } from "@/components/signature/SignaturePad";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { countersignAction } from "../../dossierActions";

/**
 * Countersignature of the charte by the responsible: preview, quality
 * (prefilled with her profile, editable), signature. Her session stands as
 * verification: no code.
 */
export function Countersign({
  personId,
  personRef,
  actorName,
  defaultQuality,
}: {
  personId: string;
  personRef: string;
  actorName: string;
  defaultQuality: string;
}) {
  const [quality, setQuality] = useState(defaultQuality);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ mailSent: boolean; mailError: string | null } | null>(null);
  const [pending, start] = useTransition();

  const submit = (value: SignatureValue) => {
    const form = new FormData();
    form.set("personId", personId);
    form.set("quality", quality);
    form.set("kind", value.kind);
    if (value.kind === "drawn") form.set("png", value.png, "signature.png");
    else form.set("typedName", value.name);
    setError(null);
    start(async () => {
      const result = await countersignAction(form);
      if (result.ok) setDone(result.data);
      else setError(result.error);
    });
  };

  if (done) {
    return (
      <CountersignDone personRef={personRef} mailSent={done.mailSent} mailError={done.mailError} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Aperçu de la charte</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <iframe
            title="Aperçu de la charte du bénévolat"
            src={`/benevoles/${personRef}/dossier/apercu/charte`}
            className="h-[70vh] w-full rounded-inner border border-line bg-surface"
          />
          <a
            href={`/benevoles/${personRef}/dossier/apercu/charte`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 w-max items-center rounded-control text-small text-ink underline focus-ring"
          >
            Ouvrir l&apos;aperçu dans un nouvel onglet
          </a>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Contresigner pour la Croix-Rouge française</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-small text-muted">
            Signataire : {actorName}. Votre connexion tient lieu de vérification : pas de code.
          </p>
          <Field label="Qualité" htmlFor="countersign-quality" hint="Reportée sur la charte.">
            <Input
              value={quality}
              maxLength={80}
              onChange={(e) => {
                setQuality(e.target.value);
              }}
            />
          </Field>
          {error && (
            <p role="alert" className="text-small font-medium text-danger-ink">
              {error}
            </p>
          )}
          <SignaturePad
            signerName={actorName}
            submitLabel={
              pending ? "Contresignature en cours…" : "Contresigner et envoyer les documents"
            }
            disabled={pending}
            onValidate={submit}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** The countersignature is done: documents filed, e-mail state, next steps. */
export function CountersignDone({
  personRef,
  mailSent,
  mailError,
}: {
  personRef: string;
  mailSent: boolean;
  mailError: string | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 pt-6">
        <CircleCheck className="size-10 text-ok" aria-hidden="true" />
        <h2 className="text-title text-ink" data-testid="countersign-done">
          Dossier complet
        </h2>
        <p className="text-body text-ink-2">
          La charte est contresignée. Les trois documents et la preuve de signature sont rangés dans
          l&apos;onglet Documents (copie UL), et la candidature passe à l&apos;étape Gaia.
        </p>
        <p
          role={mailSent ? "status" : "alert"}
          className={mailSent ? "text-body text-ok-ink" : "text-body font-medium text-danger-ink"}
        >
          {mailSent
            ? "L'e-mail avec les documents, le règlement et le code de conduite est parti."
            : (mailError ?? "L'e-mail n'est pas parti : utilisez « Renvoyer l'e-mail ».")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/benevoles/${personRef}?onglet=documents`}>Voir les documents</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/benevoles/${personRef}?onglet=integration`}>Retour à la fiche</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
