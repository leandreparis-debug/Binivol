"use client";

import { DIPLOMA_ISSUER_LABELS, DIPLOMA_ISSUERS, type DiplomaCatalogItem } from "@/lib/diplomas";
import { DiplomaPicker } from "./DiplomaPicker";
import { useRef, useState } from "react";
import { FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, Input, Select } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import {
  ACTIVITY_OPTIONS,
  LANGUAGE_LEVEL_LABELS,
  LICENSE_OPTIONS,
  SKILL_LEVEL_LABELS,
  type DossierAttachmentKind,
} from "@/lib/dossierForms";
import {
  DOSSIER_STEP_LABELS,
  LIMITS,
  type DossierDraft,
  type DossierIssue,
  type DossierStep,
} from "@/lib/dossierSchema";
import { DOCUMENT_KIND_LABELS } from "@/lib/labels";
import { displayValue, fieldId, fieldValue, STEP_FIELDS } from "./config";
import { YesNo } from "./fields";

type Crf = NonNullable<DossierDraft["crf"]>;
type Profile = NonNullable<DossierDraft["profile"]>;

export interface StepProps {
  draft: DossierDraft;
  errorOf: (field: string) => string | undefined;
}

/** Step « Croix-Rouge »: already a volunteer, NIVOL, CRF e-mail, wished activities. */
export function CrfStep({
  draft,
  errorOf,
  onChange,
  ulName,
}: StepProps & { onChange: (patch: Partial<Crf>) => void; ulName: string }) {
  const crf = draft.crf ?? {};
  const activities = crf.activities ?? [];
  const full = activities.length >= LIMITS.activities;
  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Structure de rattachement"
        htmlFor={fieldId("crf", "structure")}
        hint="Renseignée par l'unité locale."
      >
        <Input value={ulName} readOnly aria-readonly="true" className="bg-veil" />
      </Field>
      <YesNo
        legend="Êtes-vous déjà bénévole à la Croix-Rouge française ?"
        name="alreadyVolunteer"
        id={fieldId("crf", "alreadyVolunteer")}
        value={crf.alreadyVolunteer}
        onChange={(v) => {
          onChange({ alreadyVolunteer: v });
        }}
        error={errorOf("alreadyVolunteer")}
      />
      <YesNo
        legend="Avez-vous déjà un NIVOL ?"
        hint="Le NIVOL est le numéro de bénévole de la Croix-Rouge : 11 chiffres et une lettre."
        name="hasNivol"
        id={fieldId("crf", "hasNivol")}
        value={crf.hasNivol}
        onChange={(v) => {
          onChange({ hasNivol: v });
        }}
        error={errorOf("hasNivol")}
      />
      {crf.hasNivol && (
        <Field
          label="Votre NIVOL"
          htmlFor={fieldId("crf", "nivol")}
          hint="Par exemple : 00012345678A. L'unité locale le vérifiera."
          error={errorOf("nivol")}
          required
        >
          <Input
            value={crf.nivol ?? ""}
            maxLength={20}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => {
              onChange({ nivol: e.target.value });
            }}
          />
        </Field>
      )}
      <YesNo
        legend="Avez-vous déjà une adresse e-mail Croix-Rouge ?"
        hint="Une adresse qui se termine par @croix-rouge.fr."
        name="hasCrfEmail"
        id={fieldId("crf", "hasCrfEmail")}
        value={crf.hasCrfEmail}
        onChange={(v) => {
          onChange({ hasCrfEmail: v });
        }}
        error={errorOf("hasCrfEmail")}
      />
      {crf.hasCrfEmail && (
        <Field
          label="Votre e-mail Croix-Rouge"
          htmlFor={fieldId("crf", "crfEmail")}
          error={errorOf("crfEmail")}
          required
        >
          <Input
            type="email"
            value={crf.crfEmail ?? ""}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => {
              onChange({ crfEmail: e.target.value });
            }}
          />
        </Field>
      )}
      <fieldset className="flex flex-col gap-1" aria-describedby="dossier-activities-hint">
        <legend className="mb-1 text-small font-medium text-ink">Activités souhaitées</legend>
        <p id="dossier-activities-hint" className="mb-1 text-small text-muted">
          Jusqu&apos;à {LIMITS.activities} activités. Vous pourrez changer d&apos;avis.
        </p>
        {ACTIVITY_OPTIONS.map((option) => {
          const checked = activities.includes(option);
          return (
            <Checkbox
              key={option}
              label={option}
              checked={checked}
              disabled={!checked && full}
              onChange={(e) => {
                onChange({
                  activities: e.target.checked
                    ? [...activities, option]
                    : activities.filter((a) => a !== option),
                });
              }}
            />
          );
        })}
      </fieldset>
    </div>
  );
}

function AddButton({
  children,
  onClick,
  disabled,
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="soft"
      leftIcon={<Plus className="size-4" />}
      onClick={onClick}
      disabled={disabled}
      className="self-start"
    >
      {children}
    </Button>
  );
}

type DeclaredDiplomaDraft = NonNullable<Profile["diplomas"]>[number];

/** Step « Profil »: profession, skills, languages, declared diplomas, licence categories. */
export function ProfileStep({
  draft,
  errorOf,
  onChange,
  catalog,
}: StepProps & {
  onChange: (patch: Partial<Profile>) => void;
  /** Catalogue of diplomas (setting `DECLARED_DIPLOMA_CATALOG`). */
  catalog: readonly DiplomaCatalogItem[];
}) {
  const p = draft.profile ?? {};
  const skills = p.skills ?? [];
  const languages = p.languages ?? [];
  const diplomas = p.diplomas ?? [];
  const licenses = p.licenses ?? [];
  const text = (name: "profession" | "sector" | "company", label: string, auto?: string) => (
    <Field label={label} htmlFor={fieldId("profile", name)}>
      <Input
        value={p[name] ?? ""}
        maxLength={60}
        autoComplete={auto ?? "off"}
        onChange={(e) => {
          onChange({ [name]: e.target.value });
        }}
      />
    </Field>
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {text("profession", "Profession", "organization-title")}
        {text("sector", "Secteur professionnel")}
        {text("company", "Entreprise", "organization")}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="dossier-skills-title">
        <h3 id="dossier-skills-title" className="text-body font-semibold text-ink">
          Compétences ({skills.length}/{LIMITS.skills})
        </h3>
        <p className="text-small text-muted">
          Ce que vous savez faire et qui peut servir : bricolage, informatique, cuisine…
        </p>
        {skills.map((skill, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-inner bg-veil p-3">
            <Field label={`Compétence ${String(i + 1)}`} htmlFor={`dossier-skill-${String(i)}`}>
              <Input
                value={skill.label}
                maxLength={60}
                onChange={(e) => {
                  onChange({
                    skills: skills.map((s, j) => (j === i ? { ...s, label: e.target.value } : s)),
                  });
                }}
              />
            </Field>
            <div className="flex items-end gap-2">
              <Field
                label="Niveau"
                htmlFor={`dossier-skill-${String(i)}-level`}
                error={errorOf(`skills.${String(i)}.level`)}
                className="flex-1"
              >
                <Select
                  value={skill.level ?? ""}
                  onChange={(e) => {
                    const level = e.target.value as keyof typeof SKILL_LEVEL_LABELS | "";
                    onChange({
                      skills: skills.map((s, j) =>
                        j === i ? { label: s.label, ...(level ? { level } : {}) } : s,
                      ),
                    });
                  }}
                >
                  <option value="">Choisir…</option>
                  {Object.entries(SKILL_LEVEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <IconButton
                aria-label={`Retirer la compétence ${String(i + 1)}`}
                type="button"
                onClick={() => {
                  onChange({ skills: skills.filter((_, j) => j !== i) });
                }}
              >
                <Trash2 className="size-5" />
              </IconButton>
            </div>
          </div>
        ))}
        <AddButton
          disabled={skills.length >= LIMITS.skills}
          onClick={() => {
            onChange({ skills: [...skills, { label: "" }] });
          }}
        >
          Ajouter une compétence
        </AddButton>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="dossier-languages-title">
        <h3 id="dossier-languages-title" className="text-body font-semibold text-ink">
          Langues ({languages.length}/{LIMITS.languages})
        </h3>
        {languages.map((language, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-inner bg-veil p-3">
            <Field label={`Langue ${String(i + 1)}`} htmlFor={`dossier-language-${String(i)}`}>
              <Input
                value={language.label}
                maxLength={60}
                onChange={(e) => {
                  onChange({
                    languages: languages.map((l, j) =>
                      j === i ? { ...l, label: e.target.value } : l,
                    ),
                  });
                }}
              />
            </Field>
            <div className="flex items-end gap-2">
              <Field
                label="Niveau"
                htmlFor={`dossier-language-${String(i)}-level`}
                error={errorOf(`languages.${String(i)}.level`)}
                className="flex-1"
              >
                <Select
                  value={language.level ?? ""}
                  onChange={(e) => {
                    const level = e.target.value as keyof typeof LANGUAGE_LEVEL_LABELS | "";
                    onChange({
                      languages: languages.map((l, j) =>
                        j === i ? { label: l.label, ...(level ? { level } : {}) } : l,
                      ),
                    });
                  }}
                >
                  <option value="">Choisir…</option>
                  {Object.entries(LANGUAGE_LEVEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <IconButton
                aria-label={`Retirer la langue ${String(i + 1)}`}
                type="button"
                onClick={() => {
                  onChange({ languages: languages.filter((_, j) => j !== i) });
                }}
              >
                <Trash2 className="size-5" />
              </IconButton>
            </div>
          </div>
        ))}
        <AddButton
          disabled={languages.length >= LIMITS.languages}
          onClick={() => {
            onChange({ languages: [...languages, { label: "" }] });
          }}
        >
          Ajouter une langue
        </AddButton>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="dossier-diplomas-title">
        <h3 id="dossier-diplomas-title" className="text-body font-semibold text-ink">
          Diplômes ({diplomas.length}/{LIMITS.diplomas})
        </h3>
        <p className="text-small text-muted">
          Choisissez dans la liste, ou tapez un autre diplôme. Ils seront vérifiés dans Pegass : pas
          de copie à joindre.
        </p>
        {diplomas.map((diploma, i) => {
          const set = (patch: Partial<DeclaredDiplomaDraft>) => {
            onChange({ diplomas: diplomas.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
          };
          return (
            <fieldset
              key={i}
              className="flex flex-col gap-3 rounded-inner border border-line p-3"
              aria-label={`Diplôme ${String(i + 1)}`}
            >
              <div className="flex items-end gap-2">
                <Field
                  label={`Diplôme ${String(i + 1)}`}
                  htmlFor={`dossier-diploma-${String(i)}`}
                  className="flex-1"
                >
                  <DiplomaPicker
                    id={`dossier-diploma-${String(i)}`}
                    catalog={catalog}
                    value={diploma.label}
                    onChange={(next) => {
                      onChange({
                        diplomas: diplomas.map((d, j) =>
                          j === i
                            ? {
                                label: next.label,
                                ...(next.code ? { code: next.code } : {}),
                                ...(d.year ? { year: d.year } : {}),
                                ...(d.issuer ? { issuer: d.issuer } : {}),
                              }
                            : d,
                        ),
                      });
                    }}
                  />
                </Field>
                <IconButton
                  aria-label={`Retirer le diplôme ${String(i + 1)}`}
                  type="button"
                  onClick={() => {
                    onChange({ diplomas: diplomas.filter((_, j) => j !== i) });
                  }}
                >
                  <Trash2 className="size-5" />
                </IconButton>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Année (facultatif)"
                  htmlFor={`dossier-diploma-${String(i)}-year`}
                  error={errorOf(`diplomas.${String(i)}.year`)}
                >
                  <Input
                    value={diploma.year ?? ""}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="AAAA"
                    onChange={(e) => {
                      set({ year: e.target.value.replace(/\D/g, "") || undefined });
                    }}
                  />
                </Field>
                <Field
                  label="Organisme (facultatif)"
                  htmlFor={`dossier-diploma-${String(i)}-issuer`}
                >
                  <Select
                    value={diploma.issuer ?? ""}
                    onChange={(e) => {
                      set({
                        issuer: (e.target.value || undefined) as DeclaredDiplomaDraft["issuer"],
                      });
                    }}
                  >
                    <option value="">Non précisé</option>
                    {DIPLOMA_ISSUERS.map((issuer) => (
                      <option key={issuer} value={issuer}>
                        {DIPLOMA_ISSUER_LABELS[issuer]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </fieldset>
          );
        })}
        <AddButton
          disabled={diplomas.length >= LIMITS.diplomas}
          onClick={() => {
            onChange({ diplomas: [...diplomas, { label: "" }] });
          }}
        >
          Ajouter un diplôme
        </AddButton>
      </section>

      <fieldset className="flex flex-col gap-1" aria-describedby="dossier-licenses-hint">
        <legend className="mb-1 text-body font-semibold text-ink">
          Permis de conduire ({licenses.length}/{LIMITS.licenses})
        </legend>
        <p id="dossier-licenses-hint" className="mb-1 text-small text-muted">
          Cochez seulement les catégories que vous avez. Le permis lui-même n&apos;est pas demandé.
        </p>
        <div className="grid grid-cols-2 gap-x-2">
          {LICENSE_OPTIONS.map((category) => {
            const checked = licenses.includes(category);
            return (
              <Checkbox
                key={category}
                label={`Permis ${category}`}
                checked={checked}
                disabled={!checked && licenses.length >= LIMITS.licenses}
                onChange={(e) => {
                  onChange({
                    licenses: e.target.checked
                      ? [...licenses, category]
                      : licenses.filter((l) => l !== category),
                  });
                }}
              />
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export interface AttachmentView {
  id: string;
  kind: string;
  fileName: string;
  sizeBytes: number;
}

const sizeText = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} Ko`;

/** Step « Pièces jointes »: files are sent one by one, as soon as they are chosen. */
export function AttachmentsStep({
  kinds,
  requiredKinds,
  attachments,
  onAdd,
  onRemove,
  errorOf,
  enabled = true,
}: {
  enabled?: boolean;
  kinds: DossierAttachmentKind[];
  requiredKinds: DossierAttachmentKind[];
  attachments: AttachmentView[];
  onAdd: (kind: DossierAttachmentKind, file: File) => Promise<string | null>;
  onRemove: (id: string) => Promise<string | null>;
  errorOf: (field: string) => string | undefined;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: string; text: string } | null>(null);
  const inputs = useRef<Partial<Record<string, HTMLInputElement | null>>>({});
  const hints: Record<DossierAttachmentKind, string> = {
    PARENTAL_AUTH: "Signée par votre représentant légal. Obligatoire avant 16 ans.",
    ADHESION: "Si l'unité locale vous l'a demandée.",
  };
  return (
    <div className="flex flex-col gap-5">
      {!enabled && (
        <p role="status" className="rounded-inner bg-warn-soft p-3 text-small text-warn-ink">
          L&apos;envoi de pièces jointes n&apos;est pas disponible sur cette démonstration. Le reste
          du dossier fonctionne : remettez les pièces à l&apos;unité locale.
        </p>
      )}
      <p className="text-small text-muted">
        PDF, JPEG ou PNG, 10 Mo au plus par fichier. Ne joignez ni extrait de casier judiciaire, ni
        permis de conduire : ils ne sont pas demandés.
      </p>
      <p className="text-small text-ink-2" data-testid="dossier-pegass">
        Tes diplômes seront vérifiés dans Pegass, tu n&apos;as pas à les envoyer.
      </p>
      {kinds.map((kind) => {
        const files = attachments.filter((a) => a.kind === kind);
        const inputId = `dossier-file-${kind}`;
        const error = message?.kind === kind ? message.text : errorOf(kind);
        return (
          <section
            key={kind}
            className="flex flex-col gap-3 rounded-inner border border-line p-4"
            aria-labelledby={`${inputId}-title`}
          >
            <h3 id={`${inputId}-title`} className="text-body font-semibold text-ink">
              {DOCUMENT_KIND_LABELS[kind]}
              {requiredKinds.includes(kind) && (
                <span className="text-danger" aria-hidden="true">
                  {" "}
                  *
                </span>
              )}
            </h3>
            <p className="text-small text-muted">{hints[kind]}</p>
            {files.length > 0 && (
              <ul className="flex flex-col gap-2">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between gap-2 rounded-inner bg-veil py-1 pr-1 pl-3"
                  >
                    <span className="min-w-0 truncate text-small text-ink">
                      {file.fileName}{" "}
                      <span className="text-muted">· {sizeText(file.sizeBytes)}</span>
                    </span>
                    <IconButton
                      type="button"
                      aria-label={`Retirer ${file.fileName}`}
                      disabled={busy !== null}
                      onClick={() => {
                        setBusy(file.id);
                        void onRemove(file.id).then((error) => {
                          setBusy(null);
                          setMessage(error ? { kind, text: error } : null);
                        });
                      }}
                    >
                      <Trash2 className="size-5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={(el) => {
                inputs.current[kind] = el;
              }}
              id={inputId}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="sr-only"
              tabIndex={-1}
              aria-describedby={error ? `${inputId}-error` : undefined}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setBusy(kind);
                setMessage(null);
                void onAdd(kind, file).then((error) => {
                  setBusy(null);
                  setMessage(error ? { kind, text: error } : null);
                });
              }}
            />
            <Button
              type="button"
              variant="outline"
              leftIcon={<FileUp className="size-4" />}
              loading={busy === kind}
              disabled={!enabled || (busy !== null && busy !== kind)}
              className="self-start"
              onClick={() => inputs.current[kind]?.click()}
            >
              {files.length > 0 ? "Ajouter un autre fichier" : "Ajouter un fichier"}
            </Button>
            <label htmlFor={inputId} className="sr-only">
              {`Fichier : ${DOCUMENT_KIND_LABELS[kind]}`}
            </label>
            {error && (
              <p
                id={`${inputId}-error`}
                role="alert"
                className="text-small font-medium text-danger-ink"
              >
                {error}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function SummaryList({ rows }: { rows: [string, string][] }) {
  if (rows.length === 0) return <p className="text-small text-muted">Rien de renseigné.</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-small text-muted">{label}</dt>
          <dd className="mb-1.5 text-body break-words text-ink sm:mb-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const yesNoText = (v: boolean | undefined) => (v === undefined ? "" : v ? "Oui" : "Non");

/** Rows of the summary of a step, for the review step. */
export function summaryRows(
  step: DossierStep,
  draft: DossierDraft,
  attachments: AttachmentView[],
): [string, string][] {
  const declared = STEP_FIELDS[step];
  if (declared) {
    return declared
      .map((def): [string, string] => [def.label, displayValue(def, fieldValue(draft, def))])
      .filter(([, v]) => v !== "");
  }
  const crf = draft.crf ?? {};
  const p = draft.profile ?? {};
  const rows: [string, string][] = [];
  const push = (label: string, value: string | undefined) => {
    if (value && value.trim() !== "") rows.push([label, value]);
  };
  if (step === "croix-rouge") {
    push("Déjà bénévole", yesNoText(crf.alreadyVolunteer));
    push("NIVOL", crf.hasNivol ? crf.nivol : yesNoText(crf.hasNivol));
    push("E-mail Croix-Rouge", crf.hasCrfEmail ? crf.crfEmail : yesNoText(crf.hasCrfEmail));
    push("Activités souhaitées", (crf.activities ?? []).join(", "));
  }
  if (step === "profil") {
    push("Profession", p.profession);
    push("Secteur professionnel", p.sector);
    push("Entreprise", p.company);
    push(
      "Compétences",
      (p.skills ?? [])
        .filter((s) => s.label.trim() !== "")
        .map((s) => `${s.label}${s.level ? ` (${SKILL_LEVEL_LABELS[s.level]})` : ""}`)
        .join(", "),
    );
    push(
      "Langues",
      (p.languages ?? [])
        .filter((l) => l.label.trim() !== "")
        .map((l) => `${l.label}${l.level ? ` (${LANGUAGE_LEVEL_LABELS[l.level]})` : ""}`)
        .join(", "),
    );
    push(
      "Diplômes",
      (p.diplomas ?? [])
        .filter((d) => d.label.trim() !== "")
        .map((d) =>
          [d.label, d.year, d.issuer ? DIPLOMA_ISSUER_LABELS[d.issuer] : undefined]
            .filter(Boolean)
            .join(", "),
        )
        .join(" ; "),
    );
    push("Permis", (p.licenses ?? []).join(", "));
  }
  if (step === "pieces") {
    for (const a of attachments) {
      rows.push([DOCUMENT_KIND_LABELS[a.kind as DossierAttachmentKind], a.fileName]);
    }
  }
  return rows;
}

/** Step « Relecture et consentement ». */
export function ReviewStep({
  steps,
  draft,
  attachments,
  issues,
  rgpdNotice,
  onGoTo,
  onConsent,
  consentError,
}: {
  steps: DossierStep[];
  draft: DossierDraft;
  attachments: AttachmentView[];
  issues: DossierIssue[];
  rgpdNotice: string;
  onGoTo: (step: DossierStep) => void;
  onConsent: (value: boolean) => void;
  consentError?: string;
}) {
  const blocking = issues.filter((i) => i.step !== "relecture");
  return (
    <div className="flex flex-col gap-5">
      {blocking.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-inner bg-warn-soft p-4"
          role="region"
          aria-labelledby="dossier-todo-title"
        >
          <h3 id="dossier-todo-title" className="text-body font-semibold text-warn-ink">
            À compléter avant l&apos;envoi ({blocking.length})
          </h3>
          <ul className="flex flex-col gap-1.5">
            {blocking.map((issue) => (
              <li key={`${issue.section}.${issue.field}`} className="flex flex-col gap-1">
                <span className="text-small text-ink">
                  {DOSSIER_STEP_LABELS[issue.step]} : {issue.message}
                </span>
                <button
                  type="button"
                  className="min-h-11 self-start rounded-control text-small font-medium text-ink underline underline-offset-2 focus-ring"
                  onClick={() => {
                    onGoTo(issue.step);
                  }}
                >
                  Aller à l&apos;étape « {DOSSIER_STEP_LABELS[issue.step]} »
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {steps
        .filter((s) => s !== "accueil" && s !== "relecture")
        .map((step) => (
          <section
            key={step}
            className="flex flex-col gap-2 border-b border-line pb-4 last:border-b-0"
            aria-labelledby={`dossier-summary-${step}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 id={`dossier-summary-${step}`} className="text-body font-semibold text-ink">
                {DOSSIER_STEP_LABELS[step]}
              </h3>
              <Button
                type="button"
                variant="ghost"
                leftIcon={<Pencil className="size-4" />}
                aria-label={`Modifier : ${DOSSIER_STEP_LABELS[step]}`}
                onClick={() => {
                  onGoTo(step);
                }}
              >
                Modifier
              </Button>
            </div>
            <SummaryList rows={summaryRows(step, draft, attachments)} />
          </section>
        ))}
      <section className="flex flex-col gap-3" aria-labelledby="dossier-rgpd-title">
        <h3 id="dossier-rgpd-title" className="text-body font-semibold text-ink">
          Vos données personnelles
        </h3>
        <details className="rounded-inner bg-veil p-4">
          <summary className="min-h-11 cursor-pointer rounded-control py-2 font-medium text-ink focus-ring">
            Lire l&apos;information sur vos données
          </summary>
          <div className="mt-2 text-small whitespace-pre-line text-ink-2">{rgpdNotice}</div>
        </details>
        <Checkbox
          id={fieldId("consent", "rgpd")}
          label="J'ai lu l'information sur l'utilisation de mes données personnelles."
          checked={draft.consent?.rgpd === true}
          aria-invalid={consentError ? true : undefined}
          aria-describedby={consentError ? "dossier-consent-error" : undefined}
          onChange={(e) => {
            onConsent(e.target.checked);
          }}
        />
        {consentError && (
          <p
            id="dossier-consent-error"
            role="alert"
            className="text-small font-medium text-danger-ink"
          >
            {consentError}
          </p>
        )}
      </section>
    </div>
  );
}
