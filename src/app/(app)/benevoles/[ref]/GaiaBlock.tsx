"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, FileCheck2, Undo2 } from "lucide-react";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { CopyAllButton, CopyField } from "@/components/ui/CopyField";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Textarea } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/dates";
import { gaiaCopyText, type GaiaRow } from "@/lib/gaia";
import type { GaiaBlockView } from "@/server/services/gaia";
import {
  completeAttestationAction,
  readGaiaSheetAction,
  setGaiaChecklistAction,
  undoFinalizeAction,
} from "./gaiaActions";

/** The prefilled sheet: read on demand (journaled), one « Copier » per field. */
function GaiaSheet({ personId }: { personId: string }) {
  const [rows, setRows] = useState<GaiaRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!rows) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="self-start"
          leftIcon={<Eye aria-hidden="true" />}
          loading={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const result = await readGaiaSheetAction({ personId });
              if (result.ok) setRows(result.data);
              else setError(result.error);
            });
          }}
        >
          Afficher la fiche Gaia
        </Button>
        <p className="text-small text-muted">
          Les valeurs à saisir dans Gaia, dans l&apos;ordre de son écran de création. Cette
          consultation est enregistrée.
        </p>
        {error && (
          <p role="alert" className="text-small font-medium text-danger-ink">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <CopyAllButton
        variant="primary"
        doneMessage="Toute la fiche est copiée."
        getText={() => gaiaCopyText(rows)}
      >
        Tout copier
      </CopyAllButton>
      <ul className="flex flex-col divide-y divide-line" data-testid="gaia-sheet">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="text-small text-muted">{row.label}</span>
              <span className="text-body break-words text-ink">
                {row.value || (
                  <span className="text-muted">
                    {row.key === "nationality" ? "À demander (non recueillie)" : "Non renseigné"}
                  </span>
                )}
              </span>
            </div>
            {row.value && <CopyField label={row.label} text={row.value} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Checklist({ personId, block }: { personId: string; block: GaiaBlockView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <fieldset className="flex flex-col gap-3" data-testid="gaia-checklist">
      <legend className="mb-1 text-small font-medium text-muted">Liste à cocher</legend>
      {block.checklist.map((item) => (
        <Checkbox
          key={item.key}
          checked={item.checked !== null}
          disabled={pending || block.stage !== "GAIA"}
          label={item.label}
          hint={
            item.checked
              ? `Coché par ${item.checked.by} le ${formatDateTime(new Date(item.checked.at))}`
              : undefined
          }
          onChange={(event) => {
            const checked = event.target.checked;
            setError(null);
            start(async () => {
              const result = await setGaiaChecklistAction({
                personId,
                candidacyId: block.candidacyId,
                key: item.key,
                checked,
              });
              if (!result.ok) setError(result.error);
              router.refresh();
            });
          }}
        />
      ))}
      {error && (
        <p role="alert" className="text-small font-medium text-danger-ink">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function UndoDialog({ personId, candidacyId }: { personId: string; candidacyId: string }) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, errorOf, run, reset } = useFormAction<null>();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="self-start" leftIcon={<Undo2 aria-hidden="true" />}>
          Annuler la clôture
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Annuler la clôture"
        description="Pour une clôture faite par erreur, dans les 7 jours. Le NIVOL et l'e-mail Croix-Rouge sont retirés de la fiche, la personne redevient candidate et la candidature revient à « Création Gaia ». Tout est tracé."
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("reason");
            const reason = typeof value === "string" ? value : "";
            run(() => undoFinalizeAction({ personId, candidacyId, reason }), {
              onSuccess: () => {
                setOpen(false);
              },
            });
          }}
        >
          <Field label="Motif" htmlFor="undo-reason" error={errorOf("reason")} required>
            <Textarea id="undo-reason" name="reason" rows={3} maxLength={500} />
          </Field>
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Fermer
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              Annuler la clôture
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * « Gaia » block of the Intégration tab (step 9): the sheet to copy into Gaia,
 * the dated checklist; after the closure, the certificate completed with the
 * NIVOL and, for TOPAZE within 7 days, the undo.
 */
export function GaiaBlock({
  personId,
  block,
  canCompleteAttestation,
}: {
  personId: string;
  block: GaiaBlockView;
  canCompleteAttestation: boolean;
}) {
  const { pending, feedback, run } = useFormAction<unknown>();
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Gaia</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {block.stage === "GAIA" ? (
          <>
            <p className="text-body text-ink-2">
              Crée la personne dans Gaia, l&apos;outil national, avec la fiche ci-dessous. Binivol
              ne s&apos;y connecte jamais. Ensuite, « Finaliser l&apos;intégration » enregistre le
              NIVOL et l&apos;e-mail Croix-Rouge que Gaia a attribués.
            </p>
            <GaiaSheet personId={personId} />
            <Checklist personId={personId} block={block} />
          </>
        ) : (
          <>
            <p className="text-body text-ink-2">
              Intégration finalisée le {block.closedAt ? formatDateTime(block.closedAt) : ""}.
            </p>
            {block.attestation === "pending" && (
              <div className="flex flex-col gap-2">
                <p className="text-small text-ink-2">
                  L&apos;attestation d&apos;aptitude attend encore le NIVOL.
                </p>
                {canCompleteAttestation && (
                  <Button
                    className="self-start"
                    leftIcon={<FileCheck2 aria-hidden="true" />}
                    loading={pending}
                    onClick={() => {
                      run(() => completeAttestationAction({ personId }), {
                        success: "Attestation complétée avec le NIVOL.",
                      });
                    }}
                  >
                    Compléter l&apos;attestation
                  </Button>
                )}
              </div>
            )}
            {block.attestation === "done" && (
              <p className="text-small text-ink-2">
                L&apos;attestation d&apos;aptitude est complétée avec le NIVOL (onglet Documents).
              </p>
            )}
            <FormMessage feedback={feedback} />
            {block.canUndo && <UndoDialog personId={personId} candidacyId={block.candidacyId} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}
