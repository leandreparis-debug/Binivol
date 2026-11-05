"use client";

import { useState } from "react";
import { CheckCircle2, Handshake, Pencil, RotateCcw } from "lucide-react";
import type { CandidacyStage } from "@/generated/prisma/enums";
import { FollowUpDot } from "@/components/person/FollowUpDot";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ABANDON_REASONS } from "@/lib/candidacyForms";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ABANDON_REASON_LABELS, CANDIDACY_STAGE_LABELS } from "@/lib/labels";
import { NIVOL_EXAMPLE } from "@/lib/nivol";
import type { AllowedTransition } from "@/server/candidacy/machine";
import type { CandidacyView, IntegrationTab, MentorshipView } from "@/server/services/candidacies";
import {
  assignMentorAction,
  changeStageAction,
  endMentorshipAction,
  finalizeAction,
  reengageAction,
  updateCandidacyAction,
} from "../../candidats/actions";

const DIALOG = "max-h-[calc(100dvh-2rem)] overflow-y-auto";
const get = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

function Buttons({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-2">
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

function buttonLabel(t: AllowedTransition): string {
  const to = CANDIDACY_STAGE_LABELS[t.to];
  switch (t.kind) {
    case "advance":
      return `Passer à « ${to} »`;
    case "back":
      return `Revenir à « ${to} »`;
    case "abandon":
      return "Abandonner";
    case "resume":
      return `Reprendre à « ${to} »`;
    case "finalize":
      return "Finaliser l'intégration";
  }
}

/** One change of stage, in a dialog asking what the machine requires. */
function TransitionDialog({
  candidacy,
  transition,
  defaults,
}: {
  candidacy: CandidacyView;
  transition: AllowedTransition;
  defaults: { nextActions: Record<string, string>; followUpAt: string };
}) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, errorOf, run, reset } = useFormAction<null>();
  const needsNote = transition.requires.includes("note");
  const abandoning = transition.kind === "abandon";
  const label = buttonLabel(transition);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={transition.kind === "advance" ? "primary" : "outline"}>{label}</Button>
      </DialogTrigger>
      <DialogContent title={label} className={DIALOG}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                changeStageAction({
                  candidacyId: candidacy.id,
                  expectedStage: candidacy.stage,
                  toStage: transition.to,
                  note: get(form, "note"),
                  abandonReason: get(form, "abandonReason") as "OTHER" | "",
                  nextAction: get(form, "nextAction"),
                  followUpAt: get(form, "followUpAt"),
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
        >
          {abandoning && (
            <Field
              label="Motif d'abandon"
              htmlFor="tr-reason"
              error={errorOf("abandonReason")}
              required
            >
              <Select id="tr-reason" name="abandonReason" defaultValue="">
                <option value="">Choisir un motif</option>
                {ABANDON_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {ABANDON_REASON_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {!abandoning && (
            <>
              <Field label="Prochaine action" htmlFor="tr-next" error={errorOf("nextAction")}>
                <Input
                  id="tr-next"
                  name="nextAction"
                  defaultValue={defaults.nextActions[transition.to] ?? ""}
                />
              </Field>
              <Field label="Date de relance" htmlFor="tr-follow" error={errorOf("followUpAt")}>
                <Input
                  id="tr-follow"
                  name="followUpAt"
                  type="date"
                  defaultValue={defaults.followUpAt}
                />
              </Field>
            </>
          )}
          <Field
            label={needsNote ? "Note (obligatoire pour revenir en arrière)" : "Note"}
            htmlFor="tr-note"
            error={errorOf("note")}
            required={needsNote}
          >
            <Textarea id="tr-note" name="note" rows={3} />
          </Field>
          <FormMessage feedback={feedback} />
          <Buttons
            pending={pending}
            label={abandoning ? "Abandonner la candidature" : "Enregistrer"}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Finalisation (GAIA → DONE), then the offer to assign a mentor. */
function FinalizeDialog({
  candidacy,
  today,
  onDone,
}: {
  candidacy: CandidacyView;
  today: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, errorOf, run, reset } = useFormAction<unknown>();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button leftIcon={<CheckCircle2 aria-hidden="true" />}>Finaliser l&apos;intégration</Button>
      </DialogTrigger>
      <DialogContent
        title="Finaliser l'intégration"
        description="La personne devient bénévole active, et un point de suivi à 3 mois est planifié."
        className={DIALOG}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                finalizeAction({
                  candidacyId: candidacy.id,
                  nivol: get(form, "nivol"),
                  crfEmail: get(form, "crfEmail"),
                  entryDate: get(form, "entryDate"),
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                  onDone();
                },
              },
            );
          }}
        >
          <Field
            label="NIVOL"
            htmlFor="fin-nivol"
            hint={`11 chiffres suivis d'une lettre, ex. ${NIVOL_EXAMPLE}`}
            error={errorOf("nivol")}
            required
          >
            <Input id="fin-nivol" name="nivol" className="font-mono" autoComplete="off" />
          </Field>
          <Field
            label="E-mail Croix-Rouge"
            htmlFor="fin-crf"
            hint="Facultatif, se termine par @croix-rouge.fr"
            error={errorOf("crfEmail")}
          >
            <Input id="fin-crf" name="crfEmail" type="email" autoComplete="off" />
          </Field>
          <Field label="Date d'entrée" htmlFor="fin-entry" error={errorOf("entryDate")} required>
            <Input id="fin-entry" name="entryDate" type="date" defaultValue={today} />
          </Field>
          <FormMessage feedback={feedback} />
          <Buttons pending={pending} label="Finaliser" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Fields of the open candidacy, editable at any stage. */
function EditDialog({ candidacy, tab }: { candidacy: CandidacyView; tab: IntegrationTab }) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, errorOf, run, reset } = useFormAction<null>();
  const meeting = candidacy.meetingAt
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .format(candidacy.meetingAt)
        .replace(" ", "T")
    : "";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" leftIcon={<Pencil aria-hidden="true" />}>
          Modifier le suivi
        </Button>
      </DialogTrigger>
      <DialogContent title="Modifier le suivi de la candidature" className={DIALOG}>
        <form
          noValidate
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                updateCandidacyAction({
                  candidacyId: candidacy.id,
                  nextAction: get(form, "nextAction"),
                  followUpAt: get(form, "followUpAt"),
                  meetingAt: get(form, "meetingAt"),
                  ownerId: get(form, "ownerId"),
                  source: get(form, "source"),
                  interest: get(form, "interest"),
                  notes: get(form, "notes"),
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
        >
          <Field
            label="Prochaine action"
            htmlFor="ed-next"
            error={errorOf("nextAction")}
            className="sm:col-span-2"
          >
            <Input id="ed-next" name="nextAction" defaultValue={candidacy.nextAction ?? ""} />
          </Field>
          <Field label="Date de relance" htmlFor="ed-follow" error={errorOf("followUpAt")}>
            <Input
              id="ed-follow"
              name="followUpAt"
              type="date"
              defaultValue={iso(candidacy.followUpAt)}
            />
          </Field>
          <Field label="Rencontre" htmlFor="ed-meeting" error={errorOf("meetingAt")}>
            <Input id="ed-meeting" name="meetingAt" type="datetime-local" defaultValue={meeting} />
          </Field>
          <Field label="Responsable" htmlFor="ed-owner" error={errorOf("ownerId")}>
            <Select id="ed-owner" name="ownerId" defaultValue={candidacy.ownerId ?? ""}>
              <option value="">Sans responsable</option>
              {tab.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source" htmlFor="ed-source" error={errorOf("source")}>
            <Input
              id="ed-source"
              name="source"
              list="ed-sources"
              defaultValue={candidacy.source ?? ""}
            />
          </Field>
          <datalist id="ed-sources">
            {tab.sources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <Field
            label="Intérêt"
            htmlFor="ed-interest"
            error={errorOf("interest")}
            className="sm:col-span-2"
          >
            <Input id="ed-interest" name="interest" defaultValue={candidacy.interest ?? ""} />
          </Field>
          <Field
            label="Notes"
            htmlFor="ed-notes"
            error={errorOf("notes")}
            className="sm:col-span-2"
          >
            <Textarea id="ed-notes" name="notes" rows={4} defaultValue={candidacy.notes ?? ""} />
          </Field>
          <div className="sm:col-span-2">
            <FormMessage feedback={feedback} />
            <Buttons pending={pending} label="Enregistrer" />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Events({ candidacy }: { candidacy: CandidacyView }) {
  return (
    <ol className="flex flex-col divide-y divide-line">
      {candidacy.events.map((e) => (
        <li key={e.id} className="flex flex-col gap-0.5 py-2">
          <span className="text-body text-ink">
            {e.fromStage ? `${CANDIDACY_STAGE_LABELS[e.fromStage]} → ` : ""}
            {CANDIDACY_STAGE_LABELS[e.toStage]}
          </span>
          {e.note && <span className="text-small text-ink-2">{e.note}</span>}
          <span className="text-small text-muted">
            <span className="font-mono text-mono">{formatDateTime(e.at)}</span>
            {e.author ? ` · ${e.author}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Summary({ candidacy }: { candidacy: CandidacyView }) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="text-body text-ink">
        {value ?? <span className="text-muted">Non renseigné</span>}
      </dd>
    </div>
  );
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {row("Prochaine action", candidacy.nextAction)}
      {row(
        "Relance",
        candidacy.closedAt ? null : (
          <FollowUpDot state={candidacy.followUp} date={candidacy.followUpAt} />
        ),
      )}
      {row("Responsable", candidacy.owner)}
      {row(
        "Sans action depuis",
        `${String(candidacy.idleDays)} jour${candidacy.idleDays > 1 ? "s" : ""}`,
      )}
      {row(
        "Rencontre",
        candidacy.meetingAt ? (
          <span className="font-mono text-mono">{formatDateTime(candidacy.meetingAt)}</span>
        ) : null,
      )}
      {row(
        "Premier contact",
        candidacy.firstContactAt ? (
          <span className="font-mono text-mono">{formatDate(candidacy.firstContactAt)}</span>
        ) : null,
      )}
      {row("Source", candidacy.source)}
      {row("Intérêt", candidacy.interest)}
      {candidacy.abandonReason &&
        row(
          "Abandon",
          `${ABANDON_REASON_LABELS[candidacy.abandonReason]}${candidacy.abandonNote ? ` : ${candidacy.abandonNote}` : ""}`,
        )}
      {candidacy.notes &&
        row("Notes", <span className="whitespace-pre-line">{candidacy.notes}</span>)}
      {candidacy.legacyRef &&
        row("Ancien classeur", <span className="font-mono text-mono">{candidacy.legacyRef}</span>)}
    </dl>
  );
}

/** « Attribuer un parrain »: ranked suggestions (fewest mentees first). */
function MentorDialog({
  menteeId,
  tab,
  today,
  open,
  onOpenChange,
}: {
  menteeId: string;
  tab: IntegrationTab;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pending, feedback, errorOf, run, reset } = useFormAction<unknown>();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" leftIcon={<Handshake aria-hidden="true" />}>
          Attribuer un parrain
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Attribuer un parrain"
        description="Bénévoles actifs et majeurs, ceux qui ont le moins de filleuls en premier."
        className={DIALOG}
      >
        {tab.mentorSuggestions.length === 0 ? (
          <p className="text-body text-muted">Aucun parrain disponible.</p>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              run(
                () =>
                  assignMentorAction({
                    menteeId,
                    mentorId: get(form, "mentorId"),
                    startDate: get(form, "startDate"),
                    note: get(form, "note"),
                  }),
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            <Field label="Parrain" htmlFor="mt-mentor" error={errorOf("mentorId")} required>
              <Select
                id="mt-mentor"
                name="mentorId"
                defaultValue={tab.mentorSuggestions[0]?.id ?? ""}
              >
                {tab.mentorSuggestions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName} ({m.ref}) — {m.activeMentees} filleul
                    {m.activeMentees > 1 ? "s" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Début" htmlFor="mt-start" error={errorOf("startDate")} required>
              <Input id="mt-start" name="startDate" type="date" defaultValue={today} />
            </Field>
            <Field label="Note" htmlFor="mt-note" error={errorOf("note")}>
              <Textarea id="mt-note" name="note" rows={2} />
            </Field>
            <FormMessage feedback={feedback} />
            <Buttons pending={pending} label="Attribuer" />
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EndMentorship({
  mentorship,
  today,
}: {
  mentorship: Pick<MentorshipView, "id" | "mentorName">;
  today: string;
}) {
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
        <Button variant="ghost" aria-label={`Terminer le parrainage de ${mentorship.mentorName}`}>
          Terminer
        </Button>
      </DialogTrigger>
      <DialogContent title="Terminer le parrainage" className={DIALOG}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                endMentorshipAction({
                  mentorshipId: mentorship.id,
                  endDate: get(form, "endDate"),
                  note: get(form, "note"),
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
        >
          <Field label="Date de fin" htmlFor="me-end" error={errorOf("endDate")} required>
            <Input id="me-end" name="endDate" type="date" defaultValue={today} />
          </Field>
          <Field label="Note" htmlFor="me-note" error={errorOf("note")}>
            <Textarea id="me-note" name="note" rows={2} />
          </Field>
          <FormMessage feedback={feedback} />
          <Buttons pending={pending} label="Terminer le parrainage" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReengageButton({ personId }: { personId: string }) {
  const { pending, feedback, run } = useFormAction<unknown>();
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        loading={pending}
        leftIcon={<RotateCcw aria-hidden="true" />}
        onClick={() => {
          run(() => reengageAction({ personId, source: null, interest: null, note: null }));
        }}
      >
        Réengager cette personne
      </Button>
      <FormMessage feedback={feedback} />
    </div>
  );
}

/**
 * « Intégration » tab: the open (or resumable) candidacy with its hatched
 * progress, the buttons the machine allows, its history, past candidacies,
 * and the mentorship block.
 */
export function IntegrationPanel({
  personId,
  tab,
  today,
  defaultFollowUpAt,
}: {
  personId: string;
  tab: IntegrationTab;
  today: string;
  defaultFollowUpAt: string;
}) {
  const [finalized, setFinalized] = useState(false);
  const [mentorOpen, setMentorOpen] = useState(false);
  const c = tab.current;
  const stageIndex = (stage: CandidacyStage) =>
    ["FIRST_CONTACT", "MEETING", "CONFIRMED", "FILE", "GAIA", "DONE"].indexOf(stage) + 1;
  return (
    <div className="flex flex-col gap-6">
      {finalized && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <p role="status" className="text-body font-medium text-ok-ink">
              Intégration finalisée : la personne est bénévole active, et un point de suivi à 3 mois
              est planifié.
            </p>
            {tab.canManageMentorship && (
              <div>
                <Button
                  leftIcon={<Handshake aria-hidden="true" />}
                  onClick={() => {
                    setMentorOpen(true);
                  }}
                >
                  Attribuer un parrain
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {c ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Candidature en cours</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-section text-ink">{CANDIDACY_STAGE_LABELS[c.stage]}</p>
              {c.stage !== "ABANDONED" && (
                <ProgressBar
                  value={stageIndex(c.stage)}
                  max={6}
                  label="Progression de l'intégration"
                  valueText={`Étape ${String(stageIndex(c.stage))} sur 6`}
                  showValue
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {c.transitions.map((t) =>
                t.kind === "finalize" ? (
                  <FinalizeDialog
                    key={t.to}
                    candidacy={c}
                    today={today}
                    onDone={() => {
                      setFinalized(true);
                    }}
                  />
                ) : (
                  <TransitionDialog
                    key={`${t.kind}-${t.to}`}
                    candidacy={c}
                    transition={t}
                    defaults={{
                      nextActions: tab.defaultNextActions,
                      followUpAt: defaultFollowUpAt,
                    }}
                  />
                ),
              )}
              {c.closedAt === null && <EditDialog candidacy={c} tab={tab} />}
            </div>
            <Summary candidacy={c} />
            <section aria-labelledby="events-title" className="flex flex-col gap-2">
              <h3 id="events-title" className="text-small font-medium text-muted">
                Historique de la candidature
              </h3>
              <Events candidacy={c} />
            </section>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <p className="text-body text-muted">Aucune candidature en cours.</p>
            {tab.canReengage && <ReengageButton personId={personId} />}
          </CardContent>
        </Card>
      )}

      {tab.past.length > 0 && (
        <details className="rounded-card bg-surface p-6">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-pill text-section text-ink focus-ring">
            Candidatures passées ({tab.past.length})
          </summary>
          <div className="mt-4 flex flex-col gap-6">
            {tab.past.map((p) => (
              <section key={p.id} className="flex flex-col gap-3 border-t border-line pt-4">
                <p className="text-body font-medium text-ink">
                  {CANDIDACY_STAGE_LABELS[p.stage]}
                  {p.closedAt && (
                    <span className="text-small font-normal text-muted">
                      {" "}
                      · close le{" "}
                      <span className="font-mono text-mono">{formatDate(p.closedAt)}</span>
                    </span>
                  )}
                </p>
                <Summary candidacy={p} />
                <Events candidacy={p} />
              </section>
            ))}
          </div>
        </details>
      )}

      {tab.mentorships && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Parrainage</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {tab.mentorships.length === 0 ? (
              <p className="text-body text-muted">Aucun parrain.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {tab.mentorships.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex flex-col">
                      <span className="text-body text-ink">
                        {m.mentorName}{" "}
                        <span className="font-mono text-mono text-muted">{m.mentorRef}</span>
                      </span>
                      <span className="text-small text-ink-2">
                        {m.current ? "En cours" : "Terminé"} · depuis le{" "}
                        <span className="font-mono text-mono">{formatDate(m.startDate)}</span>
                        {m.endDate && (
                          <>
                            {" "}
                            · fin le{" "}
                            <span className="font-mono text-mono">{formatDate(m.endDate)}</span>
                          </>
                        )}
                      </span>
                    </span>
                    {m.current && m.endDate === null && (
                      <EndMentorship mentorship={m} today={today} />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {tab.canManageMentorship && (
              <div>
                <MentorDialog
                  menteeId={personId}
                  tab={tab}
                  today={today}
                  open={mentorOpen}
                  onOpenChange={setMentorOpen}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
