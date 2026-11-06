/**
 * Declared diplomas of the online dossier (step 16): the catalogue the
 * candidate chooses from (setting `DECLARED_DIPLOMA_CATALOG`, editable by
 * TOPAZE), then « Autre (préciser) ». Client-safe, pure.
 *
 * Codes follow the reference list of step 10 when it has the same thing
 * (PSC, GQS, FCPSE, FPSC, FPSE, TCAU): same code = same thing. `reference`
 * names the reference item a declared diploma may open « à vérifier dans
 * Pegass » (never automatically).
 */

export const DIPLOMA_GROUPS = [
  "Grand public",
  "Secourisme en équipe",
  "Encadrement opérationnel",
  "Aquatique",
  "Formateurs",
  "Autres",
] as const;

export interface DiplomaCatalogItem {
  code: string;
  label: string;
  group: string;
  /** Code of the reference item it matches (often the same code), or none. */
  reference?: string;
}

export const DEFAULT_DIPLOMA_CATALOG: readonly DiplomaCatalogItem[] = [
  {
    code: "PSC",
    label: "PSC (Prévention et secours civiques, ex-PSC1)",
    group: "Grand public",
    reference: "PSC",
  },
  { code: "GQS", label: "GQS (Gestes qui sauvent)", group: "Grand public", reference: "GQS" },
  { code: "IPS", label: "IPS (Initiation aux premiers secours)", group: "Grand public" },
  { code: "SST", label: "SST (Sauveteur secouriste du travail)", group: "Grand public" },
  { code: "MAC_SST", label: "MAC SST (maintien et actualisation SST)", group: "Grand public" },
  { code: "AFGSU1", label: "AFGSU 1", group: "Grand public" },
  { code: "AFGSU2", label: "AFGSU 2", group: "Grand public" },
  {
    code: "PSE1",
    label: "PSE1 (Premiers secours en équipe de niveau 1)",
    group: "Secourisme en équipe",
    reference: "PSE",
  },
  {
    code: "PSE2",
    label: "PSE2 (Premiers secours en équipe de niveau 2)",
    group: "Secourisme en équipe",
    reference: "PSE",
  },
  {
    code: "FCPSE",
    label: "Recyclage PSE (FC PSE)",
    group: "Secourisme en équipe",
    reference: "FCPSE",
  },
  { code: "CE", label: "Chef d'équipe (CE)", group: "Encadrement opérationnel" },
  { code: "CP", label: "Chef de poste (CP)", group: "Encadrement opérationnel" },
  { code: "BNSSA", label: "BNSSA (sauveteur aquatique)", group: "Aquatique" },
  { code: "SSA", label: "SSA (surveillant sauveteur aquatique)", group: "Aquatique" },
  { code: "FPSC", label: "Formateur PSC (FPSC)", group: "Formateurs", reference: "FPSC" },
  { code: "FPSE", label: "Formateur PSE (FPSE)", group: "Formateurs", reference: "FPSE" },
  { code: "F_SST", label: "Formateur SST", group: "Formateurs" },
  { code: "FDF", label: "Formateur de formateurs", group: "Formateurs" },
  {
    code: "TCAU",
    label: "TCAU (Tronc commun des acteurs de l'urgence)",
    group: "Autres",
    reference: "TCAU",
  },
];

/** Who issued it (enum `DeclaredDiplomaIssuer`). */
export const DIPLOMA_ISSUERS = ["CRF", "CIVIL_PROTECTION", "SDIS", "EMPLOYER", "OTHER"] as const;
export type DiplomaIssuer = (typeof DIPLOMA_ISSUERS)[number];

export const DIPLOMA_ISSUER_LABELS: Record<DiplomaIssuer, string> = {
  CRF: "Croix-Rouge",
  CIVIL_PROTECTION: "Protection civile",
  SDIS: "SDIS",
  EMPLOYER: "Employeur",
  OTHER: "Autre",
};

/** A declared diploma as typed in the dossier. */
export interface DeclaredDiploma {
  /** Catalogue code; absent for « Autre (préciser) ». */
  code?: string;
  label: string;
  /** AAAA. */
  year?: string;
  issuer?: DiplomaIssuer;
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Catalogue items matching what is typed (code or words of the label), in catalogue order. */
export function searchCatalog(
  catalog: readonly DiplomaCatalogItem[],
  query: string,
  limit = 8,
): DiplomaCatalogItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return catalog.slice(0, limit);
  return catalog
    .filter((item) => {
      const hay = fold(`${item.code.replace(/_/g, " ")} ${item.label} ${item.group}`);
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}

/** The PDF's « Diplome n » box: the label, and the year when known. */
export function diplomaPdfText(d: DeclaredDiploma): string {
  return d.year ? `${d.label} (${d.year})` : d.label;
}

/** The catalogue as editable lines: « code | libellé | groupe | référentiel ». */
export function catalogToLines(catalog: readonly DiplomaCatalogItem[]): string {
  return catalog
    .map((i) => [i.code, i.label, i.group, i.reference ?? ""].join(" | ").replace(/ \| $/, ""))
    .join("\n");
}

/**
 * Reads the stored catalogue (setting value), falling back to the default
 * when absent or unreadable; keeps only well-formed items, without duplicates.
 */
export function parseDiplomaCatalog(value: unknown): readonly DiplomaCatalogItem[] {
  if (!Array.isArray(value)) return DEFAULT_DIPLOMA_CATALOG;
  const seen = new Set<string>();
  const out: DiplomaCatalogItem[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const code = typeof r.code === "string" ? r.code.trim().toUpperCase() : "";
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const group = typeof r.group === "string" && r.group.trim() ? r.group.trim() : "Autres";
    if (!/^[A-Z0-9_]{1,20}$/.test(code) || !label || label.length > 120 || seen.has(code)) continue;
    seen.add(code);
    const reference =
      typeof r.reference === "string" && /^[A-Z0-9_]{1,20}$/.test(r.reference.trim().toUpperCase())
        ? r.reference.trim().toUpperCase()
        : undefined;
    out.push({ code, label, group, ...(reference ? { reference } : {}) });
  }
  return out.length > 0 ? out : DEFAULT_DIPLOMA_CATALOG;
}

/** Parses the lines typed in the settings, or explains what is wrong. */
export function linesToCatalog(
  text: string,
): { ok: true; value: DiplomaCatalogItem[] } | { ok: false; error: string } {
  const items: DiplomaCatalogItem[] = [];
  const seen = new Set<string>();
  for (const line of text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)) {
    const [code = "", label = "", group = "", reference = ""] = line
      .split("|")
      .map((p) => p.trim());
    const upper = code.toUpperCase();
    if (!/^[A-Z0-9_]{1,20}$/.test(upper) || !label) {
      return {
        ok: false,
        error: `Ligne illisible : « ${line} » (attendu : code | libellé | groupe).`,
      };
    }
    if (seen.has(upper)) return { ok: false, error: `Le code ${upper} apparaît deux fois.` };
    seen.add(upper);
    items.push({
      code: upper,
      label,
      group: group || "Autres",
      ...(reference ? { reference: reference.toUpperCase() } : {}),
    });
  }
  return items.length > 0
    ? { ok: true, value: items }
    : { ok: false, error: "Le catalogue est vide." };
}
