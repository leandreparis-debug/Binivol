"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, FileText, Link2, Mail, Smartphone, X } from "lucide-react";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { DossierBlock as DossierBlockData } from "@/server/services/dossiers";
import {
  createDossierLinkAction,
  openOnSiteAction,
  revokeDossierLinkAction,
  sendDossierLinkAction,
} from "./dossierActions";

const DIALOG = "max-h-[calc(100dvh-2rem)] overflow-y-auto";

interface Created {
  linkId: string;
  token: string;
  url: string;
  expiresAt: string;
}

/** Creates a remote link; the link is shown once, then copied or e-mailed. */
function CreateLinkDialog({
  personId,
  linkDays,
  hasEmail,
  replaces,
}: {
  personId: string;
  linkDays: number;
  hasEmail: boolean;
  replaces: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const create = useFormAction<Created>();
  const send = useFormAction<{ to: string }>();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // The token is forgotten when the dialog closes.
          setCreated(null);
          setCopied(false);
          setSent(null);
          create.reset();
          send.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button leftIcon={<Link2 aria-hidden="true" />}>
          {replaces ? "Créer un nouveau lien" : "Créer un lien de dossier"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={created ? "Lien créé" : "Créer un lien de dossier"}
        description={
          created
            ? "Ce lien ne sera plus affiché : copiez-le ou envoyez-le maintenant."
            : "Le candidat remplit son dossier sur son téléphone, sans compte. Le lien reste utilisable jusqu'à l'envoi du dossier."
        }
        className={DIALOG}
      >
        {created ? (
          <div className="flex flex-col gap-4">
            <Field label="Lien du dossier" htmlFor="dossier-link-url">
              <Input
                readOnly
                value={created.url}
                className="font-mono text-small"
                onFocus={(e) => {
                  e.currentTarget.select();
                }}
              />
            </Field>
            <p className="text-small text-muted">
              Valable jusqu&apos;au {formatDateTime(created.expiresAt)}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                leftIcon={<Copy aria-hidden="true" />}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(created.url)
                    .then(() => {
                      setCopied(true);
                    })
                    .catch(() => undefined);
                }}
              >
                {copied ? "Lien copié" : "Copier le lien"}
              </Button>
              <Button
                leftIcon={<Mail aria-hidden="true" />}
                loading={send.pending}
                disabled={!hasEmail || sent !== null}
                onClick={() => {
                  send.run(
                    () => sendDossierLinkAction({ linkId: created.linkId, token: created.token }),
                    {
                      onSuccess: (data) => {
                        setSent(data.to);
                      },
                    },
                  );
                }}
              >
                Envoyer par e-mail
              </Button>
            </div>
            {!hasEmail && (
              <p className="text-small text-muted">
                Aucun e-mail sur la fiche : copiez le lien pour le transmettre.
              </p>
            )}
            {sent && (
              <p role="status" className="text-small font-medium text-ok-ink">
                Lien envoyé à {sent}.
              </p>
            )}
            <FormMessage feedback={send.feedback} />
            <div className="flex justify-end">
              <DialogClose asChild>
                <Button variant="ghost">Fermer</Button>
              </DialogClose>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const days = new FormData(e.currentTarget).get("days");
              create.run(() => createDossierLinkAction({ personId, days }), {
                onSuccess: (data) => {
                  setCreated(data);
                },
              });
            }}
          >
            {replaces && (
              <p className="rounded-inner bg-warn-soft p-3 text-small text-warn-ink">
                Le lien actif sera révoqué. Ce qui a déjà été saisi est conservé et suit le nouveau
                lien.
              </p>
            )}
            <Field
              label="Durée de validité (jours)"
              htmlFor="dossier-link-days"
              hint="Entre 1 et 30 jours."
              error={create.errorOf("days")}
            >
              <Input
                name="days"
                type="number"
                inputMode="numeric"
                min={1}
                max={30}
                defaultValue={linkDays}
                required
              />
            </Field>
            <FormMessage feedback={create.feedback} />
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost" type="button">
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit" loading={create.pending}>
                Créer le lien
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevokeButton({ linkId }: { linkId: string }) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, run } = useFormAction<null>();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" leftIcon={<X aria-hidden="true" />}>
          Révoquer
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Révoquer ce lien ?"
        description="Le lien ne pourra plus être ouvert. Ce qui a été saisi est conservé."
      >
        <FormMessage feedback={feedback} />
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Annuler</Button>
          </DialogClose>
          <Button
            loading={pending}
            onClick={() => {
              run(() => revokeDossierLinkAction({ linkId }), {
                onSuccess: () => {
                  setOpen(false);
                },
              });
            }}
          >
            Révoquer le lien
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * « Dossier » block of the Intégration tab (`dossier.manage`): state of the
 * dossier, its links, and the ways to have it filled (remote link, on site).
 */
export function DossierBlock({
  personId,
  personRef,
  block,
}: {
  personId: string;
  personRef: string;
  block: DossierBlockData;
}) {
  const router = useRouter();
  const [opening, startOpening] = useTransition();
  const [onSiteError, setOnSiteError] = useState<string | null>(null);
  const submitted = block.status.state === "submitted";
  const hasActive = block.links.some((l) => l.state === "active" && l.mode === "REMOTE");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Dossier</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <StatusDot status={`dossier-${block.status.state}`} />
          <p className="text-small text-muted">
            {block.status.state === "draft" &&
              block.status.updatedAt &&
              `Dernière modification le ${formatDateTime(block.status.updatedAt)}.`}
            {submitted &&
              block.status.submittedAt &&
              `Envoyé le ${formatDateTime(block.status.submittedAt)} : à relire avant le report dans la fiche.`}
            {block.status.state === "none" &&
              "Créez un lien pour que le candidat remplisse son dossier, ou remplissez-le avec lui sur place."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {submitted ? (
            <Button asChild leftIcon={<FileText aria-hidden="true" />}>
              <Link href={`/benevoles/${personRef}/dossier`}>Voir le dossier</Link>
            </Button>
          ) : (
            <>
              <CreateLinkDialog
                personId={personId}
                linkDays={block.linkDays}
                hasEmail={block.hasEmail}
                replaces={hasActive}
              />
              <Button
                variant="outline"
                leftIcon={<Smartphone aria-hidden="true" />}
                loading={opening}
                onClick={() => {
                  setOnSiteError(null);
                  startOpening(async () => {
                    const result = await openOnSiteAction({ personId });
                    if (result.ok) router.push(`/benevoles/${personRef}/dossier/sur-place`);
                    else setOnSiteError(result.error);
                  });
                }}
              >
                Remplir sur place
              </Button>
            </>
          )}
        </div>
        {onSiteError && (
          <p role="alert" className="text-small font-medium text-danger-ink">
            {onSiteError}
          </p>
        )}
        {block.links.length > 0 && (
          <section aria-labelledby="dossier-links-title" className="flex flex-col gap-2">
            <h3 id="dossier-links-title" className="text-small font-medium text-muted">
              Liens
            </h3>
            <ul className="flex flex-col divide-y divide-line">
              {block.links.map((link) => (
                <li
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                  data-testid="dossier-link"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-body text-ink">
                      {link.mode === "REMOTE" ? "Lien à distance" : "Sur place"}
                    </span>
                    <span className="text-small text-muted">
                      Créé le {formatDate(link.createdAt)}
                      {link.state === "active" && ` · expire le ${formatDate(link.expiresAt)}`}
                      {link.usedAt && ` · utilisé le ${formatDate(link.usedAt)}`}
                      {link.revokedAt && ` · révoqué le ${formatDate(link.revokedAt)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot status={`link-${link.state}`} />
                    {link.state === "active" && <RevokeButton linkId={link.id} />}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {block.mailDriver === "log" && (
          <p className="text-small text-muted">
            Les e-mails ne partent pas : ils sont consignés dans Administration › Courriels.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
