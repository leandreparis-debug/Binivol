import { formatDate } from "./dates";
import { formatPhone } from "./phone";

/**
 * Gaia assistant (step 9). Binivol never calls Gaia, the national tool: it
 * lays out the values in the order of Gaia's creation screen, to copy them
 * one by one or all at once, then records the result (NIVOL, CRF e-mail).
 * Pure and client-safe.
 */

/** One item of the checklist (setting `GAIA_CHECKLIST`). */
export interface GaiaChecklistItem {
  key: string;
  label: string;
  /** Shown only when the candidate asked for a membership (ADHESION piece). */
  onlyIfAdhesion?: boolean;
}

export const DEFAULT_GAIA_CHECKLIST: GaiaChecklistItem[] = [
  { key: "created", label: "Personne créée dans Gaia" },
  { key: "adhesion", label: "Adhésion enregistrée", onlyIfAdhesion: true },
  { key: "attached", label: "Rattachement à l'UL de Versailles" },
  { key: "crfAccount", label: "Compte @croix-rouge.fr demandé" },
];

/** Reads the setting; a malformed value falls back to the default list. */
export function parseGaiaChecklist(value: unknown): GaiaChecklistItem[] {
  if (!Array.isArray(value)) return DEFAULT_GAIA_CHECKLIST;
  const items = value.flatMap((v: unknown) => {
    if (typeof v !== "object" || v === null) return [];
    const { key, label, onlyIfAdhesion } = v as Record<string, unknown>;
    if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(key)) return [];
    if (typeof label !== "string" || label.trim() === "") return [];
    return [{ key, label: label.trim(), ...(onlyIfAdhesion === true ? { onlyIfAdhesion } : {}) }];
  });
  return items.length > 0 ? items : DEFAULT_GAIA_CHECKLIST;
}

/** State of one checked item, stored on the candidacy (`gaiaChecklist`). */
export interface CheckedState {
  at: string;
  byId: string | null;
  by: string;
}

export function parseCheckedStates(value: unknown): Record<string, CheckedState> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, CheckedState> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== "object" || v === null) continue;
    const { at, byId, by } = v as Record<string, unknown>;
    if (typeof at !== "string" || typeof by !== "string") continue;
    out[key] = { at, byId: typeof byId === "string" ? byId : null, by };
  }
  return out;
}

/** What the sheet is made of: the page, plus the sensitive part read on demand. */
export interface GaiaSource {
  civility: "M" | "MME" | null;
  lastName: string;
  birthName: string | null;
  usageName: string | null;
  firstName: string;
  phone: string | null;
  email: string | null;
  birthDate: Date | null;
  birthCity: string | null;
  birthDepartment: string | null;
  birthCountry: string | null;
  street: string | null;
  addressComplement: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  emergency: {
    firstName: string | null;
    lastName: string;
    relationship: string | null;
    phone: string | null;
  } | null;
}

export interface GaiaRow {
  key: string;
  label: string;
  value: string;
}

const t = (v: string | null | undefined) => (v ?? "").trim();

/**
 * The rows of the sheet, in the order of Gaia's creation screen: civility,
 * birth name, usage name, first name, birth date and place, nationality,
 * address, phone, e-mail, emergency contact. Dates as `JJ/MM/AAAA`.
 * Nationality is not collected by the dossier: it is to be asked.
 */
export function gaiaRows(source: GaiaSource): GaiaRow[] {
  const place = [t(source.birthCity), t(source.birthDepartment) && `(${t(source.birthDepartment)})`]
    .filter(Boolean)
    .join(" ");
  const e = source.emergency;
  return [
    {
      key: "civility",
      label: "Civilité",
      value: source.civility === "MME" ? "Madame" : source.civility === "M" ? "Monsieur" : "",
    },
    {
      key: "birthName",
      label: "Nom de naissance",
      value: t(source.birthName) || t(source.lastName),
    },
    { key: "usageName", label: "Nom d'usage", value: t(source.usageName) },
    { key: "firstName", label: "Prénom", value: t(source.firstName) },
    {
      key: "birthDate",
      label: "Date de naissance",
      value: source.birthDate ? formatDate(source.birthDate) : "",
    },
    { key: "birthPlace", label: "Lieu de naissance", value: place },
    { key: "birthCountry", label: "Pays de naissance", value: t(source.birthCountry) },
    { key: "nationality", label: "Nationalité", value: "" },
    { key: "street", label: "Adresse", value: t(source.street) },
    { key: "addressComplement", label: "Complément d'adresse", value: t(source.addressComplement) },
    { key: "postalCode", label: "Code postal", value: t(source.postalCode) },
    { key: "city", label: "Ville", value: t(source.city) },
    { key: "country", label: "Pays", value: t(source.country) },
    { key: "phone", label: "Téléphone", value: source.phone ? formatPhone(source.phone) : "" },
    { key: "email", label: "E-mail", value: t(source.email) },
    {
      key: "emergencyName",
      label: "Contact d'urgence",
      value: e ? [t(e.firstName), t(e.lastName)].filter(Boolean).join(" ") : "",
    },
    { key: "emergencyRelationship", label: "Lien avec le contact", value: t(e?.relationship) },
    {
      key: "emergencyPhone",
      label: "Téléphone du contact",
      value: e?.phone ? formatPhone(e.phone) : "",
    },
  ];
}

/** « Tout copier »: one line per field, label and value separated by a tab. */
export function gaiaCopyText(rows: GaiaRow[]): string {
  return rows.map((r) => `${r.label}\t${r.value}`).join("\n");
}

/** Undo of a closure made by mistake: TOPAZE, within 7 days of the closure. */
export const UNDO_FINALIZE_DAYS = 7;

export function canUndoFinalize(closedAt: Date | null, now: Date = new Date()): boolean {
  if (!closedAt) return false;
  return now.getTime() - closedAt.getTime() <= UNDO_FINALIZE_DAYS * 86_400_000;
}
