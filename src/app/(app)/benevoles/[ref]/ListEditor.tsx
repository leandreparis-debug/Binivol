"use client";

import { useState } from "react";
import { Archive, Pencil, Plus } from "lucide-react";
import { DeadlineDot } from "@/components/person/DeadlineDot";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import type { DeadlineClass } from "@/lib/deadlines";
import { LANGUAGE_LEVEL_LABELS, SKILL_LEVEL_LABELS } from "@/lib/labels";
import type { PersonListItemInput } from "@/lib/personForms";
import { archiveListItemAction, saveListItemAction } from "./actions";

export type ListKind = "annex" | "skill" | "language" | "license";

export interface ListEntry {
  id: string;
  /** Main text: code, label or category. */
  title: string;
  /** Secondary text (label of an annex, level). */
  detail?: string | null;
  /** Values for the edit form. */
  values: Record<string, string>;
  deadline?: { value: DeadlineClass; date: Date | null };
}

const TITLES: Record<ListKind, { add: string; edit: string; empty: string }> = {
  annex: {
    add: "Ajouter une compétence annexe",
    edit: "Modifier la compétence annexe",
    empty: "Aucune compétence annexe",
  },
  skill: {
    add: "Ajouter une compétence",
    edit: "Modifier la compétence",
    empty: "Aucune compétence",
  },
  language: { add: "Ajouter une langue", edit: "Modifier la langue", empty: "Aucune langue" },
  license: { add: "Ajouter un permis", edit: "Modifier le permis", empty: "Aucun permis" },
};

function ItemForm({
  kind,
  personId,
  entry,
  onDone,
}: {
  kind: ListKind;
  personId: string;
  entry?: ListEntry;
  onDone: () => void;
}) {
  const { pending, feedback, errorOf, run } = useFormAction<null>();
  const v = entry?.values ?? {};
  const fid = (name: string) => `${kind}-${entry?.id ?? "new"}-${name}`;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const get = (key: string) => {
          const value = form.get(key);
          return typeof value === "string" ? value : "";
        };
        const base = { personId, ...(entry ? { id: entry.id } : {}) };
        const input: PersonListItemInput =
          kind === "annex"
            ? {
                list: "annex",
                ...base,
                code: get("code"),
                label: get("label"),
                validUntil: get("validUntil"),
              }
            : kind === "license"
              ? { list: "license", ...base, category: get("category") }
              : kind === "skill"
                ? { list: "skill", ...base, label: get("label"), level: get("level") as "BEGINNER" }
                : {
                    list: "language",
                    ...base,
                    label: get("label"),
                    level: get("level") as "NOTIONS",
                  };
        run(() => saveListItemAction(input), { onSuccess: onDone });
      }}
    >
      {kind === "annex" && (
        <>
          <Field
            label="Code"
            htmlFor={fid("code")}
            hint="Ex. VPSP_CHAUFFEUR"
            error={errorOf("code")}
            required
          >
            <Input id={fid("code")} name="code" defaultValue={v.code ?? ""} className="font-mono" />
          </Field>
          <Field label="Libellé" htmlFor={fid("label")} error={errorOf("label")}>
            <Input id={fid("label")} name="label" defaultValue={v.label ?? ""} />
          </Field>
          <Field
            label="Valable jusqu'au"
            htmlFor={fid("validUntil")}
            hint="Laisser vide si sans échéance"
            error={errorOf("validUntil")}
          >
            <Input
              id={fid("validUntil")}
              name="validUntil"
              type="date"
              defaultValue={v.validUntil ?? ""}
            />
          </Field>
        </>
      )}
      {(kind === "skill" || kind === "language") && (
        <>
          <Field
            label={kind === "skill" ? "Compétence" : "Langue"}
            htmlFor={fid("label")}
            error={errorOf("label")}
            required
          >
            <Input id={fid("label")} name="label" defaultValue={v.label ?? ""} />
          </Field>
          <Field label="Niveau" htmlFor={fid("level")} error={errorOf("level")} required>
            <Select id={fid("level")} name="level" defaultValue={v.level ?? ""}>
              <option value="">Choisir un niveau</option>
              {Object.entries(kind === "skill" ? SKILL_LEVEL_LABELS : LANGUAGE_LEVEL_LABELS).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </Select>
          </Field>
        </>
      )}
      {kind === "license" && (
        <Field
          label="Catégorie de permis"
          htmlFor={fid("category")}
          hint="B, BE, C, D…"
          error={errorOf("category")}
          required
        >
          <Input
            id={fid("category")}
            name="category"
            defaultValue={v.category ?? ""}
            className="font-mono"
          />
        </Field>
      )}
      <FormMessage feedback={feedback} />
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button variant="ghost" type="button">
            Annuler
          </Button>
        </DialogClose>
        <Button type="submit" loading={pending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

function ItemDialog({
  kind,
  personId,
  entry,
}: {
  kind: ListKind;
  personId: string;
  entry?: ListEntry;
}) {
  const [open, setOpen] = useState(false);
  const title = entry ? TITLES[kind].edit : TITLES[kind].add;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {entry ? (
          <IconButton aria-label={`${title} ${entry.title}`}>
            <Pencil aria-hidden="true" className="size-4" />
          </IconButton>
        ) : (
          <Button variant="ghost" leftIcon={<Plus aria-hidden="true" />}>
            {TITLES[kind].add}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={title} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <ItemForm
          kind={kind}
          personId={personId}
          entry={entry}
          onDone={() => {
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ArchiveButton({
  kind,
  personId,
  entry,
}: {
  kind: ListKind;
  personId: string;
  entry: ListEntry;
}) {
  const { pending, feedback, run } = useFormAction<null>();
  return (
    <>
      <IconButton
        aria-label={`Retirer ${entry.title}`}
        disabled={pending}
        onClick={() => {
          run(() => archiveListItemAction({ personId, list: kind, id: entry.id }));
        }}
      >
        <Archive aria-hidden="true" className="size-4" />
      </IconButton>
      {feedback?.tone === "danger" && <FormMessage feedback={feedback} />}
    </>
  );
}

/**
 * A list of the overview (annex competences, skills, languages, licences),
 * editable with `person.update`. Removing an item archives it.
 */
export function ListEditor({
  kind,
  personId,
  entries,
  editable,
}: {
  kind: ListKind;
  personId: string;
  entries: ListEntry[];
  editable: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {entries.length === 0 ? (
        <p className="text-body text-muted">{TITLES[kind].empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 flex-col">
                <span
                  className={
                    kind === "annex" || kind === "license"
                      ? "font-mono text-mono text-ink"
                      : "text-body text-ink"
                  }
                >
                  {entry.title}
                </span>
                {entry.detail && <span className="text-small text-ink-2">{entry.detail}</span>}
                {entry.deadline && (
                  <DeadlineDot deadline={entry.deadline.value} date={entry.deadline.date} />
                )}
              </span>
              {editable && (
                <span className="flex gap-1">
                  <ItemDialog kind={kind} personId={personId} entry={entry} />
                  <ArchiveButton kind={kind} personId={personId} entry={entry} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div>
          <ItemDialog kind={kind} personId={personId} />
        </div>
      )}
    </div>
  );
}
