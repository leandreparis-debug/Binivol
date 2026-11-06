"use client";

import { useState } from "react";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { earlyPurgeAction, purgeAction, retryOrphansAction } from "./actions";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** The list of eligible people, all checked, and the typed confirmation. */
export function PurgeForm({ people }: { people: { id: string; label: string; detail: string }[] }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(people.map((p) => p.id)));
  const { pending, feedback, errorOf, run } = useFormAction<{ purged: number; orphans: number }>();
  const all = checked.size === people.length;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        run(() => purgeAction({ personIds: [...checked], confirm: text(f, "confirm") }), {
          success: "Purge effectuée.",
        });
      }}
    >
      <Checkbox
        checked={all}
        onChange={() => {
          setChecked(all ? new Set() : new Set(people.map((p) => p.id)));
        }}
        label={`Tout cocher (${String(people.length)})`}
      />
      <ul className="flex flex-col divide-y divide-line" data-testid="purge-list">
        {people.map((p) => (
          <li key={p.id} className="py-1">
            <Checkbox
              checked={checked.has(p.id)}
              onChange={() => {
                const next = new Set(checked);
                if (next.has(p.id)) next.delete(p.id);
                else next.add(p.id);
                setChecked(next);
              }}
              label={p.label}
              hint={p.detail}
            />
          </li>
        ))}
      </ul>
      {errorOf("personIds") && (
        <p role="alert" className="text-small text-danger-ink">
          {errorOf("personIds")}
        </p>
      )}
      <Field
        label="Confirmation"
        htmlFor="purge-confirm"
        hint="Tapez PURGER : la suppression est définitive."
        error={errorOf("confirm")}
        required
      >
        <Input id="purge-confirm" name="confirm" autoComplete="off" />
      </Field>
      <FormMessage feedback={feedback} />
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={checked.size === 0}>
          Purger {checked.size} fiche{checked.size > 1 ? "s" : ""}
        </Button>
      </div>
    </form>
  );
}

/** Early erasure of one person, with a reason (right to erasure). */
export function EarlyPurgeForm() {
  const { pending, feedback, errorOf, run } = useFormAction<{ purged: number }>();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        run(
          () =>
            earlyPurgeAction({
              ref: text(f, "ref"),
              reason: text(f, "reason"),
              confirm: text(f, "confirm"),
            }),
          { success: "Fiche effacée." },
        );
      }}
    >
      <Field label="Référence de la fiche" htmlFor="early-ref" error={errorOf("ref")} required>
        <Input id="early-ref" name="ref" placeholder="P-00012" autoComplete="off" />
      </Field>
      <Field
        label="Motif"
        htmlFor="early-reason"
        hint="Conservé dans la trace de purge (sans donnée personnelle)."
        error={errorOf("reason")}
        required
      >
        <Textarea id="early-reason" name="reason" rows={3} />
      </Field>
      <Field
        label="Confirmation"
        htmlFor="early-confirm"
        hint="Tapez PURGER."
        error={errorOf("confirm")}
        required
      >
        <Input id="early-confirm" name="confirm" autoComplete="off" />
      </Field>
      <FormMessage feedback={feedback} />
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Effacer la fiche
        </Button>
      </div>
    </form>
  );
}

/** Retry the deletion of the files left in the storage. */
export function RetryOrphans() {
  const { pending, feedback, run } = useFormAction<{ deleted: number; remaining: number }>();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        className="self-start"
        loading={pending}
        onClick={() => {
          run(() => retryOrphansAction({}), { success: "Nouvelle tentative effectuée." });
        }}
      >
        Réessayer la suppression
      </Button>
      <FormMessage feedback={feedback} />
    </div>
  );
}
