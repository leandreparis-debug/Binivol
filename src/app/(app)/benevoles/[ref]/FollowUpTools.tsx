"use client";

import { useState } from "react";
import { ClipboardCheck, ShieldCheck } from "lucide-react";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { completeFollowUpAction, recordB3Action } from "./followUpActions";

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

/** « Compléter le point »: date, short report (never shown in a list), next date. */
export function CompleteFollowUpDialog({
  followUpId,
  label,
  today,
  suggestedNext,
}: {
  followUpId: string;
  label: string;
  today: string;
  suggestedNext: string;
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
        <Button
          variant="outline"
          className="self-start"
          leftIcon={<ClipboardCheck aria-hidden="true" />}
        >
          Compléter le point
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Compléter : ${label}`}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            run(
              () =>
                completeFollowUpAction({
                  followUpId,
                  doneAt: get(f, "doneAt"),
                  summary: get(f, "summary"),
                  nextDate: get(f, "nextDate"),
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
            label="Date du point"
            htmlFor={`fu-done-${followUpId}`}
            error={errorOf("doneAt")}
            required
          >
            <Input id={`fu-done-${followUpId}`} name="doneAt" type="date" defaultValue={today} />
          </Field>
          <Field
            label="Compte rendu"
            htmlFor={`fu-sum-${followUpId}`}
            hint="Court, 2 000 caractères au plus. Il n'apparaît dans aucune liste."
            error={errorOf("summary")}
          >
            <Textarea id={`fu-sum-${followUpId}`} name="summary" rows={5} maxLength={2000} />
          </Field>
          <Field
            label="Prochain point"
            htmlFor={`fu-next-${followUpId}`}
            hint="Par défaut, l'anniversaire de l'entrée."
            error={errorOf("nextDate")}
          >
            <Input
              id={`fu-next-${followUpId}`}
              name="nextDate"
              type="date"
              defaultValue={suggestedNext}
            />
          </Field>
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <Close />
            <Button type="submit" loading={pending}>
              Enregistrer le point
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** B3 (TOPAZE): date and outcome of the check only, never a copy of the record. */
export function B3Dialog({ personId, today }: { personId: string; today: string }) {
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
        <Button
          variant="outline"
          className="self-start"
          leftIcon={<ShieldCheck aria-hidden="true" />}
        >
          Enregistrer la vérification du B3
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Vérification du B3"
        description="Binivol ne conserve jamais de copie du casier : seulement la date, l'issue et qui a vérifié. Une vérification par année civile."
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            run(
              () =>
                recordB3Action({
                  personId,
                  checkedAt: get(f, "checkedAt"),
                  status: get(f, "status"),
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
        >
          <Field label="Date de vérification" htmlFor="b3-at" error={errorOf("checkedAt")} required>
            <Input id="b3-at" name="checkedAt" type="date" defaultValue={today} />
          </Field>
          <Field label="Issue" htmlFor="b3-status" error={errorOf("status")} required>
            <Select id="b3-status" name="status" defaultValue="CLEAR">
              <option value="CLEAR">Aucune mention</option>
              <option value="FLAGGED">Mention signalée (visible par TOPAZE seul)</option>
            </Select>
          </Field>
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <Close />
            <Button type="submit" loading={pending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
