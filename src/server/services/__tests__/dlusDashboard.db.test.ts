import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail, USERS } from "../../../../prisma/seed/index";
import { DEFAULT_INDICATORS } from "@/lib/indicators";
import { loadActor } from "@/server/auth/loadActor";
import { can, ForbiddenError } from "@/server/policy/can";
import { loadPersonFactsMany } from "@/server/policy/facts";
import type { Actor } from "@/server/policy/types";
import { directoryQuerySchema, listDirectory } from "@/server/services/directory";
import { dlusDashboard, previewIndicators } from "@/server/services/dlusDashboard";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};
const who = (key: string): Actor => {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
};

/** Every id of the directory filtered on an indicator (all pages). */
async function directoryIds(actor: Actor, key: string): Promise<{ ids: string[]; total: number }> {
  const query = directoryQuerySchema.parse({ indicateur: key });
  const page = await listDirectory(db, actor, query, { day, pageSize: 500 });
  return { ids: page.rows.map((r) => r.id), total: page.total };
}

const personOf = async (recordId: string) =>
  (await db.trainingRecord.findUniqueOrThrow({ where: { id: recordId } })).personId;

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const user of USERS) {
    const row = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(user.key) } });
    const actor = await loadActor(db, row.id);
    if (!actor) throw new Error(user.key);
    actors[user.key] = actor;
  }
}, 180_000);

describe("DLUS dashboard: operational strength", () => {
  it("every default indicator is non-zero on the demo seed, and equals the directory filter", async () => {
    const dash = await dlusDashboard(db, who("topaze"), { day });
    expect(dash.indicators.map((i) => i.key)).toEqual(DEFAULT_INDICATORS.map((i) => i.key));
    for (const ind of dash.indicators) {
      expect(ind.value, ind.key).toBeGreaterThan(0);
      const listed = await directoryIds(who("topaze"), ind.key);
      expect(listed.total, ind.key).toBe(ind.value);
      expect(listed.ids.length, ind.key).toBe(ind.value);
      expect(ind.href).toBe(`/benevoles?indicateur=${ind.key}`);
    }
  });

  it("edge cases: TCAU + expired PSE is a bénur; GQS + IPS counted once; valid PSE registered to PSE is a trainee", async () => {
    const benurs = (await directoryIds(who("topaze"), "BENURS")).ids;
    expect(benurs).toContain(await personOf("seed_tr_dash_b1_tcau"));
    const initiators = (await directoryIds(who("topaze"), "INITIATEURS_GQS_IPS")).ids;
    const both = await personOf("seed_tr_dash_gqs");
    expect(initiators.filter((id) => id === both)).toHaveLength(1);
    expect(new Set(initiators).size).toBe(initiators.length);
    const trainees = (await directoryIds(who("topaze"), "STAGIAIRES_SECOURS")).ids;
    const pseTrainee = await personOf("seed_tr_dash_pse_reg");
    expect(trainees).toContain(pseTrainee);
    // ... who also counts as a « secouriste » (her PSE is valid).
    expect((await directoryIds(who("topaze"), "SECOURISTES")).ids).toContain(pseTrainee);
    const dash = await dlusDashboard(db, who("topaze"), { day });
    expect(dash.indicators.find((i) => i.key === "SECOURISTES")?.expiring).toBeGreaterThan(0);
  });

  it("invariant under visibleSql: a profile counts exactly the people it may see", async () => {
    const all = await directoryIds(who("topaze"), "SECOURISTES");
    const facts = await loadPersonFactsMany(db, all.ids, day);
    const action = who("action");
    const expected = all.ids.filter((id) => {
      const f = facts.get(id);
      return f !== undefined && can(action, "person.directory.read", { person: f }).allowed;
    });
    const [preview] = await previewIndicators(
      db,
      { ...action, profiles: new Set([...action.profiles, "TOPAZE"]) },
      DEFAULT_INDICATORS.slice(0, 1),
      day,
    );
    expect(preview?.value).toBe(all.total);
    expect((await directoryIds(action, "SECOURISTES")).total).toBe(expected.length);
  });

  it("a modified setting is taken into account (preview, then saved)", async () => {
    const custom = [
      {
        key: "TRONC",
        label: "Tronc commun urgence",
        kind: "valid",
        required: ["TCAU"],
        excluded: [],
      },
    ];
    const [preview] = await previewIndicators(db, who("topaze"), custom as never, day);
    await db.setting.upsert({
      where: { key: "DASHBOARD_INDICATORS" },
      update: { value: custom },
      create: { key: "DASHBOARD_INDICATORS", value: custom },
    });
    const dash = await dlusDashboard(db, who("topaze"), { day });
    expect(dash.indicators.map((i) => [i.key, i.value])).toEqual([["TRONC", preview?.value]]);
    expect((await directoryIds(who("topaze"), "TRONC")).total).toBe(preview?.value);
    await db.setting.update({
      where: { key: "DASHBOARD_INDICATORS" },
      data: { value: DEFAULT_INDICATORS as never },
    });
  });

  it("is reserved to TOPAZE", async () => {
    await expect(dlusDashboard(db, who("diamant"), { day })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("DLUS dashboard: enrolments and arrivals", () => {
  it("lists the 10 latest enrolments, newest first, without sensitive data", async () => {
    const dash = await dlusDashboard(db, who("topaze"), { day });
    expect(dash.enrolments.length).toBe(10);
    const times = dash.enrolments.map((e) => e.at.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(dash.enrolments.some((e) => e.status === "WAITLISTED")).toBe(true);
    expect(Object.keys(dash.enrolments[0] ?? {}).sort()).toEqual(
      ["at", "id", "person", "sessionDate", "status", "training"].sort(),
    );
  });

  it("arrivals: 12 months, the current one marked, funnel of every open stage, cohorts", async () => {
    const dash = await dlusDashboard(db, who("topaze"), { day, period: "annee" });
    expect(dash.arrivals.months).toHaveLength(12);
    expect(dash.arrivals.months.filter((m) => m.current)).toHaveLength(1);
    expect(dash.arrivals.funnel.map((f) => f.href)[0]).toBe("/candidats?etape=FIRST_CONTACT");
    const entered = await db.person.count({
      where: { entryDate: { gte: new Date("2026-01-01T00:00:00Z"), lte: day }, archivedAt: null },
    });
    expect(dash.arrivals.arrivalsSinceJanuary).toBe(entered);
    expect(dash.arrivals.byActivity.reduce((s, a) => s + a.count, 0)).toBe(
      dash.arrivals.arrivalsLast12Months,
    );
    expect(dash.arrivals.cohorts.length).toBe(8);
  });
});
