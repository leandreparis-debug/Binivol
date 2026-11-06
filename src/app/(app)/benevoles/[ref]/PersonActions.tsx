"use client";

import { useState } from "react";
import { Hash, Pencil, RefreshCw, FileArchive } from "lucide-react";
import type { LeftReason, PersonStatus } from "@/generated/prisma/enums";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { CIVILITY_LABELS, LEFT_REASON_LABELS, PERSON_STATUS_LABELS } from "@/lib/labels";
import { NIVOL_EXAMPLE } from "@/lib/nivol";
import { LEFT_REASONS, STATUS_CHOICES } from "@/lib/personForms";
import { formatPhone } from "@/lib/phone";
import {
  changeStatusAction,
  correctNivolAction,
  returnFormerAction,
  updateIdentityAction,
} from "./actions";

/** Identity fields the edit form starts from (no sensitive field). */
export interface IdentityValues {
  civility: "MME" | "M" | null;
  firstName: string;
  lastName: string;
  birthName: string | null;
  usageName: string | null;
  email: string | null;
  phone: string | null;
  proEmail: string | null;
  proPhone: string | null;
  profession: string | null;
  sector: string | null;
  company: string | null;
  notes: string | null;
  greetingOptOut: boolean;
}

export interface PersonActionsProps {
  personId: string;
  status: PersonStatus;
  nivol: string | null;
  legacyImport: boolean;
  identity: IdentityValues;
  can: {
    update: boolean;
    changeStatus: boolean;
    correctNivol: boolean;
    returnFormer: boolean;
    gdprExport: boolean;
  };
  /** Readable reference, for the GDPR export link. */
  personRef: string;
}

const DIALOG_CLASS = "max-h-[calc(100dvh-2rem)] overflow-y-auto";
const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

function FormButtons({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="mt-6 flex flex-wrap justify-end gap-2">
      <DialogClose asChild>
        <Button variant="ghost" type="button">
          Annuler
        </Button>
      </DialogClose>
      <Button type="submit" loading={pending}>
        {label}
      </Button>
    </div>
  );
}

function StatusDialog({ personId, status, nivol, legacyImport }: PersonActionsProps) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PersonStatus>(status === "CANDIDATE" ? "ACTIVE" : status);
  const { pending, feedback, errorOf, run, reset } = useFormAction<null>();
  const nivolMissing = choice === "ACTIVE" && !nivol && !legacyImport;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" leftIcon={<RefreshCw aria-hidden="true" />}>
          Changer le statut
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Changer le statut"
        description="Le changement est enregistré dans l'historique de la fiche."
        className={DIALOG_CLASS}
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                changeStatusAction({
                  personId,
                  status: choice,
                  leftAt: text(form, "leftAt"),
                  leftReason: text(form, "leftReason") as LeftReason | "",
                  leftComment: text(form, "leftComment"),
                  pausedAt: text(form, "pausedAt"),
                  pauseUntil: text(form, "pauseUntil"),
                  pauseReason: text(form, "pauseReason"),
                  endAppointments: form.get("endAppointments") === "on",
                  endMentorships: form.get("endMentorships") === "on",
                  reason: text(form, "reason"),
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Nouveau statut" htmlFor="status-choice" error={errorOf("status")} required>
            <Select
              id="status-choice"
              name="status"
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value as PersonStatus);
              }}
            >
              {STATUS_CHOICES.map((s) => (
                <option key={s} value={s}>
                  {PERSON_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          {nivolMissing && (
            <p role="alert" className="rounded-inner bg-warn-soft p-3 text-small text-warn-ink">
              Cette personne n&apos;a pas de NIVOL : elle ne peut pas passer en Actif. Le NIVOL est
              attribué par Gaia.
            </p>
          )}
          {choice === "LEFT" && (
            <>
              <Field label="Date de départ" htmlFor="left-at" error={errorOf("leftAt")} required>
                <Input id="left-at" name="leftAt" type="date" />
              </Field>
              <Field
                label="Motif de départ"
                htmlFor="left-reason"
                error={errorOf("leftReason")}
                required
              >
                <Select id="left-reason" name="leftReason" defaultValue="">
                  <option value="">Choisir un motif</option>
                  {LEFT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {LEFT_REASON_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Commentaire" htmlFor="left-comment" error={errorOf("leftComment")}>
                <Textarea id="left-comment" name="leftComment" rows={3} />
              </Field>
              <Checkbox
                name="endAppointments"
                defaultChecked
                label="Terminer les nominations en cours à cette date"
              />
              <Checkbox
                name="endMentorships"
                defaultChecked
                label="Clore les parrainages en cours à cette date"
              />
              <p className="text-small text-muted">
                La date de purge est calculée à partir de la date de départ et de la durée de
                conservation.
              </p>
            </>
          )}
          {choice === "PAUSED" && (
            <>
              <Field label="Début de la pause" htmlFor="pause-at" error={errorOf("pausedAt")}>
                <Input id="pause-at" name="pausedAt" type="date" />
              </Field>
              <Field
                label="Reprise prévue"
                htmlFor="pause-until"
                hint="Un rappel sera créé à cette date."
                error={errorOf("pauseUntil")}
              >
                <Input id="pause-until" name="pauseUntil" type="date" />
              </Field>
              <Field label="Motif" htmlFor="pause-reason" error={errorOf("pauseReason")}>
                <Input id="pause-reason" name="pauseReason" maxLength={200} />
              </Field>
            </>
          )}
          {status === "LEFT" && choice === "ACTIVE" && (
            <Field
              label="Motif du retour"
              htmlFor="status-reason"
              error={errorOf("reason")}
              required
            >
              <Textarea id="status-reason" name="reason" rows={2} maxLength={500} />
            </Field>
          )}
          <FormMessage feedback={feedback} />
          <FormButtons pending={pending} label="Enregistrer le statut" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** « Retour d'un ancien » (DIAMANT): LEFT → ACTIVE, with a reason. */
function ReturnDialog({ personId }: { personId: string }) {
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
        <Button variant="outline" leftIcon={<RefreshCw aria-hidden="true" />}>
          Retour d&apos;un ancien
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Retour d'un ancien bénévole"
        description="La personne redevient active ; sa date de purge est effacée. Le retour est tracé."
        className={DIALOG_CLASS}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(() => returnFormerAction({ personId, reason: text(form, "reason") }), {
              onSuccess: () => {
                setOpen(false);
              },
            });
          }}
        >
          <Field label="Motif du retour" htmlFor="return-reason" error={errorOf("reason")} required>
            <Textarea id="return-reason" name="reason" rows={2} maxLength={500} />
          </Field>
          <FormMessage feedback={feedback} />
          <FormButtons pending={pending} label="Enregistrer le retour" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IdentityDialog({ personId, identity }: PersonActionsProps) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, errorOf, run, reset } = useFormAction<null>();
  type TextKey = Exclude<keyof IdentityValues, "greetingOptOut" | "civility">;
  const field = (name: TextKey, label: string, type = "text") => (
    <Field label={label} htmlFor={`identity-${name}`} error={errorOf(name)}>
      <Input
        id={`identity-${name}`}
        name={name}
        type={type}
        defaultValue={
          name === "phone" || name === "proPhone"
            ? formatPhone(identity[name])
            : (identity[name] ?? "")
        }
        autoComplete="off"
      />
    </Field>
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary" leftIcon={<Pencil aria-hidden="true" />}>
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Modifier l'identité et les coordonnées"
        description="Le NIVOL et l'e-mail Croix-Rouge sont gérés avec Gaia."
        className={DIALOG_CLASS}
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const value = (key: Exclude<keyof IdentityValues, "greetingOptOut">) => text(form, key);
            run(
              () =>
                updateIdentityAction({
                  personId,
                  civility: value("civility") as "MME" | "M" | "",
                  firstName: value("firstName"),
                  lastName: value("lastName"),
                  birthName: value("birthName"),
                  usageName: value("usageName"),
                  email: value("email"),
                  phone: value("phone"),
                  proEmail: value("proEmail"),
                  proPhone: value("proPhone"),
                  profession: value("profession"),
                  sector: value("sector"),
                  company: value("company"),
                  notes: value("notes"),
                  greetingOptOut: form.get("greetingOptOut") === "on",
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <Field label="Civilité" htmlFor="identity-civility" error={errorOf("civility")}>
            <Select id="identity-civility" name="civility" defaultValue={identity.civility ?? ""}>
              <option value="">Non renseignée</option>
              <option value="MME">{CIVILITY_LABELS.MME}</option>
              <option value="M">{CIVILITY_LABELS.M}</option>
            </Select>
          </Field>
          {field("firstName", "Prénom")}
          {field("lastName", "Nom")}
          {field("birthName", "Nom de naissance")}
          {field("usageName", "Nom d'usage")}
          {field("email", "E-mail", "email")}
          {field("phone", "Téléphone", "tel")}
          {field("proEmail", "E-mail professionnel", "email")}
          {field("proPhone", "Téléphone professionnel", "tel")}
          {field("profession", "Profession")}
          {field("sector", "Secteur")}
          {field("company", "Entreprise")}
          <Field
            label="Notes"
            htmlFor="identity-notes"
            error={errorOf("notes")}
            className="sm:col-span-2"
          >
            <Textarea
              id="identity-notes"
              name="notes"
              rows={4}
              defaultValue={identity.notes ?? ""}
            />
          </Field>
          <Checkbox
            name="greetingOptOut"
            defaultChecked={identity.greetingOptOut}
            label="Ne pas recevoir les messages d'anniversaire"
            className="sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <FormMessage feedback={feedback} />
            <FormButtons pending={pending} label="Enregistrer" />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NivolDialog({ personId, nivol }: PersonActionsProps) {
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
        <Button variant="ghost" leftIcon={<Hash aria-hidden="true" />}>
          Corriger le NIVOL
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Corriger le NIVOL"
        description="Réservé aux erreurs de saisie. Le motif est enregistré dans le journal d'audit."
        className={DIALOG_CLASS}
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                correctNivolAction({
                  personId,
                  nivol: text(form, "nivol"),
                  reason: text(form, "reason"),
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
          className="flex flex-col gap-4"
        >
          <Field
            label="NIVOL corrigé"
            htmlFor="nivol-value"
            hint={`11 chiffres suivis d'une lettre, ex. ${NIVOL_EXAMPLE}`}
            error={errorOf("nivol")}
            required
          >
            <Input id="nivol-value" name="nivol" defaultValue={nivol ?? ""} className="font-mono" />
          </Field>
          <Field
            label="Motif de la correction"
            htmlFor="nivol-reason"
            error={errorOf("reason")}
            required
          >
            <Textarea id="nivol-reason" name="reason" rows={3} />
          </Field>
          <FormMessage feedback={feedback} />
          <FormButtons pending={pending} label="Corriger" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Buttons of the person header, shown only when `can()` allows them. */
export function PersonActions(props: PersonActionsProps) {
  const { can } = props;
  const returnOnly = !can.changeStatus && can.returnFormer && props.status === "LEFT";
  if (!can.update && !can.changeStatus && !can.correctNivol && !returnOnly && !can.gdprExport) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {can.update && <IdentityDialog {...props} />}
      {can.changeStatus && props.status !== "CANDIDATE" && <StatusDialog {...props} />}
      {returnOnly && <ReturnDialog personId={props.personId} />}
      {can.correctNivol && <NivolDialog {...props} />}
      {can.gdprExport && (
        <a
          href={`/api/rgpd/${props.personRef}`}
          download
          className="inline-flex min-h-11 items-center gap-2 rounded-control px-4 text-body font-medium text-ink focus-ring hover:bg-veil"
        >
          <FileArchive aria-hidden="true" className="size-4" /> Exporter les données (RGPD)
        </a>
      )}
    </div>
  );
}
