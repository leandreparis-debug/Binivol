import type { DossierDraft } from "@/lib/dossierSchema";
import { formatPhone } from "@/lib/phone";

/**
 * The review table of a submitted dossier: one row per field, with the
 * current value of the person's page and the value of the dossier. Pure.
 *
 * - `differs`: the two values are not the same (after normalisation);
 * - `defaultChecked`: the page is empty and the dossier has a value;
 * - `reportable: false`: shown for information only (declared NIVOL and CRF
 *   e-mail — step 9 —, second first name, legal guardian…).
 */

export type ReportTarget = "person" | "sensitive" | "emergency" | "list" | "info";

export interface ComparisonRow {
  key: ReportKey | InfoKey;
  group: string;
  label: string;
  current: string | null;
  proposed: string | null;
  differs: boolean;
  defaultChecked: boolean;
  reportable: boolean;
  target: ReportTarget;
  /** A warning for the reviewer (declared NIVOL already in Binivol…). */
  warning?: string;
}

/** Current values of the person, as the review needs them. */
export interface CurrentValues {
  person: Record<PersonKey, string | null>;
  sensitive: Record<SensitiveKey, string | null>;
  emergency: Record<EmergencyKey, string | null>;
  lists: Record<ListKey, string[]>;
}

export const PERSON_KEYS = [
  "civility",
  "lastName",
  "birthName",
  "usageName",
  "firstName",
  "email",
  "phone",
  "proEmail",
  "proPhone",
  "profession",
  "sector",
  "company",
] as const;
export const SENSITIVE_KEYS = [
  "birthDate",
  "birthCity",
  "birthDepartment",
  "birthCountry",
  "street",
  "addressComplement",
  "postalCode",
  "city",
  "country",
] as const;
export const EMERGENCY_KEYS = [
  "emergency.civility",
  "emergency.lastName",
  "emergency.firstName",
  "emergency.relationship",
  "emergency.street",
  "emergency.postalCode",
  "emergency.city",
  "emergency.country",
  "emergency.phone1",
  "emergency.phone2",
  "emergency.email",
] as const;
export const LIST_KEYS = ["skills", "languages", "licenses", "diplomas", "activities"] as const;
export const INFO_KEYS = [
  "secondFirstName",
  "alreadyVolunteer",
  "nivol",
  "crfEmail",
  "guardian",
] as const;

export type PersonKey = (typeof PERSON_KEYS)[number];
export type SensitiveKey = (typeof SENSITIVE_KEYS)[number];
export type EmergencyKey = (typeof EMERGENCY_KEYS)[number];
export type ListKey = (typeof LIST_KEYS)[number];
export type InfoKey = (typeof INFO_KEYS)[number];
export type ReportKey = PersonKey | SensitiveKey | EmergencyKey | ListKey;

export const REPORT_KEYS: readonly ReportKey[] = [
  ...PERSON_KEYS,
  ...SENSITIVE_KEYS,
  ...EMERGENCY_KEYS,
  ...LIST_KEYS,
];

const LABELS: Record<ReportKey | InfoKey, string> = {
  civility: "Civilité",
  lastName: "Nom",
  birthName: "Nom de naissance",
  usageName: "Nom d'usage",
  firstName: "Prénom",
  email: "E-mail personnel",
  phone: "Téléphone personnel",
  proEmail: "E-mail professionnel",
  proPhone: "Téléphone professionnel",
  profession: "Profession",
  sector: "Secteur professionnel",
  company: "Entreprise",
  birthDate: "Date de naissance",
  birthCity: "Ville de naissance",
  birthDepartment: "Département de naissance",
  birthCountry: "Pays de naissance",
  street: "Numéro et voie",
  addressComplement: "Complément d'adresse",
  postalCode: "Code postal",
  city: "Ville",
  country: "Pays de résidence",
  "emergency.civility": "Civilité",
  "emergency.lastName": "Nom",
  "emergency.firstName": "Prénom",
  "emergency.relationship": "Lien de parenté",
  "emergency.street": "Adresse",
  "emergency.postalCode": "Code postal",
  "emergency.city": "Ville",
  "emergency.country": "Pays",
  "emergency.phone1": "Téléphone 1",
  "emergency.phone2": "Téléphone 2",
  "emergency.email": "E-mail",
  skills: "Compétences",
  languages: "Langues",
  licenses: "Permis",
  diplomas: "Diplômes déclarés",
  activities: "Activités souhaitées",
  secondFirstName: "Second prénom",
  alreadyVolunteer: "Déjà bénévole",
  nivol: "NIVOL déclaré",
  crfEmail: "E-mail Croix-Rouge déclaré",
  guardian: "Représentant légal",
};

const CIVILITY: Record<string, string> = { MME: "Mme", M: "M." };
const SKILL: Record<string, string> = {
  BEGINNER: "Débutant",
  CONFIRMED: "Confirmé",
  EXPERT: "Expert",
};
const LANGUAGE: Record<string, string> = {
  NOTIONS: "Notions",
  FLUENT: "Courant",
  BILINGUAL: "Bilingue",
};

function frenchDay(iso: string | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-");
  return `${d ?? ""}/${m ?? ""}/${y ?? ""}`;
}

const v = (value: string | undefined | null) => {
  const t = (value ?? "").trim();
  return t === "" ? null : t;
};

/** The value the dossier proposes for each reportable key, as display text. */
export function proposedValues(draft: DossierDraft): Record<ReportKey, string | null> {
  const id = draft.identity ?? {};
  const c = draft.contact ?? {};
  const e = draft.emergency ?? {};
  const p = draft.profile ?? {};
  const phone = (s: string | undefined) => (v(s) ? formatPhone(v(s)) : null);
  return {
    civility: id.civility ? (CIVILITY[id.civility] ?? null) : null,
    lastName: v(id.lastName),
    birthName: v(id.birthName),
    usageName: v(id.usageName),
    firstName: v(id.firstName),
    email: v(c.email),
    phone: phone(c.phone),
    proEmail: v(c.proEmail),
    proPhone: phone(c.proPhone),
    profession: v(p.profession),
    sector: v(p.sector),
    company: v(p.company),
    birthDate: frenchDay(id.birthDate),
    birthCity: v(id.birthCity),
    birthDepartment: v(id.birthDepartment),
    birthCountry: v(id.birthCountry),
    street: v(c.street),
    addressComplement: v(c.addressComplement),
    postalCode: v(c.postalCode),
    city: v(c.city),
    country: v(c.country),
    "emergency.civility": e.civility ? (CIVILITY[e.civility] ?? null) : null,
    "emergency.lastName": v(e.lastName),
    "emergency.firstName": v(e.firstName),
    "emergency.relationship": v(e.relationship),
    "emergency.street": v(e.address),
    "emergency.postalCode": v(e.postalCode),
    "emergency.city": v(e.city),
    "emergency.country": v(e.country),
    "emergency.phone1": phone(e.phone1),
    "emergency.phone2": phone(e.phone2),
    "emergency.email": v(e.email),
    skills: listText(
      (p.skills ?? []).map((s) => `${s.label}${s.level ? ` (${SKILL[s.level] ?? s.level})` : ""}`),
    ),
    languages: listText(
      (p.languages ?? []).map(
        (l) => `${l.label}${l.level ? ` (${LANGUAGE[l.level] ?? l.level})` : ""}`,
      ),
    ),
    licenses: listText(p.licenses ?? []),
    diplomas: listText(p.diplomas ?? []),
    activities: listText(draft.crf?.activities ?? []),
  };
}

function listText(items: string[]): string | null {
  const clean = items.map((i) => i.trim()).filter((i) => i !== "");
  return clean.length > 0 ? clean.join(", ") : null;
}

const key = (s: string | null) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s.]/g, "")
    .toLowerCase();

function groupOf(k: ReportKey | InfoKey): string {
  if ((PERSON_KEYS as readonly string[]).includes(k)) {
    return ["profession", "sector", "company"].includes(k) ? "Profil" : "Identité et coordonnées";
  }
  if ((SENSITIVE_KEYS as readonly string[]).includes(k)) return "Naissance et adresse";
  if (k.startsWith("emergency.")) return "Personne à prévenir";
  if ((LIST_KEYS as readonly string[]).includes(k)) return "Profil";
  return "Pour information";
}

/** Builds the review table. `nivolHolder` names the page already holding the declared NIVOL. */
export function buildComparison(
  draft: DossierDraft,
  current: CurrentValues,
  options: { nivolHolder?: string | null } = {},
): ComparisonRow[] {
  const proposed = proposedValues(draft);
  const currentOf = (k: ReportKey): string | null => {
    if ((PERSON_KEYS as readonly string[]).includes(k)) return current.person[k as PersonKey];
    if ((SENSITIVE_KEYS as readonly string[]).includes(k))
      return current.sensitive[k as SensitiveKey];
    if (k.startsWith("emergency.")) return current.emergency[k as EmergencyKey];
    return listText(current.lists[k as ListKey]);
  };
  const rows: ComparisonRow[] = REPORT_KEYS.map((k) => {
    const cur = currentOf(k);
    const prop = proposed[k];
    const target: ReportTarget = (PERSON_KEYS as readonly string[]).includes(k)
      ? "person"
      : (SENSITIVE_KEYS as readonly string[]).includes(k)
        ? "sensitive"
        : k.startsWith("emergency.")
          ? "emergency"
          : "list";
    return {
      key: k,
      group: groupOf(k),
      label: LABELS[k],
      current: cur,
      proposed: prop,
      differs: prop !== null && key(prop) !== key(cur),
      defaultChecked: prop !== null && cur === null,
      reportable: prop !== null,
      target,
    };
  });
  const crf = draft.crf ?? {};
  const g = draft.guardian ?? {};
  const info: [InfoKey, string | null, string | undefined][] = [
    ["secondFirstName", v(draft.identity?.secondFirstName), undefined],
    [
      "alreadyVolunteer",
      crf.alreadyVolunteer === undefined ? null : crf.alreadyVolunteer ? "Oui" : "Non",
      undefined,
    ],
    [
      "nivol",
      v(crf.nivol),
      options.nivolHolder ? `Ce NIVOL est déjà attribué à ${options.nivolHolder}.` : undefined,
    ],
    ["crfEmail", v(crf.crfEmail), undefined],
    [
      "guardian",
      v([g.firstName, g.lastName].filter(Boolean).join(" ")) &&
        `${[g.firstName, g.lastName].filter(Boolean).join(" ")}${g.quality ? ` (${g.quality})` : ""}${g.phone ? ` · ${formatPhone(g.phone)}` : ""}`,
      undefined,
    ],
  ];
  for (const [k, value, warning] of info) {
    if (value === null || value === "") continue;
    rows.push({
      key: k,
      group: "Pour information",
      label: LABELS[k],
      current: null,
      proposed: value,
      differs: false,
      defaultChecked: false,
      reportable: false,
      target: "info",
      ...(warning ? { warning } : {}),
    });
  }
  return rows;
}
