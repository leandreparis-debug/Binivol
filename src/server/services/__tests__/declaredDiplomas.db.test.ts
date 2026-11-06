import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { loadActor } from "@/server/auth/loadActor";
import type { Actor } from "@/server/policy/types";
import { diplomaProposals, openDeclaredQualification } from "@/server/services/declaredDiplomas";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
let topaze: Actor;
let action: Actor;
let personId: string;

beforeAll(async () => {
  await seedDemo(db, { today: day });
  const load = async (key: string) => {
    const row = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, row.id);
    if (!actor) throw new Error(key);
    return actor;
  };
  topaze = await load("topaze");
  action = await load("action");
  const candidate = await db.person.findFirstOrThrow({
    where: { status: "CANDIDATE", trainingRecords: { none: {} } },
  });
  personId = candidate.id;
  await db.personDeclaredDiploma.createMany({
    data: [
      {
        personId,
        label: "PSE2 (Premiers secours en équipe de niveau 2)",
        code: "PSE2",
        year: 2022,
        issuer: "CIVIL_PROTECTION",
      },
      { personId, label: "BNSSA (sauveteur aquatique)", code: "BNSSA" },
      { personId, label: "BAFA" },
    ],
  });
}, 180_000);

describe("declared diplomas → « à vérifier dans Pegass »", () => {
  it("proposes only the diplomas the reference list knows (PSE2 → PSE)", async () => {
    const proposals = await diplomaProposals(db, topaze, personId);
    expect(
      proposals.map((p) => [p.label.slice(0, 4), p.reference.code, p.alreadyRecorded]),
    ).toEqual([["PSE2", "PSE", false]]);
  });

  it("opens a TO_CONFIRM record on demand, dated on the declared year, once", async () => {
    const [proposal] = await diplomaProposals(db, topaze, personId);
    if (!proposal) throw new Error("no proposal");
    await openDeclaredQualification(db, topaze, { diplomaId: proposal.diplomaId });
    const record = await db.trainingRecord.findFirstOrThrow({
      where: { personId, reference: { code: "PSE" } },
    });
    expect(record.result).toBe("TO_CONFIRM");
    expect(record.date?.toISOString().slice(0, 10)).toBe("2022-01-01");
    expect((await diplomaProposals(db, topaze, personId))[0]?.alreadyRecorded).toBe(true);
    await expect(
      openDeclaredQualification(db, topaze, { diplomaId: proposal.diplomaId }),
    ).rejects.toThrow("déjà");
  });

  it("refuses a profile without training rights on the person", async () => {
    const [proposal] = await diplomaProposals(db, topaze, personId);
    if (!proposal) throw new Error("no proposal");
    // ACTION does not see candidates.
    await expect(
      openDeclaredQualification(db, action, { diplomaId: proposal.diplomaId }),
    ).rejects.toThrow();
  });
});
