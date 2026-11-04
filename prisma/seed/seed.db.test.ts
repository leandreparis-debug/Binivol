import { beforeAll, describe, expect, it } from "vitest";
import { NIVOL_PATTERN } from "@/lib/nivol";
import { perimetersOf } from "@/server/perimeter";
import { getTestDb } from "@/test/db/testDatabase";
import { SEED_MARK, SEED_VOLUMES, countRows, seed, seedUserEmail, USERS } from "./index";
import { HYPOTHESIS_CODES, LEGACY_CODES, REFERENCE_ITEMS } from "./referenceData";

const db = getTestDb();
const today = new Date("2026-11-04T00:00:00.000Z");
let firstCounts: Record<string, number>;

beforeAll(async () => {
  await seed(db, { today });
  firstCounts = await countRows(db);
}, 180_000);

describe("seed", () => {
  it("is idempotent: a second run changes no count and no ref", async () => {
    const refsBefore = await db.person.findMany({
      select: { id: true, ref: true },
      orderBy: { id: "asc" },
    });
    await seed(db, { today });
    expect(await countRows(db)).toEqual(firstCounts);
    const refsAfter = await db.person.findMany({
      select: { id: true, ref: true },
      orderBy: { id: "asc" },
    });
    expect(refsAfter).toEqual(refsBefore);
  }, 180_000);

  it("creates the announced people", async () => {
    expect(firstCounts.persons).toBe(SEED_VOLUMES.persons);
    const byStatus = await db.person.groupBy({ by: ["status"], _count: true });
    expect(Object.fromEntries(byStatus.map((g) => [g.status, g._count]))).toEqual(
      SEED_VOLUMES.byStatus,
    );
    const refs = (await db.person.findMany({ select: { ref: true }, orderBy: { ref: "asc" } })).map(
      (p) => p.ref,
    );
    expect(refs[0]).toBe("P-00001");
    expect(refs.at(-1)).toBe("P-00060");
  });

  it("marks every person as synthetic", async () => {
    expect(await db.person.count({ where: { NOT: { notes: { contains: SEED_MARK } } } })).toBe(0);
    expect(
      await db.person.count({ where: { NOT: { email: { endsWith: "@exemple.test" } } } }),
    ).toBe(0);
  });

  it("uses fictitious NIVOL in the right format, starting with 000", async () => {
    const nivols = (
      await db.person.findMany({ where: { nivol: { not: null } }, select: { nivol: true } })
    ).map((p) => p.nivol ?? "");
    expect(nivols.length).toBeGreaterThan(40);
    expect(nivols.every((n) => NIVOL_PATTERN.test(n) && n.startsWith("000"))).toBe(true);
    expect(
      await db.person.count({ where: { status: "ACTIVE", nivol: null, legacyImport: true } }),
    ).toBe(1);
  });

  it("includes three minors with parental authorisation", async () => {
    const minors = await db.personSensitive.findMany({
      where: { birthDate: { gt: new Date(Date.UTC(2008, 10, 4)) } },
      select: { parentalAuthorization: true, parentalAuthorizationDate: true, birthDate: true },
    });
    expect(minors).toHaveLength(SEED_VOLUMES.minors);
    for (const m of minors) {
      const age = (today.getTime() - (m.birthDate?.getTime() ?? 0)) / (365.25 * 86_400_000);
      expect(age).toBeGreaterThanOrEqual(16);
      expect(age).toBeLessThan(18);
      expect(m.parentalAuthorization).toBe(true);
      expect(m.parentalAuthorizationDate).not.toBeNull();
    }
    expect(await db.document.count({ where: { kind: "PARENTAL_AUTH" } })).toBe(3);
  });

  it("covers every candidacy stage, with one abandoned", async () => {
    const candidacies = await db.candidacy.findMany({ where: { person: { status: "CANDIDATE" } } });
    expect(candidacies.map((c) => c.stage).sort()).toEqual([
      "ABANDONED",
      "CONFIRMED",
      "FILE",
      "FIRST_CONTACT",
      "GAIA",
      "MEETING",
    ]);
    expect(await db.candidacy.count({ where: { closedAt: null } })).toBe(5);
  });

  it("loads the exact legacy reference list, in its order, plus the 3 hypotheses", async () => {
    const items = await db.referenceItem.findMany({ orderBy: { sortOrder: "asc" } });
    expect(items).toHaveLength(SEED_VOLUMES.referenceItems);
    expect(items.slice(0, 21).map((i) => [i.sortOrder, i.code])).toEqual(
      LEGACY_CODES.map((code, k) => [k + 1, code]),
    );
    expect(items.slice(21).map((i) => i.code)).toEqual([...HYPOTHESIS_CODES]);
    for (const seedItem of REFERENCE_ITEMS) {
      const item = items.find((i) => i.code === seedItem.code);
      expect(item, seedItem.code).toMatchObject({
        label: seedItem.label,
        category: seedItem.category,
        kind: seedItem.kind,
        forbiddenForMinors: seedItem.forbiddenForMinors,
        expiresEndOfYear: seedItem.expiresEndOfYear,
        validityMonths: null,
        active: true,
      });
    }
    expect(await db.referenceItemPrerequisite.count()).toBe(0);
    expect(items.filter((i) => i.validityMonths !== null)).toEqual([]);
    expect(
      items
        .filter((i) => i.expiresEndOfYear)
        .map((i) => i.code)
        .sort(),
    ).toEqual(["FCCI", "FCPSE"]);
    const byCode = Object.fromEntries(items.map((i) => [i.code, i]));
    expect(byCode.PSE).toMatchObject({
      label: "Premiers secours en équipe",
      category: "FORMATION_IS",
    });
    expect(byCode.F_CH?.label).toBe("Formation chauffeur");
    expect(byCode.CRB?.label).toBe("Croix-Rouge Bienvenue (eCRB)");
    expect(byCode.OPR?.validityMonths).toBeNull();
    for (const code of HYPOTHESIS_CODES)
      expect(byCode[code]?.note).toBe("Hypothèse, absent de l'ancien classeur");
    expect(byCode.FCPSE?.note).toBe("Validité à renseigner");
    expect(byCode.FPSE?.note).toBe("Validité à renseigner");
    expect(byCode.FCCI?.note).toBe("Libellé à confirmer");
    expect(byCode.CH_TECH?.note).toMatch(/^Interprétation à valider/);
    expect(byCode.PSE?.perimeters.sort()).toEqual(["ACTION", "LASER"]);
    expect(byCode.PSC?.perimeters).toEqual(["ACTION"]);
    expect(byCode.TCAU?.perimeters).toEqual(["LASER"]);
  });

  it("delegates appointments per function (managedBy)", async () => {
    const items = await db.referenceItem.findMany();
    const managedBy = Object.fromEntries(
      items.filter((i) => i.managedBy.length > 0).map((i) => [i.code, [...i.managedBy].sort()]),
    );
    expect(managedBy).toEqual({
      CHEF_PAPS: ["ACTION"],
      CDPE: ["ACTION"],
      CI: ["LASER"],
      CI_SDIS: ["LASER"],
      CH_TECH: ["ACTION", "LASER"],
      CH_FIXE: ["ACTION", "LASER"],
      CH_MOBILE: ["ACTION", "LASER"],
      CH_RESEAUX: ["ACTION", "LASER"],
      ASSIST_FORM: ["FORMAT_GP"],
    });
    expect(items.filter((i) => i.kind === "TRAINING" && i.managedBy.length > 0)).toEqual([]);
  });

  it("flags three trainers and leaves the column unknown for most people", async () => {
    expect(await db.person.count({ where: { isTrainer: true } })).toBe(3);
    expect(await db.person.count({ where: { isTrainer: null } })).toBeGreaterThan(40);
  });

  it("creates the seven demo accounts", async () => {
    const users = await db.user.findMany({ include: { profiles: true } });
    expect(users.map((u) => u.email).sort()).toEqual(USERS.map((u) => seedUserEmail(u.key)).sort());
    const cumul = users.find((u) => u.email === seedUserEmail("format-diamant"));
    expect(cumul?.profiles.map((p) => p.profile).sort()).toEqual(["DIAMANT", "FORMAT"]);
  });

  it("has expired, soon-expiring and undated trainings", async () => {
    const soon = new Date(today.getTime() + 60 * 86_400_000);
    expect(await db.trainingRecord.count({ where: { expiresAt: { lt: today } } })).toBeGreaterThan(
      0,
    );
    expect(
      await db.trainingRecord.count({ where: { expiresAt: { gte: today, lte: soon } } }),
    ).toBeGreaterThan(0);
    expect(
      await db.trainingRecord.count({ where: { date: null, result: "PASSED" } }),
    ).toBeGreaterThan(0);
  });

  it("has wishes on a waiting list, one cancelled appointment and five mentorships", async () => {
    expect(await db.trainingWish.count({ where: { status: "WAITLISTED" } })).toBeGreaterThan(0);
    expect(await db.appointment.count({ where: { cancelledAt: { not: null } } })).toBe(1);
    expect(await db.mentorship.count()).toBe(SEED_VOLUMES.mentorships);
    expect(await db.followUp.count({ where: { doneAt: { not: null } } })).toBeGreaterThan(0);
    expect(await db.followUp.count({ where: { doneAt: null } })).toBeGreaterThan(0);
  });

  it("stores two dossier links (one expired), hashed only", async () => {
    const links = await db.dossierLink.findMany();
    expect(links).toHaveLength(SEED_VOLUMES.dossierLinks);
    expect(links.filter((l) => l.expiresAt < today)).toHaveLength(1);
    expect(links.every((l) => /^[0-9a-f]{64}$/.test(l.tokenHash))).toBe(true);
  });

  it("writes no file: documents point to absent seed keys", async () => {
    const documents = await db.document.findMany();
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.every((doc) => doc.storageKey.startsWith("seed/") && doc.fileMissing)).toBe(
      true,
    );
  });

  it("loads the legacy settings and the default reminder rules", async () => {
    const settings = Object.fromEntries((await db.setting.findMany()).map((s) => [s.key, s.value]));
    expect(settings).toEqual({
      ALERT_DAYS_BEFORE_EXPIRY: 60,
      RETENTION_YEARS_AFTER_LEAVE: 5,
      BACKUPS_TO_KEEP: 12,
      DATA_CLASSIFICATION: "C3 CONFIDENTIEL",
      GREETING_EMAILS_ENABLED: true,
      NEW_VOLUNTEER_MONTHS: 12,
    });
    expect(await db.reminderRule.count()).toBe(6);
  });

  it("gives perimeters to seeded volunteers", async () => {
    const withPse = await db.trainingRecord.findFirstOrThrow({
      where: { result: "PASSED", reference: { code: "PSE" }, person: { status: "ACTIVE" } },
      select: { personId: true },
    });
    expect([...(await perimetersOf(db, withPse.personId, today))]).toEqual(
      expect.arrayContaining(["ACTION", "LASER"]),
    );
  });
});
