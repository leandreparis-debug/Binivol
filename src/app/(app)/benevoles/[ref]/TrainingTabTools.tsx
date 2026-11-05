"use client";

import { useState } from "react";
import { BadgePlus, CalendarCheck, GraduationCap, Heart, XCircle } from "lucide-react";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { TRAINING_RESULT_LABELS } from "@/lib/labels";
import type { AppointmentResult } from "@/server/services/trainings";
import type { Warning } from "@/server/warnings";
import { addWishAction, recordForPersonAction } from "../../formations/actions";
import { useGroupEntry, WarningsBox, type TrainingOption } from "../../formations/TrainingForms";
import {
  cancelAppointmentAction,
  createAppointmentAction,
  endAppointmentAction,
} from "./appointmentActions";

const DIALOG = "max-h-[calc(100dvh-2rem)] overflow-y-auto";
const get = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

function Close() {
  return (
    <DialogClose asChild>
      <Button type="button" variant="ghost">
        Fermer
      </Button>
    </DialogClose>
  );
}

/** « Ajouter une formation » for this person (warnings shown before saving). */
export function AddTrainingDialog({
  personId,
  trainings,
  today,
}: {
  personId: string;
  trainings: TrainingOption[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const entry = useGroupEntry(recordForPersonAction);
  const [values, setValues] = useState({
    referenceId: trainings[0]?.id ?? "",
    date: today,
    result: "PASSED",
  });
  const input = () => ({ ...values, personIds: [personId] });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) entry.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="self-start" leftIcon={<GraduationCap aria-hidden="true" />}>
          Ajouter une formation
        </Button>
      </DialogTrigger>
      <DialogContent title="Ajouter une formation" className={DIALOG}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            entry.submit(input(), () => {
              setOpen(false);
            });
          }}
        >
          <Field label="Formation" htmlFor="at-ref" error={entry.errorOf("referenceId")} required>
            <Select
              id="at-ref"
              value={values.referenceId}
              onChange={(e) => {
                setValues({ ...values, referenceId: e.target.value });
                entry.reset();
              }}
            >
              {trainings.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Date"
            htmlFor="at-date"
            hint="Vide si inconnue"
            error={entry.errorOf("date")}
          >
            <Input
              id="at-date"
              type="date"
              value={values.date}
              onChange={(e) => {
                setValues({ ...values, date: e.target.value });
                entry.reset();
              }}
            />
          </Field>
          <Field label="Résultat" htmlFor="at-result" required>
            <Select
              id="at-result"
              value={values.result}
              onChange={(e) => {
                setValues({ ...values, result: e.target.value });
                entry.reset();
              }}
            >
              {(["PASSED", "REGISTERED", "FAILED", "ABSENT", "TO_CONFIRM"] as const).map((r) => (
                <option key={r} value={r}>
                  {TRAINING_RESULT_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          {entry.warnings && (
            <WarningsBox
              warnings={entry.warnings.list}
              pending={entry.pending}
              onAccept={() => {
                entry.submit(input(), () => {
                  setOpen(false);
                });
              }}
            />
          )}
          {entry.message?.tone === "danger" && (
            <p role="alert" className="text-small font-medium text-danger-ink">
              {entry.message.text}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Close />
            {!entry.warnings && (
              <Button type="submit" loading={entry.pending}>
                Enregistrer
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** « Ajouter un souhait » (waiting list of a training). */
export function AddWishDialog({
  personId,
  trainings,
}: {
  personId: string;
  trainings: TrainingOption[];
}) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, errorOf, run, reset } = useFormAction<{ id: string }>();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="self-start" leftIcon={<Heart aria-hidden="true" />}>
          Ajouter un souhait
        </Button>
      </DialogTrigger>
      <DialogContent title="Ajouter un souhait de formation" className={DIALOG}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            run(
              () =>
                addWishAction({
                  personId,
                  referenceId: get(f, "referenceId"),
                  priority: get(f, "priority") || "0",
                  comment: get(f, "comment"),
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
        >
          <Field label="Formation" htmlFor="aw-ref" error={errorOf("referenceId")} required>
            <Select id="aw-ref" name="referenceId">
              {trainings.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priorité" htmlFor="aw-prio" hint="0 à 10, la plus haute d'abord">
            <Input id="aw-prio" name="priority" inputMode="numeric" defaultValue="0" />
          </Field>
          <Field label="Commentaire" htmlFor="aw-comment">
            <Textarea id="aw-comment" name="comment" rows={2} maxLength={500} />
          </Field>
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <Close />
            <Button type="submit" loading={pending}>
              Ajouter
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** « Nommer »: function, start, authorised by, decision, comment; warnings before saving. */
export function AppointDialog({
  personId,
  functions,
  today,
}: {
  personId: string;
  functions: TrainingOption[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, errorOf, run, reset } = useFormAction<AppointmentResult>();
  const [warnings, setWarnings] = useState<{ list: Warning[]; key: string } | null>(null);
  const submit = (form: HTMLFormElement) => {
    const f = new FormData(form);
    run(
      () =>
        createAppointmentAction({
          personId,
          referenceId: get(f, "referenceId"),
          startDate: get(f, "startDate"),
          authorizedBy: get(f, "authorizedBy"),
          decisionRef: get(f, "decisionRef"),
          comment: get(f, "comment"),
          acceptedWarnings: warnings?.key ?? null,
        }),
      {
        onSuccess: (data) => {
          if (data.saved) {
            setWarnings(null);
            setOpen(false);
          } else setWarnings({ list: data.warnings, key: data.warningsKey });
        },
      },
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          setWarnings(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="self-start" leftIcon={<BadgePlus aria-hidden="true" />}>
          Nommer
        </Button>
      </DialogTrigger>
      <DialogContent title="Nommer à une fonction" className={DIALOG}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onChange={() => {
            setWarnings(null);
          }}
          onSubmit={(event) => {
            event.preventDefault();
            submit(event.currentTarget);
          }}
        >
          <Field label="Fonction" htmlFor="ap-ref" error={errorOf("referenceId")} required>
            <Select id="ap-ref" name="referenceId">
              {functions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date de début" htmlFor="ap-start" error={errorOf("startDate")} required>
            <Input id="ap-start" name="startDate" type="date" defaultValue={today} />
          </Field>
          <Field label="Autorisée par" htmlFor="ap-by" error={errorOf("authorizedBy")}>
            <Input id="ap-by" name="authorizedBy" maxLength={120} />
          </Field>
          <Field label="Référence de la décision" htmlFor="ap-dec">
            <Input id="ap-dec" name="decisionRef" maxLength={80} />
          </Field>
          <Field label="Commentaire" htmlFor="ap-comment">
            <Textarea id="ap-comment" name="comment" rows={2} maxLength={500} />
          </Field>
          {warnings && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-inner bg-warn-soft p-4"
              data-testid="warnings"
            >
              <p className="text-small font-medium text-warn-ink">
                Avertissement : rien n&apos;est bloqué, vérifiez avant d&apos;enregistrer.
              </p>
              <ul className="list-disc pl-5 text-small text-ink">
                {warnings.list.map((w) => (
                  <li key={w.code}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <Close />
            <Button type="submit" loading={pending}>
              {warnings ? "Enregistrer quand même" : "Nommer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** « Terminer » (end date) or « Annuler » (reason) an appointment. */
export function AppointmentLineTools({
  id,
  label,
  today,
}: {
  id: string;
  label: string;
  today: string;
}) {
  const [mode, setMode] = useState<"end" | "cancel" | null>(null);
  const { pending, feedback, errorOf, run, reset } = useFormAction<null>();
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(next) => {
        if (!next) {
          setMode(null);
          reset();
        }
      }}
    >
      <div className="flex flex-wrap gap-1">
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            aria-label={`Terminer ${label}`}
            leftIcon={<CalendarCheck aria-hidden="true" />}
            onClick={() => {
              setMode("end");
            }}
          >
            Terminer
          </Button>
        </DialogTrigger>
        <Button
          variant="ghost"
          aria-label={`Annuler ${label}`}
          leftIcon={<XCircle aria-hidden="true" />}
          onClick={() => {
            setMode("cancel");
          }}
        >
          Annuler
        </Button>
      </div>
      <DialogContent
        title={mode === "cancel" ? "Annuler la nomination" : "Terminer la nomination"}
        description={label}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            run(
              () =>
                mode === "cancel"
                  ? cancelAppointmentAction({ id, reason: get(f, "reason") })
                  : endAppointmentAction({ id, endDate: get(f, "endDate") }),
              {
                onSuccess: () => {
                  setMode(null);
                },
              },
            );
          }}
        >
          {mode === "cancel" ? (
            <Field label="Motif" htmlFor={`ac-${id}`} error={errorOf("reason")} required>
              <Textarea id={`ac-${id}`} name="reason" rows={3} maxLength={500} />
            </Field>
          ) : (
            <Field label="Date de fin" htmlFor={`ae-${id}`} error={errorOf("endDate")} required>
              <Input id={`ae-${id}`} name="endDate" type="date" defaultValue={today} />
            </Field>
          )}
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <Close />
            <Button type="submit" loading={pending}>
              {mode === "cancel" ? "Annuler la nomination" : "Terminer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
