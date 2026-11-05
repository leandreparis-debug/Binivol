"use client";

import { useState } from "react";
import { ClipboardCopy, Pencil } from "lucide-react";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { REFERENCE_CATEGORY_LABELS } from "@/lib/labels";
import type { ReferenceOption } from "@/server/services/trainings";
import { updateReferenceAction } from "./actions";

/** « Copier les e-mails » of a Trouver result, separated by `;`. */
export function CopyEmails({ emails }: { emails: string[] }) {
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        leftIcon={<ClipboardCopy aria-hidden="true" />}
        disabled={emails.length === 0}
        onClick={() => {
          void navigator.clipboard
            .writeText(emails.join(";"))
            .then(() => {
              setDone(
                `${String(emails.length)} e-mail${emails.length > 1 ? "s" : ""} copié${emails.length > 1 ? "s" : ""}.`,
              );
            })
            .catch(() => {
              setDone("Copie impossible : sélectionnez les adresses.");
            });
        }}
      >
        Copier les e-mails
      </Button>
      <p role="status" className="text-small text-ink-2">
        {done}
      </p>
    </div>
  );
}

const PROFILES = ["ACTION", "LASER", "FORMAT", "FORMAT_GP", "DIAMANT"] as const;

/** Edits one item of the reference list (TOPAZE, FORMAT). Never deleted: « Active ». */
export function ReferenceEditor({ item, all }: { item: ReferenceOption; all: ReferenceOption[] }) {
  const [open, setOpen] = useState(false);
  const { pending, feedback, errorOf, run, reset } = useFormAction<null>();
  const trainings = all.filter((r) => r.kind === "TRAINING" && r.id !== item.id);
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
          aria-label={`Modifier ${item.code}`}
          leftIcon={<Pencil aria-hidden="true" />}
        >
          Modifier
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Modifier ${item.code}`}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            const value = (k: string) => {
              const v = f.get(k);
              return typeof v === "string" ? v : "";
            };
            run(
              () =>
                updateReferenceAction({
                  id: item.id,
                  label: value("label"),
                  category: value("category"),
                  validityMonths: value("validityMonths"),
                  expiresEndOfYear: f.get("expiresEndOfYear") === "on",
                  forbiddenForMinors: f.get("forbiddenForMinors") === "on",
                  managedBy: item.kind === "FUNCTION" ? f.getAll("managedBy").map(String) : [],
                  active: f.get("active") === "on",
                  prerequisiteIds: f.getAll("prerequisites").map(String),
                }),
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
        >
          <Field label="Libellé" htmlFor={`rf-label-${item.id}`} error={errorOf("label")} required>
            <Input
              id={`rf-label-${item.id}`}
              name="label"
              defaultValue={item.label}
              maxLength={120}
            />
          </Field>
          <Field label="Catégorie" htmlFor={`rf-cat-${item.id}`}>
            <Select id={`rf-cat-${item.id}`} name="category" defaultValue={item.category}>
              {Object.entries(REFERENCE_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          {item.kind === "TRAINING" && (
            <>
              <Field
                label="Validité (mois)"
                htmlFor={`rf-val-${item.id}`}
                hint="Vide : pas d'expiration en mois"
                error={errorOf("validityMonths")}
              >
                <Input
                  id={`rf-val-${item.id}`}
                  name="validityMonths"
                  inputMode="numeric"
                  defaultValue={item.validityMonths === null ? "" : String(item.validityMonths)}
                />
              </Field>
              <Checkbox
                name="expiresEndOfYear"
                defaultChecked={item.expiresEndOfYear}
                label="Expire au 31/12"
              />
            </>
          )}
          <Checkbox
            name="forbiddenForMinors"
            defaultChecked={item.forbiddenForMinors}
            label="Interdit aux mineurs"
          />
          <Checkbox
            name="active"
            defaultChecked={item.active}
            label="Active (proposée dans les listes)"
          />
          {item.kind === "TRAINING" && trainings.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-small font-medium text-ink">Prérequis</legend>
              {trainings.map((t) => (
                <Checkbox
                  key={t.id}
                  name="prerequisites"
                  value={t.id}
                  defaultChecked={item.prerequisites.some((p) => p.id === t.id)}
                  label={`${t.code} — ${t.label}`}
                />
              ))}
            </fieldset>
          )}
          {item.kind === "FUNCTION" && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-small font-medium text-ink">
                Nommée par (avec TOPAZE)
              </legend>
              {PROFILES.map((p) => (
                <Checkbox
                  key={p}
                  name="managedBy"
                  value={p}
                  defaultChecked={item.managedBy.includes(p)}
                  label={p.replace("_", " ")}
                />
              ))}
            </fieldset>
          )}
          <FormMessage feedback={feedback} />
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Fermer
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
