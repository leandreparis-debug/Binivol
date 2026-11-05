// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DossierDraft } from "@/lib/dossierSchema";
import {
  buildComparison,
  EMERGENCY_KEYS,
  PERSON_KEYS,
  SENSITIVE_KEYS,
  type CurrentValues,
} from "../compare";

const empty = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, null])) as Record<K, string | null>;

function current(overrides: Partial<CurrentValues["person"]> = {}): CurrentValues {
  return {
    person: { ...empty(PERSON_KEYS), firstName: "Camille", lastName: "Exemple", ...overrides },
    sensitive: empty(SENSITIVE_KEYS),
    emergency: empty(EMERGENCY_KEYS),
    lists: { skills: [], languages: ["Anglais"], licenses: [], diplomas: [], activities: [] },
  };
}

const draft: DossierDraft = {
  identity: { civility: "MME", firstName: "Camille", lastName: "EXEMPLE", birthDate: "1995-04-12" },
  contact: { phone: "0639980001", city: "Versailles" },
  crf: { hasNivol: true, nivol: "00012345678A", hasCrfEmail: true, crfEmail: "c@croix-rouge.fr" },
  profile: { languages: [{ label: "Anglais", level: "FLUENT" }] },
};

describe("dossier review table", () => {
  const rows = buildComparison(draft, current(), { nivolHolder: "Dominique Exemple (P-00012)" });
  const row = (key: string) => rows.find((r) => r.key === key);

  it("checks by default the fields empty on the page", () => {
    expect(row("birthDate")).toMatchObject({
      current: null,
      proposed: "12/04/1995",
      differs: true,
      defaultChecked: true,
      reportable: true,
      target: "sensitive",
    });
    expect(row("phone")?.proposed).toBe("06 39 98 00 01");
  });

  it("compares without case, accents or spaces, and never checks a filled field by default", () => {
    expect(row("lastName")).toMatchObject({ differs: false, defaultChecked: false });
    const changed = buildComparison(draft, current({ lastName: "Autre" }));
    expect(changed.find((r) => r.key === "lastName")).toMatchObject({
      differs: true,
      defaultChecked: false,
    });
  });

  it("never offers the declared NIVOL nor the CRF e-mail to report, and warns on a taken NIVOL", () => {
    expect(row("nivol")).toMatchObject({
      reportable: false,
      target: "info",
      warning: "Ce NIVOL est déjà attribué à Dominique Exemple (P-00012).",
    });
    expect(row("crfEmail")).toMatchObject({ reportable: false, target: "info" });
    expect(rows.filter((r) => r.target === "info").every((r) => !r.reportable)).toBe(true);
  });

  it("shows the levels of the lists", () => {
    expect(row("languages")).toMatchObject({ current: "Anglais", proposed: "Anglais (Courant)" });
  });

  it("does not offer a field the dossier leaves empty", () => {
    expect(row("street")).toMatchObject({ proposed: null, reportable: false, differs: false });
  });
});
