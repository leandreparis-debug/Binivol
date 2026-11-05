"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CalendarPlus, Save, XCircle } from "lucide-react";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { TRAINING_RESULT_LABELS } from "@/lib/labels";
import type { ActionResult } from "@/server/actions/defineAction";
import type { GroupEntryResult } from "@/server/services/trainings";
import type { Warning } from "@/server/warnings";
import {
  cancelRecordAction,
  cancelSessionAction,
  createSessionAction,
  recordGroupAction,
  scheduleWishAction,
  setResultsAction,
} from "./actions";

const DIALOG = "max-h-[calc(100dvh-2rem)] overflow-y-auto";

export interface TrainingOption {
  id: string;
  code: string;
  label: string;
}

const get = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** Warnings shown before saving, with « Enregistrer quand même ». */
export function WarningsBox({
  warnings,
  pending,
  onAccept,
}: {
  warnings: Warning[];
  pending: boolean;
  onAccept: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-inner bg-warn-soft p-4"
      data-testid="warnings"
    >
      <p className="flex items-center gap-2 text-small font-medium text-warn-ink">
        <AlertTriangle className="size-4" aria-hidden="true" />
        {warnings.length === 1 ? "Un avertissement" : `${String(warnings.length)} avertissements`} :
        rien n&apos;est bloqué, vérifiez avant d&apos;enregistrer.
      </p>
      <ul className="list-disc pl-5 text-small text-ink">
        {warnings.map((w, i) => (
          <li key={`${w.code}-${w.personId ?? ""}-${String(i)}`}>{w.message}</li>
        ))}
      </ul>
      <Button className="self-start" loading={pending} onClick={onAccept}>
        Enregistrer quand même
      </Button>
    </div>
  );
}

/** Runs a group entry: first the warnings, then the save once accepted. */
export function useGroupEntry(
  action: (input: unknown) => Promise<ActionResult<GroupEntryResult>> = recordGroupAction,
) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [warnings, setWarnings] = useState<{ list: Warning[]; key: string } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const submit = (input: Record<string, unknown>, onSaved?: () => void) => {
    setMessage(null);
    start(async () => {
      const result = await action({ ...input, acceptedWarnings: warnings?.key ?? null });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage({ tone: "danger", text: result.error });
        return;
      }
      setErrors({});
      if (!result.data.saved) {
        setWarnings({ list: result.data.warnings, key: result.data.warningsKey });
        return;
      }
      setWarnings(null);
      const n = result.data.recordIds.length;
      setMessage({
        tone: "ok",
        text: `${String(n)} ligne${n > 1 ? "s" : ""} enregistrée${n > 1 ? "s" : ""}.`,
      });
      onSaved?.();
      router.refresh();
    });
  };
  return {
    pending,
    warnings,
    message,
    errorOf: (k: string) => errors[k]?.[0],
    submit,
    reset: () => {
      setWarnings(null);
      setMessage(null);
    },
  };
}

/** New session (FORMAT, TOPAZE). */
export function NewSessionDialog({ trainings }: { trainings: TrainingOption[] }) {
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
        <Button className="self-start" leftIcon={<CalendarPlus aria-hidden="true" />}>
          Nouvelle session
        </Button>
      </DialogTrigger>
      <DialogContent title="Nouvelle session" className={DIALOG}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            run(
              () =>
                createSessionAction({
                  referenceId: get(f, "referenceId"),
                  startDate: get(f, "startDate"),
                  endDate: get(f, "endDate"),
                  place: get(f, "place"),
                  pegassUrl: get(f, "pegassUrl"),
                  capacity: get(f, "capacity"),
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
        >
          <Field label="Formation" htmlFor="ns-ref" error={errorOf("referenceId")} required>
            <Select id="ns-ref" name="referenceId">
              {trainings.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Début" htmlFor="ns-start" error={errorOf("startDate")} required>
              <Input id="ns-start" name="startDate" type="date" />
            </Field>
            <Field label="Fin" htmlFor="ns-end" error={errorOf("endDate")}>
              <Input id="ns-end" name="endDate" type="date" />
            </Field>
          </div>
          <Field label="Lieu" htmlFor="ns-place" error={errorOf("place")}>
            <Input id="ns-place" name="place" maxLength={120} />
          </Field>
          <Field label="Lien Pegass" htmlFor="ns-pegass" error={errorOf("pegassUrl")}>
            <Input id="ns-pegass" name="pegassUrl" type="url" />
          </Field>
          <Field label="Places" htmlFor="ns-cap" error={errorOf("capacity")}>
            <Input id="ns-cap" name="capacity" inputMode="numeric" />
          </Field>
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Fermer
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              Créer la session
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Cancel with a reason (session or line): never deleted, traced. */
export function CancelDialog({
  id,
  what,
  label,
}: {
  id: string;
  what: "session" | "record";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, errorOf, run, reset } = useFormAction<null>();
  const title = what === "session" ? "Annuler la session" : "Annuler la ligne";
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
          variant="ghost"
          aria-label={`${title} ${label}`}
          leftIcon={<XCircle aria-hidden="true" />}
        >
          Annuler
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={label}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const reason = get(new FormData(event.currentTarget), "reason");
            const call = what === "session" ? cancelSessionAction : cancelRecordAction;
            run(() => call({ id, reason }), {
              onSuccess: () => {
                setOpen(false);
              },
            });
          }}
        >
          <Field label="Motif" htmlFor={`cancel-${id}`} error={errorOf("reason")} required>
            <Textarea id={`cancel-${id}`} name="reason" rows={3} maxLength={500} />
          </Field>
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Fermer
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              {title}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface EntryPerson {
  id: string;
  ref: string;
  firstName: string;
  lastName: string;
  status: string;
}

/** « Saisie de groupe »: one training, a date, a result, then the people (search, boxes). */
export function GroupEntryForm({
  trainings,
  people,
  sessionId,
  fixedTraining,
}: {
  trainings: TrainingOption[];
  people: EntryPerson[];
  sessionId?: string;
  fixedTraining?: TrainingOption;
}) {
  const entry = useGroupEntry();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fields, setFields] = useState({
    referenceId: fixedTraining?.id ?? trainings[0]?.id ?? "",
    date: "",
    result: "PASSED",
  });
  const shown = useMemo(() => {
    const q = query.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    if (!q) return people;
    return people.filter((p) =>
      `${p.firstName} ${p.lastName} ${p.ref}`
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .includes(q),
    );
  }, [people, query]);
  const input = () => ({
    referenceId: fields.referenceId,
    date: fields.date,
    result: fields.result,
    personIds: [...selected],
    sessionId: sessionId ?? null,
  });
  const change = (patch: Partial<typeof fields>) => {
    setFields((f) => ({ ...f, ...patch }));
    entry.reset();
  };
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        entry.submit(input(), () => {
          setSelected(new Set());
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {fixedTraining ? (
          <p className="text-body text-ink">
            {fixedTraining.code} — {fixedTraining.label}
          </p>
        ) : (
          <Field label="Formation" htmlFor="ge-ref" error={entry.errorOf("referenceId")} required>
            <Select
              id="ge-ref"
              value={fields.referenceId}
              onChange={(e) => {
                change({ referenceId: e.target.value });
              }}
            >
              {trainings.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label="Date"
          htmlFor="ge-date"
          hint="Date de réussite, ou de la formation"
          error={entry.errorOf("date")}
        >
          <Input
            id="ge-date"
            type="date"
            value={fields.date}
            onChange={(e) => {
              change({ date: e.target.value });
            }}
          />
        </Field>
        <Field label="Résultat" htmlFor="ge-result" error={entry.errorOf("result")} required>
          <Select
            id="ge-result"
            value={fields.result}
            onChange={(e) => {
              change({ result: e.target.value });
            }}
          >
            {(["PASSED", "REGISTERED", "FAILED", "ABSENT", "TO_CONFIRM"] as const).map((r) => (
              <option key={r} value={r}>
                {TRAINING_RESULT_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-small font-medium text-ink">
          Personnes ({selected.size} cochée{selected.size > 1 ? "s" : ""})
        </legend>
        <Field label="Rechercher" htmlFor="ge-q">
          <Input
            id="ge-q"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
        </Field>
        <ul
          className="grid max-h-96 gap-1 overflow-y-auto sm:grid-cols-2"
          data-testid="group-people"
        >
          {shown.map((p) => (
            <li key={p.id}>
              <Checkbox
                checked={selected.has(p.id)}
                label={`${p.firstName} ${p.lastName}`}
                hint={p.status === "ACTIVE" ? p.ref : `${p.ref} · ${p.status.toLowerCase()}`}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(p.id);
                  else next.delete(p.id);
                  setSelected(next);
                  entry.reset();
                }}
              />
            </li>
          ))}
        </ul>
        {entry.errorOf("personIds") && (
          <p role="alert" className="text-small font-medium text-danger-ink">
            {entry.errorOf("personIds")}
          </p>
        )}
      </fieldset>
      {entry.warnings && (
        <WarningsBox
          warnings={entry.warnings.list}
          pending={entry.pending}
          onAccept={() => {
            entry.submit(input(), () => {
              setSelected(new Set());
            });
          }}
        />
      )}
      {entry.message && (
        <p
          role={entry.message.tone === "ok" ? "status" : "alert"}
          className={
            entry.message.tone === "ok"
              ? "text-small text-ink-2"
              : "text-small font-medium text-danger-ink"
          }
        >
          {entry.message.text}
        </p>
      )}
      {!entry.warnings && (
        <Button
          type="submit"
          className="self-start"
          loading={entry.pending}
          leftIcon={<Save aria-hidden="true" />}
        >
          Vérifier et enregistrer
        </Button>
      )}
    </form>
  );
}

/** Results of the lines of a session, one by one or in bulk. */
export function ResultsForm({
  lines,
}: {
  lines: { id: string; name: string; result: string; cancelled: boolean }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { pending, feedback, errorOf, run } = useFormAction<{ updated: number }>();
  const live = lines.filter((l) => !l.cancelled);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        run(
          () =>
            setResultsAction({
              recordIds: [...selected],
              result: get(f, "result"),
              date: get(f, "date"),
            }),
          { success: "Résultats enregistrés." },
        );
      }}
    >
      <ul className="flex flex-col gap-1">
        {live.map((l) => (
          <li key={l.id}>
            <Checkbox
              checked={selected.has(l.id)}
              label={l.name}
              hint={TRAINING_RESULT_LABELS[l.result as keyof typeof TRAINING_RESULT_LABELS]}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(l.id);
                else next.delete(l.id);
                setSelected(next);
              }}
            />
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Résultat" htmlFor="rs-result" required>
          <Select id="rs-result" name="result" defaultValue="PASSED">
            {(["PASSED", "FAILED", "ABSENT", "TO_CONFIRM", "REGISTERED"] as const).map((r) => (
              <option key={r} value={r}>
                {TRAINING_RESULT_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Date de réussite"
          htmlFor="rs-date"
          hint="Par défaut : la date de la session"
          error={errorOf("date")}
        >
          <Input id="rs-date" name="date" type="date" />
        </Field>
      </div>
      {errorOf("recordIds") && (
        <p role="alert" className="text-small font-medium text-danger-ink">
          {errorOf("recordIds")}
        </p>
      )}
      <FormMessage feedback={feedback} />
      <Button type="submit" className="self-start" loading={pending}>
        Enregistrer les résultats
      </Button>
    </form>
  );
}

/** « Inscrire à une session » from a waiting list. */
export function ScheduleWish({
  wishId,
  name,
  sessions,
}: {
  wishId: string;
  name: string;
  sessions: { id: string; label: string }[];
}) {
  const { pending, feedback, run } = useFormAction<{ id: string }>();
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  if (sessions.length === 0)
    return <span className="text-small text-muted">Aucune session à venir</span>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={`Session pour ${name}`} htmlFor={`sw-${wishId}`} className="min-w-48">
        <Select
          id={`sw-${wishId}`}
          value={sessionId}
          onChange={(e) => {
            setSessionId(e.target.value);
          }}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        variant="outline"
        loading={pending}
        onClick={() => {
          run(() => scheduleWishAction({ wishId, sessionId }), { success: "Inscription faite." });
        }}
      >
        Inscrire
      </Button>
      <FormMessage feedback={feedback} />
    </div>
  );
}
