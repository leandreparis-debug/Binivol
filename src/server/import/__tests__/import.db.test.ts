import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { seedBase } from "../../../../prisma/seed/index";
import { personRepository } from "@/server/repositories/personRepository";
import { perimetersOf } from "@/server/perimeter";
import { runImport, SIMULATION_VALIDITY_MS, type ImportActor } from "@/server/import/service";
import type { ImportReport } from "@/server/import/report";
import { getTestDb, resetDatabase } from "@/test/db/testDatabase";

const db = getTestDb();
const FIXTURE = readFileSync("tests/fixtures/classeur-v03-fictif.xlsx");
const MODIFIED = readFileSync("tests/fixtures/classeur-v03-fictif-modifie.xlsx");
const MISSING_COLUMN = readFileSync("tests/fixtures/classeur-v03-sans-colonne.xlsx");
const NOW = new Date("2026-11-04T10:00:00.000Z");
const nivol = (i: number) =>
  `00099${String(i).padStart(6, "0")}${"ABCDEFGHJKLMNPRSTUVWXYZ"[i % 23] ?? "A"}`;

let topaze: ImportActor;

/** Business tables (import_runs excluded: it is the history of the runs). */
async function businessCounts() {
  const [persons, sensitive, candidacies, records, appointments, references, settings, audit] =
    await Promise.all([
      db.person.count(),
      db.personSensitive.count(),
      db.candidacy.count(),
      db.trainingRecord.count(),
      db.appointment.count(),
      db.referenceItem.count(),
      db.setting.count(),
      db.auditLog.count(),
    ]);
  return { persons, sensitive, candidacies, records, appointments, references, settings, audit };
}

async function simulate(buffer = FIXTURE, actor = topaze, now = NOW) {
  return runImport(db, { actor, fileName: "classeur.xlsx", buffer, dryRun: true, now });
}
async function importFor(buffer = FIXTURE, actor = topaze, now = NOW) {
  return runImport(db, { actor, fileName: "classeur.xlsx", buffer, dryRun: false, now });
}
async function simulateAndImport(buffer = FIXTURE, now = NOW) {
  const sim = await simulate(buffer, topaze, now);
  expect(sim.ok).toBe(true);
  const real = await importFor(buffer, topaze, now);
  expect(real.error).toBeNull();
  return real;
}
const issues = (report: ImportReport | null, level?: string) =>
  (report?.issues ?? []).filter((i) => (level ? i.level === level : true));

beforeEach(async () => {
  await resetDatabase(db);
  await seedBase(db);
  const user = await db.user.create({
    data: {
      email: "demo.topaze@binivol.test",
      name: "Alex Démo",
      profiles: { create: [{ profile: "TOPAZE" }] },
    },
  });
  topaze = { userId: user.id, label: user.name };
});

const EXPECTED_COUNTS = {
  Referentiel: { created: 0, updated: 0, unchanged: 21, conflicts: 0, rejected: 0, warnings: 1 },
  Parametres: { created: 0, updated: 1, unchanged: 4, conflicts: 0, rejected: 0, warnings: 6 },
  Benevoles: { created: 20, updated: 0, unchanged: 0, conflicts: 0, rejected: 2, warnings: 4 },
  Prospects: { created: 5, updated: 0, unchanged: 0, conflicts: 0, rejected: 0, warnings: 1 },
  Sessions: { created: 58, updated: 0, unchanged: 0, conflicts: 0, rejected: 3, warnings: 1 },
  Fonctions: { created: 15, updated: 0, unchanged: 0, conflicts: 0, rejected: 0, warnings: 2 },
  Journal: { created: 30, updated: 0, unchanged: 0, conflicts: 0, rejected: 0, warnings: 0 },
};

describe("simulation", () => {
  it("reports the exact counts and writes nothing", async () => {
    const before = await businessCounts();
    const outcome = await simulate();
    expect(outcome).toMatchObject({ ok: true, dryRun: true, blocking: false, error: null });
    expect(outcome.report?.counts).toEqual(EXPECTED_COUNTS);
    expect(outcome.report?.personCount).toBe(24);
    expect(await businessCounts()).toEqual(before);
    expect(await db.importRun.count({ where: { dryRun: true, status: "SUCCEEDED" } })).toBe(1);
  });

  it("produces the right outcome for each trap", async () => {
    const report = (await simulate()).report;
    const has = (level: string, key: string | null, pattern: RegExp) =>
      issues(report, level).some((i) => (key === null || i.key === key) && pattern.test(i.message));
    expect(has("warning", "Listes", /Onglet « Listes » non repris : listes de valeurs/)).toBe(true);
    expect(has("warning", nivol(11), /Téléphone illisible « à demander », gardé tel quel/)).toBe(
      true,
    );
    // Legacy labels « Formation IS », « Tronc commun », « Secours », « Formation », « Fonction »:
    // translated, so only the OPR label differs.
    expect(issues(report).filter((i) => i.sheet === "Referentiel")).toHaveLength(1);
    expect(has("warning", "Colonne perso", /Colonne inconnue/)).toBe(true);
    expect(has("warning", "OPR", /libellé « Opérateur radio \(OPR\) »/)).toBe(true);
    expect(has("warning", "EDITEURS", /comptes à créer depuis l'administration/)).toBe(true);
    expect(issues(report).some((i) => /editeur\.fictif|second\.editeur/.test(i.message))).toBe(
      false,
    );
    expect(issues(report, "warning").filter((i) => i.key === "DOSSIER_BENEVOLES_ID")).toHaveLength(
      2,
    );
    expect(has("rejected", "12345", /NIVOL invalide/)).toBe(true);
    expect(has("rejected", nivol(1), /NIVOL en double : déjà présent ligne 2/)).toBe(true);
    expect(has("warning", nivol(4), /Date illisible « bientôt »/)).toBe(true);
    expect(has("warning", nivol(5), /Parti\(e\) sans date de départ/)).toBe(true);
    expect(has("warning", "P-00004", /Étape inconnue « Rencontre prévue »/)).toBe(true);
    expect(has("rejected", "S-00059", /NIVOL inconnu/)).toBe(true);
    expect(has("rejected", "S-00060", /Code inconnu « XYZ »/)).toBe(true);
    expect(has("rejected", "S-00061", /est une fonction/)).toBe(true);
    expect(has("warning", "S-00038", /Date illisible « 32\/13\/2024 »/)).toBe(true);
    expect(has("warning", "F-00002", /format libre/)).toBe(true);
    expect(has("warning", "F-00014", /mineur à CHEF_PAPS/)).toBe(true);
    expect(issues(report).every((i) => typeof i.message === "string" && i.message.length > 0)).toBe(
      true,
    );
  });
});

describe("real import", () => {
  it("is refused without a simulation, with another file, by another account or after 30 minutes", async () => {
    await expect(importFor()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("simulation") as string,
    });
    await simulate();
    await expect(importFor(MODIFIED)).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("n'est pas celui de la dernière simulation") as string,
    });
    await expect(importFor(FIXTURE, { userId: null, label: "CLI" })).resolves.toMatchObject({
      ok: false,
    });
    const late = new Date(NOW.getTime() + SIMULATION_VALIDITY_MS + 60_000);
    await expect(importFor(FIXTURE, topaze, late)).resolves.toMatchObject({ ok: false });
    expect(await db.person.count()).toBe(0);
    expect(await db.importRun.count({ where: { dryRun: false, status: "FAILED" } })).toBe(4);
  });

  it("imports the fixture: people, prospects, trainings, appointments and journal", async () => {
    const outcome = await simulateAndImport();
    expect(outcome.report?.counts).toEqual(EXPECTED_COUNTS);
    expect(await db.person.count({ where: { legacyImport: true } })).toBe(24);
    expect(await db.trainingRecord.count({ where: { legacyRef: { not: null } } })).toBe(58);
    expect(await db.appointment.count({ where: { legacyRef: { not: null } } })).toBe(15);
    expect(await db.auditLog.count({ where: { legacyHash: { not: null } } })).toBe(30);

    // NIVOL with spaces and lower case was normalised.
    expect(await db.person.findUnique({ where: { nivol: nivol(2) } })).not.toBeNull();
    // Parti(e) without date: leftAt = « Modifié le ».
    expect(
      (await db.person.findUniqueOrThrow({ where: { nivol: nivol(5) } })).leftAt?.toISOString(),
    ).toBe("2024-06-30T00:00:00.000Z");
    // Empty yes/no: unknown.
    const six = await db.person.findUniqueOrThrow({ where: { nivol: nivol(6) } });
    expect([six.isMember, six.otherAasc]).toEqual([null, null]);
    // Linked prospect: no new person, candidacy closed as DONE on the volunteer.
    const linked = await db.candidacy.findUniqueOrThrow({
      where: { legacyRef: "P-00003" },
      include: { person: true },
    });
    expect(linked).toMatchObject({ stage: "DONE", person: { nivol: nivol(14) } });
    expect(linked.closedAt).not.toBeNull();
    expect(await db.person.count({ where: { status: "CANDIDATE", nivol: null } })).toBe(4);
    // Legacy ids are kept in legacyRef, never as ref.
    expect(linked.legacyRef).toBe("P-00003");
    const refs = (await db.person.findMany({ select: { ref: true } })).map((p) => p.ref);
    expect(refs).toHaveLength(24);
    expect(refs.every((r) => /^P-\d{5}$/.test(r))).toBe(true);
    expect(
      (await db.trainingRecord.findUniqueOrThrow({ where: { legacyRef: "S-00001" } })).ref,
    ).toMatch(/^S-\d{5}$/);
    // Cancellations.
    const f1 = await db.appointment.findUniqueOrThrow({ where: { legacyRef: "F-00001" } });
    expect(f1).toMatchObject({
      cancelledById: topaze.userId,
      cancelReason: "erreur de saisie (fictif)",
    });
    expect(f1.cancelledAt?.toISOString()).toBe("2025-05-11T22:00:00.000Z");
    const f2 = await db.appointment.findUniqueOrThrow({ where: { legacyRef: "F-00002" } });
    expect(f2).toMatchObject({ cancelledById: null, cancelReason: "annulée à la demande du DLUS" });
    // The minor's forbidden appointment is kept (history), with a warning only.
    expect(await db.appointment.findUnique({ where: { legacyRef: "F-00014" } })).not.toBeNull();
  });

  it("writes IMPORT audit entries labelled « Import », with sensitive values masked", async () => {
    await simulateAndImport();
    const entries = await db.auditLog.findMany({ where: { action: "IMPORT", legacyHash: null } });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.actorLabel === "Import" && e.actorId === topaze.userId)).toBe(
      true,
    );
    const sensitive = entries.filter((e) => e.entity === "PersonSensitive");
    expect(sensitive).toHaveLength(24);
    expect(JSON.stringify(sensitive)).not.toMatch(/19\d\d-\d\d-\d\d/);
    const journal = await db.auditLog.findMany({ where: { legacyHash: { not: null } } });
    const masked = journal.filter((j) =>
      ["Date de naissance", "Date vérif. B3", "Autorisation parentale"].includes(j.field ?? ""),
    );
    expect(masked).toHaveLength(3);
    expect(masked.every((j) => j.oldValue === "[sensible]" && j.newValue === "[sensible]")).toBe(
      true,
    );
    expect(journal.every((j) => j.action === "IMPORT" && j.legacyAction !== null)).toBe(true);
    // Numbers of the journal become readable text before masking and hashing.
    const phone = journal.find((j) => j.field === "Téléphone");
    expect(phone?.oldValue).toMatch(/^063998\d{4}$/);
    const entry = journal.find((j) => j.field === "Date d'entrée");
    expect(entry?.newValue).toBe("05/09/2020");
    expect(journal.find((j) => j.legacyAction === "Paramètre")).toMatchObject({
      entity: "Parametres",
      entityId: "DELAI_ALERTE_JOURS",
      newValue: "60",
    });
    // Every kind of key, a cell range as field, and system actions without entity.
    const keys = journal.map((j) => j.entityId ?? "");
    for (const pattern of [/^00099\d{6}[A-Z]$/, /^S-\d{5}$/, /^F-\d{5}$/, /^P-\d{5}$/, /^OPR$/]) {
      expect(keys.some((k) => pattern.test(k))).toBe(true);
    }
    expect(journal.some((j) => /^H\d+:J\d+$/.test(j.field ?? ""))).toBe(true);
    const system = journal.filter((j) => j.legacyAction === "Sauvegarde");
    expect(system.length).toBeGreaterThan(0);
    expect(system.every((j) => j.entity === null && j.entityId === null)).toBe(true);
  });

  it("is idempotent: the same file again is entirely unchanged, with no business write", async () => {
    await simulateAndImport();
    const before = await businessCounts();
    const again = await simulateAndImport();
    const counts = again.report?.counts;
    expect(
      Object.values(counts ?? {}).reduce((n, c) => n + c.created + c.updated + c.conflicts, 0),
    ).toBe(0);
    expect(counts?.Benevoles.unchanged).toBe(20);
    expect(counts?.Journal.unchanged).toBe(30);
    const after = await businessCounts();
    // Only the audit entry of the run itself is added.
    expect(after).toEqual({ ...before, audit: before.audit + 1 });
  });

  it("updates only the changed rows of a modified file", async () => {
    await simulateAndImport();
    const outcome = await simulateAndImport(MODIFIED);
    const c = outcome.report?.counts;
    expect([
      c?.Benevoles.updated,
      c?.Prospects.updated,
      c?.Sessions.updated,
      c?.Fonctions.updated,
      c?.Journal.created,
    ]).toEqual([1, 1, 1, 1, 2]);
    expect([c?.Benevoles.unchanged, c?.Sessions.unchanged, c?.Fonctions.unchanged]).toEqual([
      19, 57, 14,
    ]);
    expect((await db.person.findUniqueOrThrow({ where: { nivol: nivol(2) } })).phone).toBe(
      "0639980299",
    );
    expect(
      (await db.trainingRecord.findUniqueOrThrow({ where: { legacyRef: "S-00004" } })).result,
    ).toBe("PASSED");
    expect((await db.candidacy.findUniqueOrThrow({ where: { legacyRef: "P-00001" } })).stage).toBe(
      "FILE",
    );
  });

  it("never overwrites a row modified in Binivol since the last import (conflict)", async () => {
    await simulateAndImport();
    const person = await db.person.findUniqueOrThrow({ where: { nivol: nivol(3) } });
    await personRepository(db).update(
      person.id,
      { phone: "01 99 00 00 01" },
      { userId: topaze.userId, label: "Alex Démo" },
    );
    const outcome = await simulateAndImport();
    expect(outcome.report?.counts.Benevoles).toMatchObject({
      conflicts: 1,
      unchanged: 19,
      updated: 0,
    });
    expect(issues(outcome.report, "conflict")[0]).toMatchObject({
      key: nivol(3),
      message: expect.stringContaining("phone") as string,
    });
    expect((await db.person.findUniqueOrThrow({ where: { id: person.id } })).phone).toBe(
      "01 99 00 00 01",
    );
  });

  it("restores the leading 0 of numeric phones and normalises +33 texts", async () => {
    await simulateAndImport();
    const phone = async (i: number) =>
      (await db.person.findUniqueOrThrow({ where: { nivol: nivol(i) } })).phone;
    expect(await phone(1)).toBe("0639980100");
    expect(await phone(3)).toBe("0639980300");
    expect(await phone(11)).toBe("à demander");
    const prospect = await db.candidacy.findUniqueOrThrow({
      where: { legacyRef: "P-00001" },
      include: { person: { select: { phone: true } } },
    });
    expect(prospect.person.phone).toBe("0639989100");
  });

  it("imports appointments without a start date as active, and counts them in perimeters", async () => {
    // No function of the reference list brings a perimeter today: give one to CH_TECH
    // (perimeters are data) to check that an appointment without a start date counts.
    await db.referenceItem.update({ where: { code: "CH_TECH" }, data: { perimeters: ["ACTION"] } });
    await simulateAndImport();
    const withoutStart = await db.appointment.count({
      where: { legacyRef: { not: null }, startDate: null },
    });
    expect(withoutStart).toBe(14);
    // F-00004: CH_TECH, no start, no end, not cancelled → active: brings its perimeter.
    const f4 = await db.appointment.findUniqueOrThrow({
      where: { legacyRef: "F-00004" },
      include: { reference: true },
    });
    expect(f4).toMatchObject({ startDate: null, endDate: null, cancelledAt: null });
    expect(f4.reference.perimeters.length).toBeGreaterThan(0);
    const perimeters = await perimetersOf(db, f4.personId, new Date("2026-11-04T00:00:00.000Z"));
    for (const p of f4.reference.perimeters) expect(perimeters.has(p)).toBe(true);
    // F-00015 ended on 31/12/2024: no longer active.
    const f15 = await db.appointment.findUniqueOrThrow({ where: { legacyRef: "F-00015" } });
    expect(f15.endDate?.toISOString()).toBe("2024-12-31T00:00:00.000Z");
  });

  it("gives the right perimeters to imported people (PSE, TCAU, trainer)", async () => {
    await simulateAndImport();
    const day = new Date("2026-11-04T00:00:00.000Z");
    const of = async (i: number) => {
      const p = await db.person.findUniqueOrThrow({ where: { nivol: nivol(i) } });
      return [...(await perimetersOf(db, p.id, day))].sort();
    };
    // Person 1: PSE validated → ACTION and LASER.
    expect(await of(1)).toEqual(expect.arrayContaining(["ACTION", "LASER"]));
    // Person 3: TCAU validated → LASER.
    expect(await of(3)).toContain("LASER");
    // Person 10: « Formateur » OUI → FORMAT_GP.
    expect(await of(10)).toContain("FORMAT_GP");
  });
});

describe("blocking errors and failures", () => {
  it("a missing mandatory column is blocking: reported, nothing written, import refused", async () => {
    const before = await businessCounts();
    const sim = await simulate(MISSING_COLUMN);
    expect(sim).toMatchObject({ ok: true, blocking: true });
    expect(issues(sim.report, "blocking")).toEqual([
      expect.objectContaining({
        sheet: "Benevoles",
        message: "Colonne obligatoire « Statut » manquante dans l'onglet « Benevoles ».",
      }),
    ]);
    await expect(importFor(MISSING_COLUMN)).resolves.toMatchObject({ ok: false, blocking: true });
    expect(await businessCounts()).toEqual(before);
  });

  it("a missing sheet is blocking and named", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(FIXTURE as unknown as ArrayBuffer);
    const journal = wb.getWorksheet("Journal");
    if (journal) wb.removeWorksheet(journal.id);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const sim = await simulate(buffer);
    expect(issues(sim.report, "blocking").map((i) => i.message)).toEqual([
      "Onglet « Journal » manquant.",
    ]);
  });

  it.each([
    ["not an xlsx", Buffer.from("NIVOL;Nom"), "n'est pas un classeur"],
    [
      "password-protected",
      Buffer.concat([
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        Buffer.alloc(32),
      ]),
      "mot de passe",
    ],
    ["too large", Buffer.alloc(5 * 1024 * 1024 + 1), "5 Mo"],
  ])(
    "refuses a file that is %s, with a clear message, writing nothing",
    async (_label, buffer, message) => {
      const before = await businessCounts();
      const outcome = await simulate(buffer);
      expect(outcome).toMatchObject({
        ok: false,
        report: null,
        error: expect.stringContaining(message) as string,
      });
      expect(await businessCounts()).toEqual(before);
    },
  );

  it("an error in the middle rolls everything back and marks the run as failed", async () => {
    await simulate();
    const before = await businessCounts();
    const outcome = await runImport(db, {
      actor: topaze,
      fileName: "classeur.xlsx",
      buffer: FIXTURE,
      dryRun: false,
      now: NOW,
      afterSheet: (sheet) => {
        if (sheet === "Sessions") throw new Error("panne provoquée");
      },
    });
    expect(outcome).toMatchObject({
      ok: false,
      error: expect.stringContaining("rien n'a été écrit") as string,
    });
    expect(await businessCounts()).toEqual(before);
    const run = await db.importRun.findUniqueOrThrow({ where: { id: outcome.runId } });
    expect(run).toMatchObject({
      status: "FAILED",
      error: expect.stringContaining("panne provoquée") as string,
    });
  });

  it("refuses a second import running at the same time (advisory lock)", async () => {
    await simulate();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = runImport(db, {
      actor: topaze,
      fileName: "classeur.xlsx",
      buffer: FIXTURE,
      dryRun: false,
      now: NOW,
      afterSheet: async (sheet) => {
        if (sheet === "Referentiel") await held;
      },
    });
    // Let the first import take the lock, then start the second one.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const second = await importFor();
    release();
    expect(second).toMatchObject({
      ok: false,
      error: "Un autre import est déjà en cours. Réessayez dans quelques minutes.",
    });
    expect((await first).ok).toBe(true);
  });
});

describe("maintenance commands", () => {
  it("db:fresh refuses a remote host without touching anything", () => {
    const env = {
      ...process.env,
      DATABASE_URL: "postgresql://u:p@binivol.exemple.org:5432/binivol",
    };
    expect(() =>
      execFileSync("pnpm", ["--silent", "db:fresh"], { env, encoding: "utf8", stdio: "pipe" }),
    ).toThrow(/refuse l'hôte « binivol\.exemple\.org »/);
  });
});
