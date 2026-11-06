/**
 * Indicators of the DLUS dashboard (TOPAZE home page, step 16): the
 * operational strength of the unit. Each one is a definition (setting
 * `DASHBOARD_INDICATORS`, editable by TOPAZE), turned into one SQL condition
 * shared by the dashboard count and the directory filter
 * (`/benevoles?indicateur=KEY`): same filter, same total. Client-safe, pure.
 */

export const INDICATOR_KINDS = ["valid", "enrolled"] as const;
export type IndicatorKind = (typeof INDICATOR_KINDS)[number];

export const INDICATOR_KIND_LABELS: Record<IndicatorKind, string> = {
  valid: "qualification valide",
  enrolled: "inscription en cours",
};

export interface DashboardIndicator {
  /** Key in the directory address (`?indicateur=BENURS`). */
  key: string;
  label: string;
  /**
   * `valid`: an active volunteer holding a valid training of `required`
   * (any of them) and none of `excluded`; `enrolled`: an active volunteer
   * registered to a session of `required` not finished yet.
   */
  kind: IndicatorKind;
  required: string[];
  excluded: string[];
  /** « dont PSE2 : n », shown only when the reference list has these codes. */
  detail?: { label: string; codes: string[] };
}

/**
 * Default definitions. The reference list has one « PSE » item (no PSE1 /
 * PSE2 levels): « Secouristes » counts it, and « dont PSE2 » only appears
 * once a `PSE2` item exists. Initiators use the codes added at step 16
 * (`I_GQS`, `I_IPS`, `I_IPSEN`), to be confirmed.
 */
export const DEFAULT_INDICATORS: readonly DashboardIndicator[] = [
  {
    key: "SECOURISTES",
    label: "Secouristes",
    kind: "valid",
    required: ["PSE", "PSE1", "PSE2"],
    excluded: [],
    detail: { label: "dont PSE2", codes: ["PSE2"] },
  },
  {
    key: "BENURS",
    label: "Bénurs",
    kind: "valid",
    required: ["TCAU"],
    excluded: ["PSE", "PSE1", "PSE2"],
  },
  {
    key: "FORMATEURS_PSC",
    label: "Formateurs PSC",
    kind: "valid",
    required: ["FPSC"],
    excluded: [],
  },
  {
    key: "INITIATEURS_GQS_IPS",
    label: "Initiateurs GQS + IPS",
    kind: "valid",
    required: ["I_GQS", "I_IPS"],
    excluded: [],
  },
  {
    key: "INITIATEURS_IPSEN",
    label: "Initiateurs IPSEN",
    kind: "valid",
    required: ["I_IPSEN"],
    excluded: [],
  },
  {
    key: "STAGIAIRES_FORMATION",
    label: "Stagiaires formation",
    kind: "enrolled",
    required: ["FPSC", "FPSE", "I_GQS", "I_IPS", "I_IPSEN"],
    excluded: [],
  },
  {
    key: "STAGIAIRES_SECOURS",
    label: "Stagiaires secours",
    kind: "enrolled",
    required: ["PSE", "PSE1", "PSE2"],
    excluded: [],
  },
];

const CODE = /^[A-Z0-9_]{1,20}$/;
const KEY = /^[A-Z0-9_]{2,30}$/;

function codes(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.map((v) => (typeof v === "string" ? v.trim().toUpperCase() : ""));
  return out.every((c) => CODE.test(c)) ? [...new Set(out)] : null;
}

/** Reads the stored setting; the defaults when absent or unreadable. Ill-formed items are skipped. */
export function parseIndicators(value: unknown): readonly DashboardIndicator[] {
  if (!Array.isArray(value)) return DEFAULT_INDICATORS;
  const out: DashboardIndicator[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (raw === null || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim().toUpperCase() : "";
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const kind = r.kind === "valid" || r.kind === "enrolled" ? r.kind : null;
    const required = codes(r.required);
    const excluded = codes(r.excluded ?? []);
    if (!KEY.test(key) || seen.has(key) || !label || !kind || !required?.length || !excluded)
      continue;
    seen.add(key);
    const d = r.detail as { label?: unknown; codes?: unknown } | undefined;
    const detailCodes = d ? codes(d.codes) : null;
    out.push({
      key,
      label,
      kind,
      required,
      excluded,
      ...(d && typeof d.label === "string" && detailCodes?.length
        ? { detail: { label: d.label, codes: detailCodes } }
        : {}),
    });
  }
  return out.length > 0 ? out : DEFAULT_INDICATORS;
}

/**
 * The definitions as editable lines:
 * « CLÉ | libellé | valide ou inscription | codes requis | codes exclus | dont X=CODES ».
 */
export function indicatorsToLines(items: readonly DashboardIndicator[]): string {
  return items
    .map((i) =>
      [
        i.key,
        i.label,
        i.kind === "valid" ? "valide" : "inscription",
        i.required.join(", "),
        i.excluded.join(", "),
        i.detail ? `${i.detail.label}=${i.detail.codes.join(", ")}` : "",
      ]
        .join(" | ")
        .replace(/( \| )+$/, ""),
    )
    .join("\n");
}

/** Parses the lines typed in the settings, or explains what is wrong. */
export function linesToIndicators(
  text: string,
): { ok: true; value: DashboardIndicator[] } | { ok: false; error: string } {
  const out: DashboardIndicator[] = [];
  const seen = new Set<string>();
  const split = (s: string) =>
    s
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
  for (const line of text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)) {
    const [key = "", label = "", kindText = "", req = "", exc = "", detail = ""] = line
      .split("|")
      .map((p) => p.trim());
    const upper = key.toUpperCase();
    const kind = /^valide?$/i.test(kindText)
      ? "valid"
      : /^inscriptions?$/i.test(kindText)
        ? "enrolled"
        : null;
    const required = split(req);
    const excluded = split(exc);
    if (!KEY.test(upper) || !label || !kind || required.length === 0) {
      return {
        ok: false,
        error: `Ligne illisible : « ${line} » (attendu : CLÉ | libellé | valide ou inscription | codes requis | codes exclus).`,
      };
    }
    if ([...required, ...excluded].some((c) => !CODE.test(c))) {
      return { ok: false, error: `Code illisible dans « ${line} ».` };
    }
    if (seen.has(upper)) return { ok: false, error: `La clé ${upper} apparaît deux fois.` };
    seen.add(upper);
    const [detailLabel = "", detailCodes = ""] = detail.split("=").map((p) => p.trim());
    out.push({
      key: upper,
      label,
      kind,
      required,
      excluded,
      ...(detailLabel && split(detailCodes).length > 0
        ? { detail: { label: detailLabel, codes: split(detailCodes) } }
        : {}),
    });
  }
  return out.length > 0 ? { ok: true, value: out } : { ok: false, error: "Aucun indicateur." };
}
