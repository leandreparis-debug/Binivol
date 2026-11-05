import { z } from "zod";
import { ageOn } from "./age";
import { normalizeNivol } from "./nivol";
import { parsePhone } from "./phone";

/**
 * The online volunteer file (dossier): shape, draft schema (partial), and
 * submission rules (complete). Client-safe: the form validates with the same
 * rules as the server. Field names map to the three official PDF forms
 * (docs/dossier.md), which step 8 will fill.
 */

export const DOSSIER_SCHEMA_VERSION = 1;

export const DOSSIER_STEPS = [
  "accueil",
  "identite",
  "coordonnees",
  "croix-rouge",
  "urgence",
  "profil",
  "representant",
  "pieces",
  "relecture",
] as const;
export type DossierStep = (typeof DOSSIER_STEPS)[number];

export const DOSSIER_STEP_LABELS: Record<DossierStep, string> = {
  accueil: "Accueil",
  identite: "Identité",
  coordonnees: "Coordonnées",
  "croix-rouge": "Croix-Rouge",
  urgence: "Personne à prévenir",
  profil: "Profil",
  representant: "Représentant légal",
  pieces: "Pièces jointes",
  relecture: "Relecture",
};

/** Section of the data → step of the form (where its errors are shown). */
export const SECTION_STEP = {
  identity: "identite",
  contact: "coordonnees",
  crf: "croix-rouge",
  emergency: "urgence",
  profile: "profil",
  guardian: "representant",
  attachments: "pieces",
  consent: "relecture",
} as const satisfies Record<string, DossierStep>;
export type DossierSection = keyof typeof SECTION_STEP;

export const LIMITS = {
  activities: 4,
  skills: 4,
  languages: 3,
  diplomas: 5,
  licenses: 4,
} as const;

/** Lengths compatible with the fields of the PDF forms. */
const LEN = { name: 50, short: 60, text: 100, email: 120, phone: 20, postal: 10, quality: 40 };

const text = (max: number) => z.string().max(max, `${String(max)} caractères au maximum.`);
const opt = (max: number) => text(max).optional();
const yesNo = z.boolean().optional();
const civility = z.enum(["MME", "M"]).optional();
const SKILL_LEVELS = ["BEGINNER", "CONFIRMED", "EXPERT"] as const;
const LANGUAGE_LEVELS = ["NOTIONS", "FLUENT", "BILINGUAL"] as const;

/**
 * Draft: every field optional, only types and lengths checked, so an
 * incomplete or still invalid step can be saved and resumed.
 */
export const dossierDraftSchema = z.object({
  identity: z
    .object({
      civility,
      lastName: opt(LEN.name),
      birthName: opt(LEN.name),
      usageName: opt(LEN.name),
      firstName: opt(LEN.name),
      secondFirstName: opt(LEN.name),
      birthDate: opt(10),
      birthCity: opt(LEN.short),
      birthDepartment: opt(LEN.short),
      birthCountry: opt(LEN.short),
    })
    .partial()
    .optional(),
  contact: z
    .object({
      street: opt(LEN.text),
      addressComplement: opt(LEN.text),
      postalCode: opt(LEN.postal),
      city: opt(LEN.short),
      country: opt(LEN.short),
      phone: opt(LEN.phone),
      email: opt(LEN.email),
      proPhone: opt(LEN.phone),
      proEmail: opt(LEN.email),
    })
    .partial()
    .optional(),
  crf: z
    .object({
      alreadyVolunteer: yesNo,
      hasNivol: yesNo,
      nivol: opt(20),
      hasCrfEmail: yesNo,
      crfEmail: opt(LEN.email),
      activities: z.array(text(LEN.short)).max(LIMITS.activities).optional(),
    })
    .partial()
    .optional(),
  emergency: z
    .object({
      civility,
      lastName: opt(LEN.name),
      firstName: opt(LEN.name),
      relationship: opt(LEN.quality),
      address: opt(LEN.text),
      postalCode: opt(LEN.postal),
      city: opt(LEN.short),
      country: opt(LEN.short),
      phone1: opt(LEN.phone),
      phone2: opt(LEN.phone),
      email: opt(LEN.email),
    })
    .partial()
    .optional(),
  profile: z
    .object({
      skills: z
        .array(z.object({ label: text(LEN.short), level: z.enum(SKILL_LEVELS).optional() }))
        .max(LIMITS.skills)
        .optional(),
      profession: opt(LEN.short),
      sector: opt(LEN.short),
      company: opt(LEN.short),
      languages: z
        .array(z.object({ label: text(LEN.short), level: z.enum(LANGUAGE_LEVELS).optional() }))
        .max(LIMITS.languages)
        .optional(),
      diplomas: z.array(text(LEN.short)).max(LIMITS.diplomas).optional(),
      licenses: z.array(text(10)).max(LIMITS.licenses).optional(),
    })
    .partial()
    .optional(),
  guardian: z
    .object({
      lastName: opt(LEN.name),
      firstName: opt(LEN.name),
      quality: opt(LEN.quality),
      phone: opt(LEN.phone),
    })
    .partial()
    .optional(),
  consent: z.object({ rgpd: z.boolean().optional() }).partial().optional(),
  /** « Structure de rattachement » (setting UL_NAME), written at submission. */
  structure: z.string().max(100).optional(),
});

export type DossierDraft = z.infer<typeof dossierDraftSchema>;

export interface DossierIssue {
  section: DossierSection;
  step: DossierStep;
  /** Field path inside the section (« birthDate », « skills.1.level »…). */
  field: string;
  message: string;
}

/** What the submission rules need besides the data. */
export interface SubmissionContext {
  /** Day of submission (00:00 UTC): age is computed on it. */
  day: Date;
  /** Kinds of the attachments already uploaded (« PARENTAL_AUTH »…). */
  attachmentKinds: readonly string[];
}

const blank = (v: string | undefined | null) => (v ?? "").trim() === "";
const isFrance = (v: string | undefined) => {
  const key = (v ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  return key === "" || key === "france";
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseIsoDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y = 0, m = 1, d = 1] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCDate() === d && date.getUTCMonth() === m - 1 ? date : null;
}

/** Age on the submission day, or null when the birth date is missing or invalid. */
export function dossierAge(draft: DossierDraft, day: Date): number | null {
  return ageOn(parseIsoDay(draft.identity?.birthDate), day);
}

/**
 * Rules of a complete dossier. Returns every issue, each with the step of the
 * form where it is shown. An empty list means the dossier can be submitted.
 */
export function submissionIssues(draft: DossierDraft, ctx: SubmissionContext): DossierIssue[] {
  const issues: DossierIssue[] = [];
  const add = (section: DossierSection, field: string, message: string) => {
    issues.push({ section, step: SECTION_STEP[section], field, message });
  };
  const required = (
    section: DossierSection,
    field: string,
    value: string | undefined,
    label: string,
  ) => {
    if (blank(value)) add(section, field, `${label} est obligatoire.`);
  };
  const phone = (
    section: DossierSection,
    field: string,
    value: string | undefined,
    need: boolean,
  ) => {
    if (blank(value)) {
      if (need) add(section, field, "Le téléphone est obligatoire.");
      return;
    }
    if (
      !parsePhone(value ?? "").normalized &&
      !/^\+\d{8,15}$/.test((value ?? "").replace(/[\s.\-()]/g, ""))
    ) {
      add(section, field, "Numéro invalide : 10 chiffres attendus (ex. 06 12 34 56 78).");
    }
  };
  const email = (
    section: DossierSection,
    field: string,
    value: string | undefined,
    need: boolean,
  ) => {
    if (blank(value)) {
      if (need) add(section, field, "L'e-mail est obligatoire.");
      return;
    }
    if (!EMAIL.test((value ?? "").trim())) add(section, field, "Adresse e-mail invalide.");
  };
  const postal = (
    section: DossierSection,
    field: string,
    value: string | undefined,
    country: string | undefined,
  ) => {
    if (blank(value)) {
      add(section, field, "Le code postal est obligatoire.");
      return;
    }
    if (isFrance(country) && !/^\d{5}$/.test((value ?? "").trim())) {
      add(section, field, "Code postal français : 5 chiffres.");
    }
  };

  const id = draft.identity ?? {};
  if (!id.civility) add("identity", "civility", "La civilité est obligatoire.");
  required("identity", "lastName", id.lastName, "Le nom");
  required("identity", "firstName", id.firstName, "Le prénom");
  const birth = parseIsoDay(id.birthDate);
  if (!birth) add("identity", "birthDate", "La date de naissance est obligatoire (JJ/MM/AAAA).");
  else if (birth.getTime() > ctx.day.getTime()) {
    add("identity", "birthDate", "La date de naissance est dans le futur.");
  } else if ((ageOn(birth, ctx.day) ?? 0) > 100) {
    add("identity", "birthDate", "La date de naissance donne plus de 100 ans : vérifiez-la.");
  }
  required("identity", "birthCity", id.birthCity, "La ville de naissance");
  required("identity", "birthCountry", id.birthCountry, "Le pays de naissance");
  if (isFrance(id.birthCountry)) {
    required("identity", "birthDepartment", id.birthDepartment, "Le département de naissance");
  }

  const c = draft.contact ?? {};
  required("contact", "street", c.street, "Le numéro et la voie");
  postal("contact", "postalCode", c.postalCode, c.country);
  required("contact", "city", c.city, "La ville");
  required("contact", "country", c.country, "Le pays de résidence");
  phone("contact", "phone", c.phone, true);
  email("contact", "email", c.email, true);
  phone("contact", "proPhone", c.proPhone, false);
  email("contact", "proEmail", c.proEmail, false);

  const crf = draft.crf ?? {};
  if (crf.alreadyVolunteer === undefined) {
    add("crf", "alreadyVolunteer", "Indiquez si vous êtes déjà bénévole.");
  }
  if (crf.hasNivol === undefined) add("crf", "hasNivol", "Indiquez si vous avez déjà un NIVOL.");
  if (crf.hasNivol === true && !normalizeNivol(crf.nivol)) {
    add("crf", "nivol", "NIVOL invalide : 11 chiffres suivis d'une lettre (ex. 00012345678A).");
  }
  if (crf.hasCrfEmail === undefined) {
    add("crf", "hasCrfEmail", "Indiquez si vous avez déjà un e-mail Croix-Rouge.");
  }
  if (crf.hasCrfEmail === true) {
    const value = (crf.crfEmail ?? "").trim().toLowerCase();
    if (!EMAIL.test(value) || !value.endsWith("@croix-rouge.fr")) {
      add("crf", "crfEmail", "L'e-mail Croix-Rouge doit se terminer par @croix-rouge.fr.");
    }
  }

  const e = draft.emergency ?? {};
  required("emergency", "lastName", e.lastName, "Le nom");
  required("emergency", "firstName", e.firstName, "Le prénom");
  required("emergency", "relationship", e.relationship, "Le lien de parenté");
  phone("emergency", "phone1", e.phone1, true);
  phone("emergency", "phone2", e.phone2, false);
  email("emergency", "email", e.email, false);

  for (const [i, skill] of (draft.profile?.skills ?? []).entries()) {
    if (!blank(skill.label) && !skill.level) {
      add("profile", `skills.${String(i)}.level`, "Choisissez le niveau de cette compétence.");
    }
  }
  for (const [i, language] of (draft.profile?.languages ?? []).entries()) {
    if (!blank(language.label) && !language.level) {
      add("profile", `languages.${String(i)}.level`, "Choisissez le niveau de cette langue.");
    }
  }

  const age = birth ? ageOn(birth, ctx.day) : null;
  if (age !== null && age < 18) {
    const g = draft.guardian ?? {};
    required("guardian", "lastName", g.lastName, "Le nom du représentant légal");
    required("guardian", "firstName", g.firstName, "Le prénom du représentant légal");
    required("guardian", "quality", g.quality, "La qualité du représentant légal");
    phone("guardian", "phone", g.phone, true);
  }
  if (age !== null && age < 16 && !ctx.attachmentKinds.includes("PARENTAL_AUTH")) {
    add(
      "attachments",
      "PARENTAL_AUTH",
      "L'autorisation parentale est obligatoire avant 16 ans : ajoutez-la en pièce jointe.",
    );
  }

  if (draft.consent?.rgpd !== true) {
    add("consent", "rgpd", "Cochez la case pour confirmer avoir lu l'information sur vos données.");
  }
  return issues;
}

/** Steps shown for this draft: « Représentant légal » only for a minor. */
export function visibleSteps(draft: DossierDraft, day: Date): DossierStep[] {
  const age = dossierAge(draft, day);
  return DOSSIER_STEPS.filter((s) => s !== "representant" || (age !== null && age < 18));
}

export interface MigratedDraft {
  data: DossierDraft;
  warnings: string[];
}

/**
 * Reads stored data of any `schemaVersion` into the current draft shape.
 * Version 0 (before step 7: flat `firstName`, `lastName`, `email`, `phone`)
 * is mapped; any section that no longer validates is dropped with a warning
 * instead of breaking the form.
 */
export function migrateDossierData(raw: unknown, version: number): MigratedDraft {
  const warnings: string[] = [];
  let source: Record<string, unknown> =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  if (version < 1) {
    const flat = source;
    const pick = (k: string) => (typeof flat[k] === "string" ? flat[k] : undefined);
    source = {
      identity: { firstName: pick("firstName"), lastName: pick("lastName") },
      contact: { email: pick("email"), phone: pick("phone") },
    };
    const known = new Set(["firstName", "lastName", "email", "phone"]);
    const dropped = Object.keys(flat).filter((k) => !known.has(k));
    if (dropped.length > 0) {
      warnings.push(`Version ${String(version)} : champs ignorés (${dropped.join(", ")}).`);
    }
  } else if (version > DOSSIER_SCHEMA_VERSION) {
    warnings.push(
      `Version ${String(version)} plus récente que l'application : champs inconnus ignorés.`,
    );
  }
  const data: Record<string, unknown> = {};
  const shape = dossierDraftSchema.shape;
  for (const [key, value] of Object.entries(source)) {
    if (!(key in shape)) {
      warnings.push(`Section inconnue « ${key} » ignorée.`);
      continue;
    }
    const parsed = shape[key as keyof typeof shape].safeParse(value);
    if (parsed.success) data[key] = parsed.data;
    else warnings.push(`Section « ${key} » illisible, ignorée.`);
  }
  return { data: data, warnings };
}

/** Normalises a submitted draft (trimmed texts, phones, e-mails, NIVOL), ready to store. */
export function normalizeSubmission(draft: DossierDraft): DossierDraft {
  const t = (v: string | undefined) => {
    const s = (v ?? "").trim();
    return s === "" ? undefined : s;
  };
  const p = (v: string | undefined) => {
    const s = t(v);
    if (!s) return undefined;
    const parsed = parsePhone(s);
    return parsed.normalized ? (parsed.value ?? undefined) : s.replace(/[\s.\-()]/g, "");
  };
  const m = (v: string | undefined) => t(v)?.toLowerCase();
  const list = (v: string[] | undefined) => (v ?? []).map((x) => x.trim()).filter((x) => x !== "");
  const id = draft.identity ?? {};
  const c = draft.contact ?? {};
  const crf = draft.crf ?? {};
  const e = draft.emergency ?? {};
  const pr = draft.profile ?? {};
  const g = draft.guardian ?? {};
  return {
    identity: {
      civility: id.civility,
      lastName: t(id.lastName),
      birthName: t(id.birthName),
      usageName: t(id.usageName),
      firstName: t(id.firstName),
      secondFirstName: t(id.secondFirstName),
      birthDate: t(id.birthDate),
      birthCity: t(id.birthCity),
      birthDepartment: t(id.birthDepartment),
      birthCountry: t(id.birthCountry),
    },
    contact: {
      street: t(c.street),
      addressComplement: t(c.addressComplement),
      postalCode: t(c.postalCode),
      city: t(c.city),
      country: t(c.country),
      phone: p(c.phone),
      email: m(c.email),
      proPhone: p(c.proPhone),
      proEmail: m(c.proEmail),
    },
    crf: {
      alreadyVolunteer: crf.alreadyVolunteer,
      hasNivol: crf.hasNivol,
      nivol: crf.hasNivol ? (normalizeNivol(crf.nivol) ?? undefined) : undefined,
      hasCrfEmail: crf.hasCrfEmail,
      crfEmail: crf.hasCrfEmail ? m(crf.crfEmail) : undefined,
      activities: list(crf.activities),
    },
    emergency: {
      civility: e.civility,
      lastName: t(e.lastName),
      firstName: t(e.firstName),
      relationship: t(e.relationship),
      address: t(e.address),
      postalCode: t(e.postalCode),
      city: t(e.city),
      country: t(e.country),
      phone1: p(e.phone1),
      phone2: p(e.phone2),
      email: m(e.email),
    },
    profile: {
      skills: (pr.skills ?? [])
        .filter((s) => !blank(s.label))
        .map((s) => ({ ...s, label: s.label.trim() })),
      profession: t(pr.profession),
      sector: t(pr.sector),
      company: t(pr.company),
      languages: (pr.languages ?? [])
        .filter((l) => !blank(l.label))
        .map((l) => ({ ...l, label: l.label.trim() })),
      diplomas: list(pr.diplomas),
      licenses: list(pr.licenses).map((l) => l.toUpperCase()),
    },
    guardian: {
      lastName: t(g.lastName),
      firstName: t(g.firstName),
      quality: t(g.quality),
      phone: p(g.phone),
    },
    consent: { rgpd: draft.consent?.rgpd === true },
  };
}
