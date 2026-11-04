import { beforeAll, describe, expect, it } from "vitest";
import { personRepository } from "@/server/repositories/personRepository";
import { referenceRepository } from "@/server/repositories/referenceRepository";
import { makePerson, makeReference } from "@/test/db/factories";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const repo = personRepository(db);
const names = (items: { firstName: string; lastName: string }[]) =>
  items.map((p) => `${p.firstName} ${p.lastName}`);

beforeAll(async () => {
  await makePerson(db, {
    firstName: "Élodie",
    lastName: "Lefèvre",
    status: "ACTIVE",
    nivol: "00012345678A",
  });
  await makePerson(db, {
    firstName: "Jérôme",
    lastName: "Dupont",
    status: "ACTIVE",
    nivol: "00087654321B",
  });
  await makePerson(db, { firstName: "Lætitia", lastName: "Cœur", status: "CANDIDATE" });
  await makePerson(db, {
    firstName: "Jean-Pierre",
    lastName: "Durand",
    status: "LEFT",
    leftAt: new Date("2025-06-30"),
  });
  await makePerson(db, { firstName: "Ancien", lastName: "Archivé", archivedAt: new Date() });
  for (let i = 0; i < 25; i += 1) {
    await makePerson(db, {
      firstName: `Page${String(i).padStart(2, "0")}`,
      lastName: "Zpagination",
      status: "INACTIVE",
    });
  }
});

describe("personRepository.search", () => {
  it("ignores accents and case on last and first names", async () => {
    expect(names((await repo.search({ q: "lefevre" })).items)).toEqual(["Élodie Lefèvre"]);
    expect(names((await repo.search({ q: "ELODIE" })).items)).toEqual(["Élodie Lefèvre"]);
    expect(names((await repo.search({ q: "jerome" })).items)).toEqual(["Jérôme Dupont"]);
    expect(names((await repo.search({ q: "laetitia coeur" })).items)).toEqual(["Lætitia Cœur"]);
  });

  it("matches every word, in any order", async () => {
    expect(names((await repo.search({ q: "dupont jérôme" })).items)).toEqual(["Jérôme Dupont"]);
    expect((await repo.search({ q: "dupont elodie" })).items).toEqual([]);
  });

  it("finds a person by full or partial NIVOL, case-insensitive", async () => {
    expect(names((await repo.search({ q: "00012345678a" })).items)).toEqual(["Élodie Lefèvre"]);
    expect(names((await repo.search({ q: "87654321" })).items)).toEqual(["Jérôme Dupont"]);
  });

  it("filters by status and hides archived people by default", async () => {
    expect(names((await repo.search({ status: "LEFT" })).items)).toEqual(["Jean-Pierre Durand"]);
    expect(names((await repo.search({ status: ["ACTIVE", "CANDIDATE"] })).items)).toEqual([
      "Lætitia Cœur",
      "Jérôme Dupont",
      "Élodie Lefèvre",
    ]);
    expect((await repo.search({ q: "archive" })).items).toEqual([]);
    expect(names((await repo.search({ q: "archive", includeArchived: true })).items)).toEqual([
      "Ancien Archivé",
    ]);
  });

  it("treats LIKE wildcards literally", async () => {
    expect((await repo.search({ q: "%" })).items).toEqual([]);
    expect((await repo.search({ q: "_" })).items).toEqual([]);
  });

  it("paginates with a cursor, without duplicates or gaps", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    const sizes: number[] = [];
    do {
      const page: Awaited<ReturnType<typeof repo.search>> = await repo.search({
        q: "zpagination",
        take: 10,
        cursor,
      });
      sizes.push(page.items.length);
      seen.push(...page.items.map((p) => p.firstName));
      cursor = page.nextCursor;
    } while (cursor);
    expect(sizes).toEqual([10, 10, 5]);
    expect(seen).toEqual(Array.from({ length: 25 }, (_, i) => `Page${String(i).padStart(2, "0")}`));
  });

  it("caps the page size", async () => {
    expect((await repo.search({ take: 1000 })).items.length).toBeLessThanOrEqual(100);
    expect((await repo.search({ take: 0 })).items).toHaveLength(1);
  });

  it("never returns sensitive fields", async () => {
    const [first] = (await repo.search({ q: "lefevre" })).items;
    expect(Object.keys(first ?? {}).sort()).toEqual(
      [
        "archivedAt",
        "civility",
        "entryDate",
        "firstName",
        "id",
        "lastName",
        "nivol",
        "ref",
        "status",
        "usageName",
      ].sort(),
    );
  });
});

describe("personRepository.findByRef", () => {
  it("finds a person by readable number, case-insensitive", async () => {
    const created = await makePerson(db, { firstName: "Référence", lastName: "Lisible" });
    expect((await repo.findByRef(created.ref.toLowerCase()))?.id).toBe(created.id);
    expect(await repo.findByRef("P-99999")).toBeNull();
    expect(await repo.findByRef("  ")).toBeNull();
  });
});

describe("referenceRepository.list", () => {
  it("filters by kind and activity, in display order", async () => {
    await makeReference(db, { code: "ZZ_FN", kind: "FUNCTION", sortOrder: 2 });
    await makeReference(db, { code: "AA_FN", kind: "FUNCTION", sortOrder: 1 });
    await makeReference(db, { code: "OLD_FN", kind: "FUNCTION", sortOrder: 0, active: false });
    const repoRef = referenceRepository(db);
    expect((await repoRef.list({ kind: "FUNCTION" })).map((r) => r.code)).toEqual([
      "AA_FN",
      "ZZ_FN",
    ]);
    expect((await repoRef.list({ kind: "FUNCTION", active: null })).map((r) => r.code)).toEqual([
      "OLD_FN",
      "AA_FN",
      "ZZ_FN",
    ]);
    expect((await repoRef.list({ kind: "FUNCTION", active: false })).map((r) => r.code)).toEqual([
      "OLD_FN",
    ]);
    expect((await repoRef.findByCode("aa_fn"))?.code).toBe("AA_FN");
  });
});
