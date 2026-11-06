"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input, Textarea } from "@/components/ui/Field";
import type { NewCandidateInput } from "@/lib/candidacyForms";
import { PERSON_STATUS_LABELS } from "@/lib/labels";
import type { DuplicateMatch } from "@/server/services/candidacies";
import { createCandidateAction, reengageAction } from "./actions";

const MATCHED: Record<"email" | "phone" | "name", string> = {
  email: "même e-mail",
  phone: "même téléphone",
  name: "même nom et prénom",
};

function today(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

/**
 * « Nouveau candidat »: first name, last name, and an e-mail or a phone are
 * enough (mobile first, under 30 seconds). If people match, they are shown
 * before anything is written: same person (re-engage or open her page), or
 * « Créer quand même » (recorded in the audit).
 */
export function NewCandidateDialog({ sources }: { sources: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewCandidateInput | null>(null);
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null);

  const reset = () => {
    setErrors({});
    setMessage(null);
    setDraft(null);
    setMatches(null);
  };

  const submit = (input: NewCandidateInput) => {
    startTransition(async () => {
      const result = await createCandidateAction(input);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }
      if (result.data.status === "duplicates") {
        setDraft(input);
        setMatches(result.data.matches);
        setMessage(null);
        return;
      }
      setOpen(false);
      reset();
      router.push(`/benevoles/${result.data.ref}?onglet=integration`);
    });
  };

  const reengage = (personId: string) => {
    startTransition(async () => {
      const result = await reengageAction({
        personId,
        source: draft?.source ?? null,
        interest: draft?.interest ?? null,
        note: draft?.note ?? null,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.push(`/benevoles/${result.data.ref}?onglet=integration`);
    });
  };

  const error = (field: string) => errors[field]?.[0];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button leftIcon={<UserPlus aria-hidden="true" />}>Nouveau candidat</Button>
      </DialogTrigger>
      <DialogContent
        title={matches ? "Personnes déjà connues" : "Nouveau candidat"}
        description={
          matches
            ? "Ces fiches ressemblent au candidat saisi. Vérifiez avant de créer une nouvelle fiche."
            : "Prénom, nom, et un e-mail ou un téléphone suffisent."
        }
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        {matches && draft ? (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-3">
              {matches.map((m) => (
                <li key={m.personId} className="rounded-inner border border-line p-3">
                  {m.visible ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-body text-ink">
                        <span className="font-medium">
                          {m.firstName} {m.lastName}
                        </span>{" "}
                        <span className="font-mono text-mono text-muted">{m.ref}</span>
                      </p>
                      <p className="text-small text-ink-2">
                        {PERSON_STATUS_LABELS[m.status]}
                        {m.nivol && (
                          <>
                            {" "}
                            · NIVOL <span className="font-mono text-mono">{m.nivol}</span>
                          </>
                        )}{" "}
                        · {m.matchedOn.map((k) => MATCHED[k]).join(", ")}
                      </p>
                      {m.alreadyVolunteer && (
                        <p className="text-small text-ink">
                          Cette personne est déjà bénévole : aucune candidature n&apos;est créée.
                        </p>
                      )}
                      {m.openCandidacy && (
                        <p className="text-small text-ink">
                          Une candidature est déjà en cours pour cette personne.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {m.canReengage && (
                          <Button
                            loading={pending}
                            onClick={() => {
                              reengage(m.personId);
                            }}
                          >
                            C&apos;est la même personne : réengager
                          </Button>
                        )}
                        {m.openCandidacy && (
                          <Button asChild variant="outline">
                            <Link href={`/benevoles/${m.ref}`}>
                              C&apos;est la même personne : ouvrir sa fiche
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-small text-ink-2">
                      Une fiche existe déjà avec ces informations, mais elle ne relève pas de vos
                      profils.
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {message && (
              <p role="alert" className="text-small font-medium text-danger-ink">
                {message}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setMatches(null);
                }}
              >
                Modifier la saisie
              </Button>
              <Button
                variant="outline"
                loading={pending}
                onClick={() => {
                  submit({ ...draft, confirmDuplicates: matches.map((m) => m.personId) });
                }}
              >
                Créer quand même
              </Button>
            </div>
          </div>
        ) : (
          <form
            noValidate
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const get = (key: string) => {
                const value = form.get(key);
                return typeof value === "string" ? value : "";
              };
              submit({
                firstName: get("firstName"),
                lastName: get("lastName"),
                email: get("email"),
                phone: get("phone"),
                source: get("source"),
                interest: get("interest"),
                firstContactAt: get("firstContactAt"),
                note: get("note"),
              });
            }}
          >
            <Field label="Prénom" htmlFor="nc-first" error={error("firstName")} required>
              <Input
                id="nc-first"
                name="firstName"
                autoComplete="off"
                defaultValue={draft?.firstName}
              />
            </Field>
            <Field label="Nom" htmlFor="nc-last" error={error("lastName")} required>
              <Input
                id="nc-last"
                name="lastName"
                autoComplete="off"
                defaultValue={draft?.lastName}
              />
            </Field>
            <Field
              label="E-mail"
              htmlFor="nc-email"
              hint="E-mail ou téléphone"
              error={error("email")}
            >
              <Input
                id="nc-email"
                name="email"
                type="email"
                inputMode="email"
                defaultValue={draft?.email ?? ""}
              />
            </Field>
            <Field label="Téléphone" htmlFor="nc-phone" error={error("phone")}>
              <Input
                id="nc-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                defaultValue={draft?.phone ?? ""}
              />
            </Field>
            <details
              className="sm:col-span-2"
              open={Boolean(draft?.source ?? draft?.interest ?? draft?.note)}
            >
              <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-control text-body font-medium text-ink focus-ring">
                Plus d&apos;informations (facultatif)
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Source" htmlFor="nc-source" error={error("source")}>
                  <Input
                    id="nc-source"
                    name="source"
                    list="nc-sources"
                    defaultValue={draft?.source ?? ""}
                  />
                </Field>
                <datalist id="nc-sources">
                  {sources.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                <Field label="Intérêt" htmlFor="nc-interest" error={error("interest")}>
                  <Input id="nc-interest" name="interest" defaultValue={draft?.interest ?? ""} />
                </Field>
                <Field label="Premier contact" htmlFor="nc-date" error={error("firstContactAt")}>
                  <Input
                    id="nc-date"
                    name="firstContactAt"
                    type="date"
                    defaultValue={draft?.firstContactAt ?? today()}
                  />
                </Field>
                <Field
                  label="Note"
                  htmlFor="nc-note"
                  error={error("note")}
                  className="sm:col-span-2"
                >
                  <Textarea id="nc-note" name="note" rows={3} defaultValue={draft?.note ?? ""} />
                </Field>
              </div>
            </details>
            {message && (
              <p role="alert" className="text-small font-medium text-danger-ink sm:col-span-2">
                {message}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              <DialogClose asChild>
                <Button variant="ghost" type="button">
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending}>
                Enregistrer le candidat
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
