"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { TRAINING_RESULT_LABELS } from "@/lib/labels";
import { MATRIX_TONE } from "@/lib/matrix";
import { ENTRY_RESULTS } from "@/lib/trainingForms";
import type { MatrixCellDetail, MatrixCellRecord, MatrixView } from "@/server/services/matrix";
import {
  cancelRecordForPersonAction,
  matrixCellAction,
  recordForPersonAction,
  updateRecordForPersonAction,
} from "../actions";
import { useGroupEntry, WarningsBox } from "../TrainingForms";

const DIALOG = "max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto";

interface Selected {
  personId: string;
  personName: string;
  referenceId: string;
  code: string;
  label: string;
}

/**
 * Desktop table of the matrix. Sticky first row and first column. The cells
 * of a person the actor may edit (`training.write`, computed by the server)
 * are buttons: a click opens the lines of this training for her, to add,
 * change or remove one. The other cells stay read-only.
 */
export function MatrixTable({ view, today }: { view: MatrixView; today: string }) {
  const [selected, setSelected] = useState<Selected | null>(null);
  return (
    <Card className="hidden md:block">
      <CardContent className="p-0">
        <div
          className="max-h-[70vh] overflow-auto rounded-card focus-ring"
          tabIndex={0}
          role="region"
          aria-label="Matrice des compétences (défilement au clavier)"
          data-testid="matrix"
        >
          <table className="border-separate border-spacing-0 text-small">
            <caption className="sr-only">
              Compétences des bénévoles : une ligne par personne, une colonne par formation.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-20 min-w-48 border-b border-line bg-surface px-3 py-2 text-left font-medium text-ink-2"
                >
                  Bénévole
                </th>
                {view.columns.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    title={c.label}
                    className="sticky top-0 z-10 min-w-20 border-b border-line bg-surface px-2 py-2 text-center font-mono font-medium text-ink"
                  >
                    <abbr title={c.label} className="no-underline">
                      {c.code}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-line bg-surface px-3 py-1 text-left font-normal"
                  >
                    <Link
                      href={`/benevoles/${r.ref}?onglet=formations`}
                      className="inline-flex min-h-11 items-center text-ink underline-offset-4 focus-ring hover:underline"
                    >
                      {r.name}
                    </Link>
                  </th>
                  {r.cells.map((cell, i) => {
                    const column = view.columns[i];
                    if (!r.canWrite || !column) {
                      return (
                        <td
                          key={column?.id ?? i}
                          aria-label={cell.label}
                          className={cn(
                            "border-b border-line px-2 py-1 text-center whitespace-nowrap",
                            MATRIX_TONE[cell.tone],
                          )}
                        >
                          <span aria-hidden="true">{cell.symbol}</span>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={column.id}
                        className={cn(
                          "border-b border-line p-0 text-center whitespace-nowrap",
                          MATRIX_TONE[cell.tone],
                        )}
                      >
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          data-cell={`${r.ref}:${column.code}`}
                          className="inline-flex min-h-11 w-full min-w-20 items-center justify-center px-2 focus-ring hover:bg-veil"
                          onClick={() => {
                            setSelected({
                              personId: r.id,
                              personName: r.name,
                              referenceId: column.id,
                              code: column.code,
                              label: column.label,
                            });
                          }}
                        >
                          <span aria-hidden="true">{cell.symbol || "·"}</span>
                          {/* The accessible name, without aria-label (WCAG 2.5.3). */}
                          <span className="sr-only">{`${cell.label} — ${r.name}. Modifier`}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && (
          <DialogContent
            title={`${selected.code} — ${selected.personName}`}
            description={selected.label}
            className={DIALOG}
          >
            <CellEditor
              key={`${selected.personId}:${selected.referenceId}`}
              {...selected}
              today={today}
            />
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}

/** The lines of one cell, loaded on demand, with the add / change / remove forms. */
function CellEditor({ personId, referenceId, today }: Selected & { today: string }) {
  const [detail, setDetail] = useState<MatrixCellDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  const load = useCallback(() => {
    start(async () => {
      const result = await matrixCellAction({ personId, referenceId });
      if (result.ok) {
        setDetail(result.data);
        setError(null);
      } else setError(result.error);
    });
  }, [personId, referenceId]);

  useEffect(load, [load]);

  const changed = () => {
    load();
    router.refresh();
  };

  if (error) {
    return (
      <p role="alert" className="text-small font-medium text-danger-ink">
        {error}
      </p>
    );
  }
  if (!detail) {
    return (
      <p className="flex items-center gap-2 text-small text-muted" role="status">
        <Spinner /> Chargement…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6" data-testid="matrix-cell">
      <p className={cn("rounded-inner px-3 py-2 text-small", MATRIX_TONE[detail.cell.tone])}>
        État : {detail.cell.label}
      </p>
      <section aria-labelledby="matrix-lines" className="flex flex-col gap-2">
        <h3 id="matrix-lines" className="text-body font-semibold text-ink">
          Formations suivies
        </h3>
        {detail.records.length === 0 ? (
          <p className="text-small text-muted">Aucune ligne pour cette formation.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.records.map((r) => (
              <RecordLine key={r.id} record={r} canWrite={detail.canWrite} onChanged={changed} />
            ))}
          </ul>
        )}
      </section>
      {detail.canWrite && (
        <AddLine personId={personId} referenceId={referenceId} today={today} onSaved={changed} />
      )}
      <div className="flex justify-end">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Fermer
          </Button>
        </DialogClose>
      </div>
    </div>
  );
}

function describe(r: MatrixCellRecord): string {
  const parts = [TRAINING_RESULT_LABELS[r.result]];
  const when = r.date ?? r.sessionStart;
  parts.push(when ? `le ${formatDate(new Date(`${when}T00:00:00Z`))}` : "date inconnue");
  if (r.expiresAt)
    parts.push(`valable jusqu'au ${formatDate(new Date(`${r.expiresAt}T00:00:00Z`))}`);
  if (r.place) parts.push(r.place);
  return parts.join(" · ");
}

/** One live line: « Modifier » (result, date) and « Supprimer » (cancelled with a reason). */
function RecordLine({
  record,
  canWrite,
  onChanged,
}: {
  record: MatrixCellRecord;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "remove">("view");
  const [result, setResult] = useState<string>(
    (ENTRY_RESULTS as readonly string[]).includes(record.result) ? record.result : "PASSED",
  );
  const [date, setDate] = useState(record.date ?? "");
  const [reason, setReason] = useState("");
  const { pending, feedback, errorOf, run, reset } = useFormAction<null>();
  const text = describe(record);
  const done = () => {
    setMode("view");
    onChanged();
  };
  return (
    <li
      className="flex flex-col gap-3 rounded-inner border border-line p-3"
      data-testid="matrix-line"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-ink">{text}</p>
        {canWrite && mode === "view" && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              leftIcon={<Pencil aria-hidden="true" />}
              aria-label={`Modifier la ligne : ${text}`}
              onClick={() => {
                reset();
                setMode("edit");
              }}
            >
              Modifier
            </Button>
            <Button
              variant="ghost"
              leftIcon={<Trash2 aria-hidden="true" />}
              aria-label={`Supprimer la ligne : ${text}`}
              onClick={() => {
                reset();
                setMode("remove");
              }}
            >
              Supprimer
            </Button>
          </div>
        )}
      </div>
      {record.comment && <p className="text-small text-ink-2">{record.comment}</p>}
      {mode === "edit" && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => updateRecordForPersonAction({ id: record.id, result, date }), {
              onSuccess: done,
            });
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Résultat" htmlFor={`edit-result-${record.id}`} required>
              <Select
                id={`edit-result-${record.id}`}
                value={result}
                onChange={(e) => {
                  setResult(e.target.value);
                }}
              >
                {ENTRY_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {TRAINING_RESULT_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Date"
              htmlFor={`edit-date-${record.id}`}
              hint="Vide : date inchangée"
              error={errorOf("date")}
            >
              <Input
                id={`edit-date-${record.id}`}
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                }}
              />
            </Field>
          </div>
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMode("view");
              }}
            >
              Annuler
            </Button>
            <Button type="submit" loading={pending}>
              Enregistrer la modification
            </Button>
          </div>
        </form>
      )}
      {mode === "remove" && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => cancelRecordForPersonAction({ id: record.id, reason }), {
              onSuccess: done,
            });
          }}
        >
          <Field
            label="Motif de la suppression"
            htmlFor={`remove-reason-${record.id}`}
            hint="La ligne est annulée et reste dans l'historique."
            error={errorOf("reason")}
            required
          >
            <Textarea
              id={`remove-reason-${record.id}`}
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
          </Field>
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMode("view");
              }}
            >
              Annuler
            </Button>
            <Button type="submit" loading={pending}>
              Supprimer la ligne
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

/** « Ajouter une formation suivie » for this person and this training (warnings first). */
function AddLine({
  personId,
  referenceId,
  today,
  onSaved,
}: {
  personId: string;
  referenceId: string;
  today: string;
  onSaved: () => void;
}) {
  const entry = useGroupEntry(recordForPersonAction);
  const [values, setValues] = useState({ date: today, result: "PASSED", place: "" });
  const input = () => ({ ...values, referenceId, personIds: [personId] });
  const set = (patch: Partial<typeof values>) => {
    setValues({ ...values, ...patch });
    entry.reset();
  };
  return (
    <section aria-labelledby="matrix-add" className="flex flex-col gap-3">
      <h3 id="matrix-add" className="text-body font-semibold text-ink">
        Ajouter une formation suivie
      </h3>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          entry.submit(input(), onSaved);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Résultat" htmlFor="matrix-add-result" required>
            <Select
              id="matrix-add-result"
              value={values.result}
              onChange={(e) => {
                set({ result: e.target.value });
              }}
            >
              {ENTRY_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {TRAINING_RESULT_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Date"
            htmlFor="matrix-add-date"
            hint="Vide si inconnue"
            error={entry.errorOf("date")}
          >
            <Input
              id="matrix-add-date"
              type="date"
              value={values.date}
              onChange={(e) => {
                set({ date: e.target.value });
              }}
            />
          </Field>
        </div>
        <Field label="Lieu" htmlFor="matrix-add-place" error={entry.errorOf("place")}>
          <Input
            id="matrix-add-place"
            maxLength={120}
            value={values.place}
            onChange={(e) => {
              set({ place: e.target.value });
            }}
          />
        </Field>
        {entry.warnings && (
          <WarningsBox
            warnings={entry.warnings.list}
            pending={entry.pending}
            onAccept={() => {
              entry.submit(input(), onSaved);
            }}
          />
        )}
        {entry.message && (
          <p
            role={entry.message.tone === "danger" ? "alert" : "status"}
            className={cn(
              "text-small font-medium",
              entry.message.tone === "danger" ? "text-danger-ink" : "text-ok-ink",
            )}
          >
            {entry.message.text}
          </p>
        )}
        {!entry.warnings && (
          <Button
            type="submit"
            className="self-start"
            loading={entry.pending}
            leftIcon={<Plus aria-hidden="true" />}
          >
            Ajouter
          </Button>
        )}
      </form>
    </section>
  );
}
