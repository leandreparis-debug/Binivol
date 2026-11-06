import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { resetEnvCache } from "@/lib/env";
import { GET, POST } from "@/app/api/taches/quotidienne/route";
import { alertsFor } from "@/server/alerts/load";
import { ALERT_CODES } from "@/server/alerts/rules";
import { loadActor } from "@/server/auth/loadActor";
import { ALERT_TOPIC_ACTION } from "@/server/policy/alerts";
import { can } from "@/server/policy/can";
import { loadPersonFactsMany } from "@/server/policy/facts";
import type { Actor } from "@/server/policy/types";
import { runDailyTask, runGreetings } from "@/server/services/automation";
import { recordTrainingGroup } from "@/server/services/trainings";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
// A Monday 1st of the month would also send the digest: a plain Friday here.
const now = new Date("2026-11-06T09:00:00.000Z");
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};
const KEYS = ["topaze", "diamant", "action", "laser", "format", "format-gp", "format-diamant"];

function who(key: string): Actor {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
}

async function setSetting(key: string, value: unknown) {
  await db.setting.update({ where: { key }, data: { value: value as never } });
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of KEYS) {
    const user = await db.user.findUnique({ where: { email: seedUserEmail(key) } });
    if (!user) continue;
    const actor = await loadActor(db, user.id);
    if (actor) actors[key] = actor;
  }
}, 180_000);

afterAll(() => {
  delete process.env.CRON_SECRET;
  delete process.env.MAIL_DRIVER;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_FROM;
  resetEnvCache();
});

describe("alerts: visibility by profile", () => {
  it("every alert is allowed by the action of its topic; subjects follow the profiles", async () => {
    const all = await alertsFor(db, who("topaze"), { day });
    const codes = new Set(all.map((a) => a.code));
    // The demo seed has at least one case of every rule.
    expect([...codes].sort()).toEqual([...ALERT_CODES].sort());
    for (const key of Object.keys(actors)) {
      const actor = who(key);
      const alerts = await alertsFor(db, actor, { day });
      const ids = [...new Set(alerts.flatMap((a) => (a.personId ? [a.personId] : [])))];
      const facts = await loadPersonFactsMany(db, ids, day);
      for (const a of alerts) {
        if (!a.personId) {
          expect(can(actor, "reference.manage").allowed, key).toBe(true);
          continue;
        }
        const person = facts.get(a.personId);
        expect(person, key).toBeDefined();
        if (!person) continue;
        expect(
          can(actor, ALERT_TOPIC_ACTION[a.topic], { person }).allowed,
          `${key} ${a.code}`,
        ).toBe(true);
      }
    }
    const diamant = await alertsFor(db, who("diamant"), { day });
    expect(diamant.every((a) => a.topic === "integration")).toBe(true);
    expect(diamant.length).toBeGreaterThan(0);
    const action = await alertsFor(db, who("action"), { day });
    expect(action.every((a) => a.topic === "training")).toBe(true);
  });
});

describe("daily task", () => {
  it("refuses without a configured secret, and with a wrong secret", async () => {
    delete process.env.CRON_SECRET;
    resetEnvCache();
    const request = (auth?: string) =>
      new Request("http://localhost/api/taches/quotidienne", {
        method: "POST",
        headers: auth ? { authorization: auth } : {},
      });
    expect((await POST(request(`Bearer ${"x".repeat(40)}`))).status).toBe(503);
    process.env.CRON_SECRET = "c".repeat(40);
    resetEnvCache();
    expect((await POST(request(`Bearer ${"x".repeat(40)}`))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
    expect(await db.jobRun.count()).toBe(0);
  });

  it("runs end to end once a day: replayed, it creates nothing more", async () => {
    const first = await runDailyTask(db, now);
    expect(first.status).toBe("done");
    expect(first.notifications ?? 0).toBeGreaterThan(0);
    const notifications = await db.notification.count();
    const messages = await db.automatedMessage.count();
    expect(await runDailyTask(db, now)).toMatchObject({ status: "already" });
    // Even when the lock is lost, nothing is notified or sent twice.
    await db.jobRun.updateMany({ data: { status: "FAILED" } });
    expect((await runDailyTask(db, now)).status).toBe("done");
    expect(await db.notification.count()).toBe(notifications);
    expect(await db.automatedMessage.count()).toBe(messages);
    // A recipient only receives a reminder about a person they may see.
    for (const key of ["action", "laser", "diamant"]) {
      const notes = await db.notification.findMany({
        where: { userId: who(key).userId, personId: { not: null } },
        select: { personId: true },
      });
      const ids = notes.flatMap((n) => (n.personId ? [n.personId] : []));
      const facts = await loadPersonFactsMany(db, ids, day);
      for (const id of ids) {
        const person = facts.get(id);
        expect(person && can(who(key), "person.directory.read", { person }).allowed, key).toBe(
          true,
        );
      }
    }
    expect(
      await db.notification.count({ where: { userId: who("diamant").userId } }),
    ).toBeGreaterThan(0);
  });
});

describe("prévenance du pôle Urgence", () => {
  let offset = 0;
  async function tcauGroup(count: number) {
    const tcau = await db.referenceItem.findUniqueOrThrow({ where: { code: "TCAU" } });
    const people = await db.person.findMany({
      where: { status: "ACTIVE", archivedAt: null },
      orderBy: { ref: "asc" },
      take: count,
      skip: offset,
    });
    offset += count;
    const input = {
      referenceId: tcau.id,
      date: new Date("2026-11-02T00:00:00.000Z"),
      result: "PASSED" as const,
      personIds: people.map((p) => p.id),
    };
    const first = await recordTrainingGroup(db, who("format"), input, day);
    if (first.saved) return first;
    return recordTrainingGroup(
      db,
      who("format"),
      { ...input, acceptedWarnings: first.warningsKey },
      day,
    );
  }

  it("nothing leaves without recipients; one e-mail for a group entry", async () => {
    const before = await db.outboundMail.count();
    const silent = await tcauGroup(2);
    expect(silent).toMatchObject({ saved: true, urgence: "NO_RECIPIENT" });
    expect(await db.outboundMail.count()).toBe(before);

    await setSetting("URGENCE_NOTIFY_RECIPIENTS", ["urgence@exemple.test"]);
    const result = await tcauGroup(4);
    expect(result).toMatchObject({ saved: true, urgence: "SENT" });
    expect(await db.outboundMail.count()).toBe(before + 1);
    const mail = await db.outboundMail.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    expect(mail.subject).toBe("TCAU : session validée (4)");
  });

  it("the entry is kept when the e-mail fails, and the failure is recorded", async () => {
    process.env.MAIL_DRIVER = "smtp";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "9";
    process.env.SMTP_FROM = "Binivol <no-reply@exemple.test>";
    resetEnvCache();
    try {
      const result = await tcauGroup(3);
      expect(result).toMatchObject({ saved: true, urgence: "FAILED" });
      if (!result.saved) return;
      expect(await db.trainingRecord.count({ where: { id: { in: result.recordIds } } })).toBe(3);
      const failed = await db.automatedMessage.findMany({
        where: { kind: "URGENCE_NOTICE", status: "FAILED" },
      });
      expect(failed.length).toBe(1);
      expect(JSON.stringify(failed)).not.toContain("@");
    } finally {
      delete process.env.MAIL_DRIVER;
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_FROM;
      resetEnvCache();
    }
  }, 30_000);
});

describe("greetings", () => {
  it("disabled by default; enabled, the opposition is respected", async () => {
    const person = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE", email: { not: null }, archivedAt: null },
      orderBy: { ref: "desc" },
    });
    await db.person.update({
      where: { id: person.id },
      data: { entryDate: new Date("2023-11-06T00:00:00.000Z"), greetingOptOut: true },
    });
    expect(await runGreetings(db, day)).toBe(0);
    await setSetting("GREETING_EMAILS_ENABLED", true);
    await runGreetings(db, day);
    expect(await db.automatedMessage.count({ where: { personId: person.id } })).toBe(0);

    await db.person.update({ where: { id: person.id }, data: { greetingOptOut: false } });
    await runGreetings(db, day);
    await runGreetings(db, day);
    const sent = await db.automatedMessage.findMany({ where: { personId: person.id } });
    expect(sent.map((m) => [m.kind, m.status])).toEqual([["ENGAGEMENT_ANNIVERSARY", "SENT"]]);
  });
});

describe("performance", () => {
  it("computes the alerts of 500 people in less than a second", async () => {
    const present = await db.person.count();
    const missing = Math.max(0, 500 - present);
    const pse = await db.referenceItem.findUniqueOrThrow({ where: { code: "PSE" } });
    await db.person.createMany({
      data: Array.from({ length: missing }, (_, i) => ({
        id: `perf_${String(i)}`,
        firstName: "Perf",
        lastName: `Fictif ${String(i)}`,
        status: "ACTIVE" as const,
        // Imported people may lack a NIVOL (CHECK persons_nivol_required).
        legacyImport: true,
        entryDate: new Date("2020-01-01T00:00:00.000Z"),
      })),
    });
    await db.trainingRecord.createMany({
      data: Array.from({ length: missing }, (_, i) => ({
        personId: `perf_${String(i)}`,
        referenceId: pse.id,
        result: "PASSED" as const,
        date: new Date("2025-01-10T00:00:00.000Z"),
        expiresAt: new Date("2025-12-31T00:00:00.000Z"),
      })),
    });
    await alertsFor(db, who("topaze"), { day }); // warm-up
    const start = performance.now();
    const alerts = await alertsFor(db, who("topaze"), { day });
    const elapsed = performance.now() - start;
    expect(alerts.length).toBeGreaterThan(missing);
    expect(elapsed).toBeLessThan(1000);
  }, 60_000);
});
