"use client";

import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { saveReminderRuleAction, saveSettingsAction } from "./actions";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

function Save({ pending, label = "Enregistrer" }: { pending: boolean; label?: string }) {
  return (
    <div className="flex justify-end">
      <Button type="submit" loading={pending}>
        {label}
      </Button>
    </div>
  );
}

/** Alert rules (on/off), tronc commun, associated competences. */
export function AlertRulesForm({
  rules,
  disabled,
  coreCodes,
  companions,
}: {
  rules: { code: string; label: string; priority: string }[];
  disabled: string[];
  coreCodes: string[];
  companions: Record<string, string[]>;
}) {
  const { pending, feedback, errorOf, run } = useFormAction<null>();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        run(
          () =>
            saveSettingsAction({
              section: "alerts",
              disabled: rules.map((r) => r.code).filter((c) => f.get(`rule-${c}`) !== "on"),
              coreCodes: text(f, "coreCodes"),
              companions: text(f, "companions"),
            }),
          { success: "Règles d'alerte enregistrées." },
        );
      }}
    >
      <fieldset className="grid gap-1 sm:grid-cols-2" data-testid="alert-rules">
        <legend className="mb-2 text-small text-ink-2">Règles actives</legend>
        {rules.map((r) => (
          <Checkbox
            key={r.code}
            name={`rule-${r.code}`}
            defaultChecked={!disabled.includes(r.code)}
            label={`${r.label} (${r.priority})`}
          />
        ))}
      </fieldset>
      <Field
        label="Tronc commun"
        htmlFor="core-codes"
        hint="Codes du référentiel, séparés par des virgules."
        error={errorOf("coreCodes")}
      >
        <Input id="core-codes" name="coreCodes" defaultValue={coreCodes.join(", ")} />
      </Field>
      <Field
        label="Compétences associées"
        htmlFor="companions"
        hint="Une ligne par compétence : « PSE : OPR, ECG »."
        error={errorOf("companions")}
      >
        <Textarea
          id="companions"
          name="companions"
          rows={3}
          defaultValue={Object.entries(companions)
            .map(([code, list]) => `${code} : ${list.join(", ")}`)
            .join("\n")}
        />
      </Field>
      <FormMessage feedback={feedback} />
      <Save pending={pending} />
    </form>
  );
}

/** One reminder rule: active, delay, recipients. */
export function ReminderRuleForm({
  rule,
  profiles,
}: {
  rule: { id: string; label: string; offsetDays: number; recipients: string[]; active: boolean };
  profiles: { value: string; label: string }[];
}) {
  const { pending, feedback, errorOf, run } = useFormAction<null>();
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      aria-label={rule.label}
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        run(
          () =>
            saveReminderRuleAction({
              id: rule.id,
              active: f.get("active") === "on",
              offsetDays: text(f, "offsetDays"),
              recipients: profiles.map((p) => p.value).filter((p) => f.get(`to-${p}`) === "on"),
            }),
          { success: "Règle enregistrée." },
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Checkbox name="active" defaultChecked={rule.active} label={rule.label} className="grow" />
        <Field
          label="Délai (jours)"
          htmlFor={`offset-${rule.id}`}
          error={errorOf("offsetDays")}
          className="w-32"
        >
          <Input
            id={`offset-${rule.id}`}
            name="offsetDays"
            type="number"
            min={0}
            max={730}
            defaultValue={rule.offsetDays}
          />
        </Field>
      </div>
      <fieldset className="flex flex-wrap gap-1">
        <legend className="sr-only">Destinataires de « {rule.label} »</legend>
        {profiles.map((p) => (
          <Checkbox
            key={p.value}
            name={`to-${p.value}`}
            defaultChecked={rule.recipients.includes(p.value)}
            label={p.label}
          />
        ))}
      </fieldset>
      {errorOf("recipients") && (
        <p role="alert" className="text-small text-danger-ink">
          {errorOf("recipients")}
        </p>
      )}
      <FormMessage feedback={feedback} />
      <Save pending={pending} />
    </form>
  );
}

/** Digest frequency. */
export function DigestForm({
  frequency,
  options,
}: {
  frequency: string;
  options: { value: string; label: string }[];
}) {
  const { pending, feedback, errorOf, run } = useFormAction<null>();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        run(
          () =>
            saveSettingsAction({
              section: "digest",
              frequency: text(f, "frequency"),
            }),
          { success: "Fréquence enregistrée." },
        );
      }}
    >
      <Field label="Récapitulatif des alertes" htmlFor="digest" error={errorOf("frequency")}>
        <Select id="digest" name="frequency" defaultValue={frequency}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <FormMessage feedback={feedback} />
      <Save pending={pending} />
    </form>
  );
}

/** Prévenance du pôle Urgence. */
export function UrgenceForm({ codes, recipients }: { codes: string[]; recipients: string[] }) {
  const { pending, feedback, errorOf, run } = useFormAction<null>();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        run(
          () =>
            saveSettingsAction({
              section: "urgence",
              codes: text(f, "codes"),
              recipients: text(f, "recipients"),
            }),
          { success: "Prévenance enregistrée." },
        );
      }}
    >
      <Field
        label="Formations à signaler"
        htmlFor="urgence-codes"
        hint="Codes du référentiel, séparés par des virgules."
        error={errorOf("codes")}
      >
        <Input id="urgence-codes" name="codes" defaultValue={codes.join(", ")} />
      </Field>
      <Field
        label="Destinataires"
        htmlFor="urgence-to"
        hint="Une adresse par ligne. Vide : aucun e-mail ne part."
        error={errorOf("recipients")}
      >
        <Textarea id="urgence-to" name="recipients" rows={3} defaultValue={recipients.join("\n")} />
      </Field>
      <FormMessage feedback={feedback} />
      <Save pending={pending} />
    </form>
  );
}

/** Birthday and engagement anniversary e-mails. */
export function GreetingsForm({
  enabled,
  birthdayText,
  anniversaryText,
}: {
  enabled: boolean;
  birthdayText: string;
  anniversaryText: string;
}) {
  const { pending, feedback, errorOf, run } = useFormAction<null>();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const f = new FormData(event.currentTarget);
        run(
          () =>
            saveSettingsAction({
              section: "greetings",
              enabled: f.get("enabled") === "on",
              birthdayText: text(f, "birthdayText"),
              anniversaryText: text(f, "anniversaryText"),
            }),
          { success: "E-mails d'anniversaire enregistrés." },
        );
      }}
    >
      <Checkbox
        name="enabled"
        defaultChecked={enabled}
        label="Envoyer les e-mails d'anniversaire et d'anniversaire d'engagement"
      />
      <Field
        label="Texte d'anniversaire"
        htmlFor="birthday-text"
        hint="{prenom}, {ul}. Jamais l'âge."
        error={errorOf("birthdayText")}
      >
        <Textarea id="birthday-text" name="birthdayText" rows={6} defaultValue={birthdayText} />
      </Field>
      <Field
        label="Texte d'anniversaire d'engagement"
        htmlFor="anniversary-text"
        hint="{prenom}, {annees}, {ul}."
        error={errorOf("anniversaryText")}
      >
        <Textarea
          id="anniversary-text"
          name="anniversaryText"
          rows={6}
          defaultValue={anniversaryText}
        />
      </Field>
      <FormMessage feedback={feedback} />
      <Save pending={pending} />
    </form>
  );
}
