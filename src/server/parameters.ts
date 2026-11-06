import { z } from "zod";
import { DEFAULT_GAIA_CHECKLIST, parseGaiaChecklist, type GaiaChecklistItem } from "@/lib/gaia";
import { DEFAULT_SETTINGS } from "./settings";

/**
 * Parameters of the UL (step 14, /admin/parametres, TOPAZE): every `Setting`
 * of the previous steps, grouped by theme, with a clear label, a help, its
 * default and its validation. The automation settings (digest, Urgence,
 * greetings, alert rules) keep their own screen, /admin/reglages.
 */

export const PARAMETER_THEMES = ["identite", "delais", "emails", "gaia"] as const;
export type ParameterTheme = (typeof PARAMETER_THEMES)[number];

export const PARAMETER_THEME_LABELS: Record<ParameterTheme, string> = {
  identite: "Identité de l'unité locale",
  delais: "Délais et conservation",
  emails: "Textes",
  gaia: "Gaia",
};

export type ParameterKind = "int" | "text" | "longtext" | "enum" | "gaia";

export interface ParameterDef {
  key: string;
  theme: ParameterTheme;
  label: string;
  help: string;
  kind: ParameterKind;
  /** Shown as « par défaut : … ». */
  defaultLabel: string;
  min?: number;
  max?: number;
  options?: readonly { value: string; label: string }[];
}

export const PARAMETERS: readonly ParameterDef[] = [
  {
    key: "UL_NAME",
    theme: "identite",
    label: "Nom de l'unité locale",
    help: "« Structure de rattachement » des dossiers et signature des e-mails.",
    kind: "text",
    defaultLabel: "Unité locale de Versailles",
  },
  {
    key: "UL_CITY",
    theme: "identite",
    label: "Ville",
    help: "« Fait à » de la charte du bénévolat.",
    kind: "text",
    defaultLabel: "Versailles",
  },
  {
    key: "UL_CONTACT_EMAIL",
    theme: "identite",
    label: "Adresse de l'équipe",
    help: "Contact affiché sur la page de confidentialité (droits des personnes).",
    kind: "text",
    defaultLabel: "aucune",
  },
  {
    key: "ALERT_DAYS_BEFORE_EXPIRY",
    theme: "delais",
    label: "Alerte avant échéance (jours)",
    help: "Une formation qui expire dans ce délai est « proche » (alertes, rappels, matrice).",
    kind: "int",
    min: 1,
    max: 365,
    defaultLabel: String(DEFAULT_SETTINGS.alertDays),
  },
  {
    key: "NEW_VOLUNTEER_MONTHS",
    theme: "delais",
    label: "Nouveau bénévole (mois)",
    help: "En dessous de cette ancienneté, le bénévole relève de DIAMANT ; fin de parrainage proposée.",
    kind: "int",
    min: 1,
    max: 60,
    defaultLabel: String(DEFAULT_SETTINGS.newVolunteerMonths),
  },
  {
    key: "CANDIDACY_FOLLOW_UP_DAYS",
    theme: "delais",
    label: "Relance d'un candidat (jours)",
    help: "Délai de relance proposé après un passage d'étape.",
    kind: "int",
    min: 1,
    max: 90,
    defaultLabel: String(DEFAULT_SETTINGS.candidacyFollowUpDays),
  },
  {
    key: "DOSSIER_LINK_DAYS",
    theme: "delais",
    label: "Validité d'un lien de dossier (jours)",
    help: "Au-delà, le candidat doit recevoir un nouveau lien.",
    kind: "int",
    min: 1,
    max: 60,
    defaultLabel: "7",
  },
  {
    key: "RETENTION_YEARS_AFTER_LEAVE",
    theme: "delais",
    label: "Conservation après le départ (années)",
    help: "Date de purge = départ + cette durée (RGPD). S'applique aux départs enregistrés ensuite.",
    kind: "int",
    min: 1,
    max: 30,
    defaultLabel: String(DEFAULT_SETTINGS.retentionYears),
  },
  {
    key: "ABANDONED_RETENTION_MONTHS",
    theme: "delais",
    label: "Conservation d'une candidature abandonnée (mois)",
    help: "Ensuite, le candidat jamais devenu bénévole est proposé à la purge.",
    kind: "int",
    min: 1,
    max: 120,
    defaultLabel: "12",
  },
  {
    key: "PURGE_MODE",
    theme: "delais",
    label: "Mode de purge",
    help: "Manuel : la tâche quotidienne liste, TOPAZE valide. Automatique : elle purge seule.",
    kind: "enum",
    options: [
      { value: "MANUAL", label: "Manuel (validation par TOPAZE)" },
      { value: "AUTOMATIC", label: "Automatique" },
    ],
    defaultLabel: "Manuel",
  },
  {
    key: "FINAL_MAIL_TEXT",
    theme: "emails",
    label: "E-mail des documents signés",
    help: "Variables : {prenom}, {pieces}, {ul}.",
    kind: "longtext",
    defaultLabel: "texte d'origine",
  },
  {
    key: "RGPD_NOTICE",
    theme: "emails",
    label: "Information sur le traitement des données",
    help: "Affichée dans le dossier en ligne et sur la page /confidentialite. À faire valider par le DPO.",
    kind: "longtext",
    defaultLabel: "brouillon d'origine",
  },
  {
    key: "GAIA_CHECKLIST",
    theme: "gaia",
    label: "Liste à cocher de la création dans Gaia",
    help: "Une ligne par étape : « clé | libellé », ajouter « | adhésion » si l'étape ne vaut que pour un adhérent.",
    kind: "gaia",
    defaultLabel: DEFAULT_GAIA_CHECKLIST.map((i) => i.label).join(", "),
  },
];

export function parameterDef(key: string): ParameterDef | undefined {
  return PARAMETERS.find((p) => p.key === key);
}

/** The Gaia list as editable lines. */
export function gaiaToLines(items: readonly GaiaChecklistItem[]): string {
  return items
    .map((i) => `${i.key} | ${i.label}${i.onlyIfAdhesion ? " | adhésion" : ""}`)
    .join("\n");
}

/** Parses the text typed for a parameter into its stored value. */
export function parseParameter(
  def: ParameterDef,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  switch (def.kind) {
    case "int": {
      const parsed = z.coerce
        .number()
        .int()
        .min(def.min ?? 0)
        .max(def.max ?? 10_000)
        .safeParse(raw.trim());
      return parsed.success
        ? { ok: true, value: parsed.data }
        : {
            ok: false,
            error: `Un nombre entier entre ${String(def.min ?? 0)} et ${String(def.max ?? 10_000)}.`,
          };
    }
    case "text": {
      const value = raw.trim();
      if (def.key === "UL_CONTACT_EMAIL") {
        if (value === "") return { ok: true, value: "" };
        return z.email().safeParse(value).success
          ? { ok: true, value }
          : { ok: false, error: "Adresse e-mail invalide." };
      }
      return value.length >= 2 && value.length <= 200
        ? { ok: true, value }
        : { ok: false, error: "Entre 2 et 200 caractères." };
    }
    case "longtext": {
      const value = raw.trim();
      return value.length >= 20 && value.length <= 8000
        ? { ok: true, value }
        : { ok: false, error: "Entre 20 et 8 000 caractères." };
    }
    case "enum":
      return def.options?.some((o) => o.value === raw)
        ? { ok: true, value: raw }
        : { ok: false, error: "Choisissez une valeur." };
    case "gaia": {
      const items = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const [key = "", label = "", flag = ""] = line.split("|").map((p) => p.trim());
          return { key, label, ...(/^adh/i.test(flag) ? { onlyIfAdhesion: true } : {}) };
        });
      const valid = parseGaiaChecklist(items);
      if (items.length === 0 || valid.length !== items.length || valid === DEFAULT_GAIA_CHECKLIST) {
        return {
          ok: false,
          error: "Chaque ligne : « clé | libellé » (clé sans espace ni accent).",
        };
      }
      if (new Set(items.map((i) => i.key)).size !== items.length) {
        return { ok: false, error: "Deux étapes ont la même clé." };
      }
      return { ok: true, value: items };
    }
  }
}
