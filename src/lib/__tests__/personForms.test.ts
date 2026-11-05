import { describe, expect, it } from "vitest";
import {
  identitySchema,
  nivolCorrectionSchema,
  personListItemSchema,
  statusChangeSchema,
} from "../personForms";

const base = { personId: "p1", firstName: "Camille", lastName: "Fictif" };
const fieldErrors = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  (result.error?.issues ?? []).map((i) => i.path.join("."));

describe("identitySchema", () => {
  it("normalises phones and e-mails, empty → null", () => {
    expect(
      identitySchema.parse({
        ...base,
        phone: "06.12.34.56.78",
        proPhone: "",
        email: " A.B@Exemple.TEST ",
        usageName: "  ",
        civility: "",
      }),
    ).toMatchObject({
      phone: "0612345678",
      proPhone: null,
      email: "a.b@exemple.test",
      usageName: null,
      civility: null,
    });
  });

  it("keeps a foreign number written with +", () => {
    expect(identitySchema.parse({ ...base, phone: "+44 20 7946 0958" }).phone).toBe(
      "+442079460958",
    );
  });

  it("gives field-by-field errors", () => {
    const result = identitySchema.safeParse({
      personId: "p1",
      firstName: " ",
      lastName: "",
      phone: "abc",
      email: "x@",
    });
    expect(fieldErrors(result).sort()).toEqual(["email", "firstName", "lastName", "phone"]);
  });
});

describe("statusChangeSchema", () => {
  it("requires date and reason for a departure only", () => {
    expect(statusChangeSchema.safeParse({ personId: "p1", status: "PAUSED" }).success).toBe(true);
    expect(fieldErrors(statusChangeSchema.safeParse({ personId: "p1", status: "LEFT" }))).toEqual([
      "leftAt",
      "leftReason",
    ]);
    expect(
      fieldErrors(
        statusChangeSchema.safeParse({
          personId: "p1",
          status: "LEFT",
          leftAt: "2026-02-30",
          leftReason: "MOVED",
        }),
      ),
    ).toEqual(["leftAt"]);
    const ok = statusChangeSchema.parse({
      personId: "p1",
      status: "LEFT",
      leftAt: "2026-10-31",
      leftReason: "MOVED",
    });
    expect(ok.leftAt?.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("does not offer CANDIDATE", () => {
    expect(statusChangeSchema.safeParse({ personId: "p1", status: "CANDIDATE" }).success).toBe(
      false,
    );
  });
});

describe("nivolCorrectionSchema and personListItemSchema", () => {
  it("normalises the NIVOL and requires a reason", () => {
    expect(
      nivolCorrectionSchema.parse({ personId: "p1", nivol: "000 1234 5678 a", reason: "Erreur" })
        .nivol,
    ).toBe("00012345678A");
    expect(
      fieldErrors(
        nivolCorrectionSchema.safeParse({ personId: "p1", nivol: "123", reason: "" }),
      ).sort(),
    ).toEqual(["nivol", "reason"]);
  });

  it("validates each kind of list item", () => {
    expect(
      personListItemSchema.parse({ list: "annex", personId: "p1", code: "vpsp chauffeur" }),
    ).toMatchObject({
      code: "VPSP_CHAUFFEUR",
      validUntil: null,
    });
    expect(
      personListItemSchema.safeParse({ list: "skill", personId: "p1", label: "X", level: "GURU" })
        .success,
    ).toBe(false);
    expect(
      personListItemSchema.parse({ list: "license", personId: "p1", category: "be" }),
    ).toMatchObject({
      category: "BE",
    });
  });
});
