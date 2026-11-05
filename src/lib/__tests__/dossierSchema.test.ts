import { describe, expect, it } from "vitest";
import {
  dossierAge,
  dossierDraftSchema,
  DOSSIER_SCHEMA_VERSION,
  migrateDossierData,
  normalizeSubmission,
  submissionIssues,
  visibleSteps,
  type DossierDraft,
} from "@/lib/dossierSchema";

const day = new Date("2026-11-05T00:00:00.000Z");

/** A complete adult dossier (fictitious). */
function complete(overrides: Partial<DossierDraft> = {}): DossierDraft {
  return {
    identity: {
      civility: "MME",
      lastName: "Exemple",
      firstName: "Camille",
      birthDate: "1995-04-12",
      birthCity: "Versailles",
      birthDepartment: "78",
      birthCountry: "France",
    },
    contact: {
      street: "1 rue des Exemples",
      postalCode: "78000",
      city: "Versailles",
      country: "France",
      phone: "06 39 98 00 01",
      email: "camille.exemple@exemple.test",
    },
    crf: { alreadyVolunteer: false, hasNivol: false, hasCrfEmail: false },
    emergency: {
      lastName: "Exemple",
      firstName: "Dominique",
      relationship: "Sœur",
      phone1: "0639980002",
    },
    consent: { rgpd: true },
    ...overrides,
  };
}

const fields = (draft: DossierDraft, kinds: string[] = []) =>
  submissionIssues(draft, { day, attachmentKinds: kinds }).map((i) => `${i.section}.${i.field}`);

describe("dossier draft schema", () => {
  it("accepts an empty or partial draft", () => {
    expect(dossierDraftSchema.safeParse({}).success).toBe(true);
    expect(dossierDraftSchema.safeParse({ identity: { firstName: "Camille" } }).success).toBe(true);
  });

  it("checks lengths and list limits only", () => {
    expect(dossierDraftSchema.safeParse({ identity: { lastName: "x".repeat(51) } }).success).toBe(
      false,
    );
    expect(
      dossierDraftSchema.safeParse({
        profile: { skills: Array.from({ length: 5 }, () => ({ label: "Informatique" })) },
      }).success,
    ).toBe(false);
    expect(dossierDraftSchema.safeParse({ profile: { languages: [{ label: "A" }] } }).success).toBe(
      true,
    );
    expect(
      dossierDraftSchema.safeParse({ profile: { diplomas: ["a", "b", "c", "d", "e", "f"] } })
        .success,
    ).toBe(false);
    expect(
      dossierDraftSchema.safeParse({ profile: { licenses: ["A", "B", "C", "D", "BE"] } }).success,
    ).toBe(false);
  });
});

describe("submission rules", () => {
  it("accepts a complete adult dossier", () => {
    expect(fields(complete())).toEqual([]);
  });

  it("lists every missing required field, with its step", () => {
    const issues = submissionIssues({}, { day, attachmentKinds: [] });
    expect(issues.map((i) => i.step)).toContain("identite");
    expect(issues.map((i) => i.step)).toContain("coordonnees");
    expect(issues.map((i) => i.step)).toContain("urgence");
    expect(issues.find((i) => i.field === "rgpd")?.step).toBe("relecture");
  });

  it("refuses a birth date in the future or giving more than 100 years", () => {
    const at = (birthDate: string) =>
      fields(complete({ identity: { ...complete().identity, birthDate } }));
    expect(at("2027-01-01")).toContain("identity.birthDate");
    expect(at("1920-01-01")).toContain("identity.birthDate");
    expect(at("2026-02-30")).toContain("identity.birthDate");
  });

  it("checks phone, e-mail and French postal code formats", () => {
    const c = complete().contact;
    expect(fields(complete({ contact: { ...c, phone: "12" } }))).toContain("contact.phone");
    expect(fields(complete({ contact: { ...c, email: "pas-un-mail" } }))).toContain(
      "contact.email",
    );
    expect(fields(complete({ contact: { ...c, postalCode: "7800" } }))).toContain(
      "contact.postalCode",
    );
    expect(
      fields(complete({ contact: { ...c, postalCode: "1000", country: "Belgique" } })),
    ).toEqual([]);
  });

  it("requires the birth department only for a birth in France", () => {
    const id = complete().identity;
    expect(fields(complete({ identity: { ...id, birthDepartment: "" } }))).toContain(
      "identity.birthDepartment",
    );
    expect(
      fields(complete({ identity: { ...id, birthDepartment: "", birthCountry: "Maroc" } })),
    ).toEqual([]);
  });

  it("checks the declared NIVOL and the CRF e-mail", () => {
    expect(
      fields(
        complete({
          crf: { alreadyVolunteer: true, hasNivol: true, nivol: "123", hasCrfEmail: false },
        }),
      ),
    ).toContain("crf.nivol");
    expect(
      fields(
        complete({
          crf: {
            alreadyVolunteer: true,
            hasNivol: true,
            nivol: "000 1234 5678 a",
            hasCrfEmail: false,
          },
        }),
      ),
    ).toEqual([]);
    expect(
      fields(
        complete({
          crf: {
            alreadyVolunteer: true,
            hasNivol: false,
            hasCrfEmail: true,
            crfEmail: "a@gmail.com",
          },
        }),
      ),
    ).toContain("crf.crfEmail");
  });

  it("requires a level for each skill and language", () => {
    expect(
      fields(
        complete({
          profile: { skills: [{ label: "Informatique" }], languages: [{ label: "Anglais" }] },
        }),
      ),
    ).toEqual(["profile.skills.0.level", "profile.languages.0.level"]);
  });

  it("asks a legal guardian under 18, and the parental authorisation under 16", () => {
    const id = complete().identity;
    const seventeen = complete({ identity: { ...id, birthDate: "2009-06-01" } });
    expect(fields(seventeen)).toEqual([
      "guardian.lastName",
      "guardian.firstName",
      "guardian.quality",
      "guardian.phone",
      "guardian.email",
    ]);
    const guardian = {
      lastName: "Exemple",
      firstName: "Dominique",
      quality: "Mère",
      phone: "0639980003",
      email: "dominique.exemple@exemple.test",
    };
    const fifteen = complete({ identity: { ...id, birthDate: "2011-09-01" }, guardian });
    expect(fields(fifteen)).toEqual(["attachments.PARENTAL_AUTH"]);
    expect(fields(fifteen, ["PARENTAL_AUTH"])).toEqual([]);
  });
});

describe("age and steps", () => {
  it("computes the age on the submission day", () => {
    expect(dossierAge({ identity: { birthDate: "2008-11-05" } }, day)).toBe(18);
    expect(dossierAge({ identity: { birthDate: "2008-11-06" } }, day)).toBe(17);
    expect(dossierAge({}, day)).toBeNull();
  });

  it("shows the « Représentant légal » step to minors only", () => {
    expect(visibleSteps({}, day)).not.toContain("representant");
    expect(visibleSteps({ identity: { birthDate: "2011-01-01" } }, day)).toContain("representant");
  });
});

describe("schema versions", () => {
  it("maps a version 0 draft (flat fields) and warns about the rest", () => {
    const { data, warnings } = migrateDossierData(
      { firstName: "Camille", lastName: "Exemple", email: "c@exemple.test", etape: 2 },
      0,
    );
    expect(data.identity).toEqual({ firstName: "Camille", lastName: "Exemple" });
    expect(data.contact?.email).toBe("c@exemple.test");
    expect(warnings).toHaveLength(1);
  });

  it("version 1 → 2: a guardian without e-mail is kept, with a warning", () => {
    const { data, warnings } = migrateDossierData(
      { guardian: { lastName: "Exemple", firstName: "Dominique", quality: "Mère" } },
      1,
    );
    expect(data.guardian?.lastName).toBe("Exemple");
    expect(warnings).toEqual(["Version 1 : l'e-mail du représentant légal est à compléter."]);
    expect(migrateDossierData({ guardian: { email: "a@exemple.test" } }, 2).warnings).toEqual([]);
  });

  it("refuses the candidate's own e-mail as the guardian's", () => {
    const id = complete().identity;
    const g = {
      lastName: "Exemple",
      firstName: "Dominique",
      quality: "Mère",
      phone: "0639980003",
      email: "CAMILLE.exemple@exemple.test",
    };
    expect(fields(complete({ identity: { ...id, birthDate: "2009-06-01" }, guardian: g }))).toEqual(
      ["guardian.email"],
    );
  });

  it("drops an unreadable section instead of breaking the form", () => {
    const { data, warnings } = migrateDossierData(
      { identity: { firstName: 42 }, contact: { city: "Versailles" }, inconnu: true },
      DOSSIER_SCHEMA_VERSION,
    );
    expect(data.identity).toBeUndefined();
    expect(data.contact?.city).toBe("Versailles");
    expect(warnings).toHaveLength(2);
  });

  it("reads garbage as an empty draft", () => {
    expect(migrateDossierData(null, 1).data).toEqual({});
    expect(migrateDossierData([1, 2], 1).data).toEqual({});
  });
});

describe("normalisation at submission", () => {
  it("normalises phones, e-mails, NIVOL and licences", () => {
    const n = normalizeSubmission(
      complete({
        contact: { ...complete().contact, email: " Camille.Exemple@Exemple.TEST " },
        crf: { hasNivol: true, nivol: "000 1234 5678 a" },
        profile: { licenses: ["b"] },
      }),
    );
    expect(n.contact?.phone).toBe("0639980001");
    expect(n.contact?.email).toBe("camille.exemple@exemple.test");
    expect(n.crf?.nivol).toBe("00012345678A");
    expect(n.profile?.licenses).toEqual(["B"]);
  });
});

describe("attachment kinds", () => {
  it("never accepts a diploma copy (ADR-049)", async () => {
    const { DOSSIER_ATTACHMENT_KINDS, RETIRED_DOCUMENT_KINDS } = await import("@/lib/dossierForms");
    expect(DOSSIER_ATTACHMENT_KINDS).toEqual(["PARENTAL_AUTH", "ADHESION"]);
    expect(RETIRED_DOCUMENT_KINDS).toEqual(["DIPLOMA_COPY"]);
  });
});
