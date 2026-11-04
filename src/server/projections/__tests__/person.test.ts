// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Perimeter, Profile } from "@/generated/prisma/enums";
import type { PersonFacts } from "@/server/policy/types";
import {
  DIRECTORY_FIELDS,
  FULL_FIELDS,
  projectPerson,
  toDirectoryView,
  toFullView,
  type PersonRow,
} from "@/server/projections/person";

const row = {
  ...Object.fromEntries(FULL_FIELDS.map((f) => [f, null])),
  id: "p1",
  ref: "P-00001",
  firstName: "Camille",
  lastName: "Démo",
  status: "ACTIVE",
  notes: "Donnée fictive",
  isMember: true,
  otherAasc: false,
  regularMinorSupervisor: false,
} as unknown as PersonRow;

const facts = (over: Partial<PersonFacts> = {}): PersonFacts => ({
  personId: "p1",
  status: "ACTIVE",
  perimeters: new Set<Perimeter>(),
  inDiamantScope: false,
  archived: false,
  ...over,
});
const actor = (...profiles: Profile[]) => ({ profiles: new Set(profiles) });
const SENSITIVE = [
  "birthDate",
  "street",
  "postalCode",
  "city",
  "b3Status",
  "emergencyContacts",
  "sensitive",
];

describe("person projections", () => {
  it("the directory view has exactly the directory fields", () => {
    expect(Object.keys(toDirectoryView(row)).sort()).toEqual([...DIRECTORY_FIELDS, "view"].sort());
  });

  it("the full view has the full fields and no sensitive one", () => {
    const keys = Object.keys(toFullView(row));
    expect(keys.sort()).toEqual([...FULL_FIELDS, "view"].sort());
    for (const field of SENSITIVE) expect(keys).not.toContain(field);
  });

  it("drops extra fields present on the row", () => {
    const leaky = { ...row, birthDate: new Date(), street: "1 rue Fictive" } as PersonRow;
    expect(Object.keys(toFullView(leaky))).not.toContain("birthDate");
    expect(Object.keys(toDirectoryView(leaky))).not.toContain("street");
  });

  it("gives each actor the widest view allowed, and nothing more", () => {
    expect(projectPerson(actor("TOPAZE"), facts(), row)?.view).toBe("full");
    expect(projectPerson(actor("FORMAT"), facts(), row)?.view).toBe("directory");
    expect(
      projectPerson(actor("ACTION"), facts({ perimeters: new Set<Perimeter>(["ACTION"]) }), row)
        ?.view,
    ).toBe("full");
    expect(projectPerson(actor("ACTION"), facts(), row)?.view).toBe("directory");
    expect(
      projectPerson(actor("ACTION"), facts({ status: "CANDIDATE", inDiamantScope: true }), row),
    ).toBeNull();
    expect(
      projectPerson(actor("DIAMANT"), facts({ archived: true, inDiamantScope: true }), row),
    ).toBeNull();
  });

  it("a directory view never carries notes or entry date", () => {
    const view = projectPerson(actor("LASER"), facts(), row);
    expect(view && "notes" in view).toBe(false);
  });
});
