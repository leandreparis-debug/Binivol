"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { FileText, Mail, PenLine } from "lucide-react";
import { SignaturePad } from "@/components/signature/SignaturePad";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatDateTime } from "@/lib/dates";
import { SIGNER_ROLE_LABELS } from "@/lib/labels";
import type { SignatureBlock } from "@/server/signature/service";
import { countersignAction, resendSignedMailAction } from "./signatureActions";

const DIALOG = "max-h-[calc(100dvh-2rem)] overflow-y-auto";

/** Counter-signature of the charter: preview, name and quality, then the trace. */
function CountersignDialog({
  personId,
  personRef,
  defaults,
}: {
  personId: string;
  personRef: string;
  defaults: SignatureBlock["defaults"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(defaults.firstName);
  const [lastName, setLastName] = useState(defaults.lastName);
  const [quality, setQuality] = useState(defaults.quality);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const ids = { first: useId(), last: useId(), quality: useId() };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          if (done) router.refresh();
          setDone(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button leftIcon={<PenLine aria-hidden="true" />}>Contresigner</Button>
      </DialogTrigger>
      <DialogContent
        title="Contresigner la charte"
        description="Tu signes la charte au nom de la Croix-Rouge française. Ta session tient lieu de vérification : pas de code."
        className={DIALOG}
      >
        {done ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-body text-ink">
              {done}
            </p>
            <Button
              onClick={() => {
                setOpen(false);
                router.refresh();
              }}
            >
              Fermer
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <a
              href={`/benevoles/${personRef}/dossier/apercu/charte`}
              target="_blank"
              rel="noopener"
              className="flex min-h-11 items-center gap-2 text-body text-ink underline focus-ring"
            >
              <FileText className="size-4" aria-hidden="true" />
              Aperçu de la charte (PDF)
            </a>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prénom" htmlFor={ids.first} required>
                <Input
                  id={ids.first}
                  value={firstName}
                  maxLength={50}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                  }}
                />
              </Field>
              <Field label="Nom" htmlFor={ids.last} required>
                <Input
                  id={ids.last}
                  value={lastName}
                  maxLength={50}
                  onChange={(e) => {
                    setLastName(e.target.value);
                  }}
                />
              </Field>
            </div>
            <Field label="Qualité" htmlFor={ids.quality} required hint="Écrite sur la charte.">
              <Input
                id={ids.quality}
                value={quality}
                maxLength={80}
                onChange={(e) => {
                  setQuality(e.target.value);
                }}
              />
            </Field>
            <SignaturePad
              defaultName={`${firstName} ${lastName}`.trim()}
              validateLabel="Contresigner et envoyer"
              busy={busy}
              onValidate={(value) => {
                setBusy(true);
                setError(null);
                void countersignAction({
                  personId,
                  image: value.image,
                  inputKind: value.inputKind,
                  firstName,
                  lastName,
                  quality,
                }).then((result) => {
                  setBusy(false);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setDone(
                    result.data.mailSent
                      ? "Dossier complet : les documents sont rangés et l'e-mail est parti au bénévole."
                      : (result.data.mailMessage ??
                          "Les documents sont rangés, mais l'e-mail n'est pas parti."),
                  );
                });
              }}
            />
            {error && (
              <p role="alert" className="text-small font-medium text-danger-ink">
                {error}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResendButton({ personId }: { personId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        leftIcon={<Mail aria-hidden="true" />}
        loading={busy}
        onClick={() => {
          setBusy(true);
          setMessage(null);
          void resendSignedMailAction({ personId }).then((result) => {
            setBusy(false);
            if (!result.ok) setMessage({ ok: false, text: result.error });
            else if (result.data.mailSent) {
              setMessage({ ok: true, text: "E-mail renvoyé." });
              router.refresh();
            } else setMessage({ ok: false, text: result.data.mailMessage ?? "Échec de l'envoi." });
          });
        }}
      >
        Renvoyer l&apos;e-mail
      </Button>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={
            message.ok ? "text-small text-ink-2" : "text-small font-medium text-danger-ink"
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/**
 * Signature part of the « Dossier » block (step 8): sent, signed by the
 * volunteer, by the guardian, to counter-sign, complete; e-mail sent or failed.
 */
export function SignatureSection({
  personId,
  personRef,
  block,
}: {
  personId: string;
  personRef: string;
  block: SignatureBlock;
}) {
  if (block.stage === "none") return null;
  return (
    <section aria-labelledby="dossier-signature-title" className="flex flex-col gap-3">
      <h3 id="dossier-signature-title" className="text-small font-medium text-muted">
        Signature
      </h3>
      <div className="flex flex-wrap items-center gap-3" data-testid="signature-state">
        <StatusDot status={`signature-${block.stage}`} />
        {block.mail && <StatusDot status={`signature-mail-${block.mail}`} />}
      </div>
      {block.signatures.length > 0 && (
        <ul className="flex flex-col gap-1">
          {block.signatures.map((s) => (
            <li key={s.role} className="text-small text-ink-2">
              {SIGNER_ROLE_LABELS[s.role]} : {s.name}, le {formatDateTime(s.signedAt)} ({s.method})
            </li>
          ))}
        </ul>
      )}
      {block.stage === "submitted" && (
        <p className="text-small text-muted">
          {block.minor
            ? "En attente de la signature du bénévole, puis de son représentant légal."
            : "En attente de la signature du bénévole."}
        </p>
      )}
      {block.stage === "volunteer_signed" && block.minor && (
        <p className="text-small text-muted">
          En attente du représentant légal : pas de contresignature avant sa signature.
        </p>
      )}
      {block.stage === "to_countersign" &&
        (block.storageReady ? (
          <CountersignDialog personId={personId} personRef={personRef} defaults={block.defaults} />
        ) : (
          <p role="status" className="text-small text-ink-2">
            Contresignature indisponible sur cette démo : le stockage des documents n&apos;est pas
            configuré.
          </p>
        ))}
      {block.stage === "complete" && block.mail !== "sent" && <ResendButton personId={personId} />}
      {block.stage === "complete" && (
        <p className="text-small text-muted">
          Les documents signés et la preuve de signature sont dans l&apos;onglet Documents.
        </p>
      )}
    </section>
  );
}
