import { createHash } from "node:crypto";
import { detachTodosFromPerson } from "./todos";
import { toParisDay } from "@/lib/dates";
import { automationSettings } from "../automationSettings";
import type { Db, DbOrTx, Tx } from "../db";
import { DomainError } from "../errors";
import { dossierFootprint } from "../dossier/store";
import { authorize } from "../policy/can";
import type { Actor } from "../policy/types";
import { pseudonym, purgeRuleOf, PURGE_RULE_LABELS, type PurgeRule } from "../purgeRules";
import { sensitiveFootprint } from "../sensitive";
import type { StorageService } from "../storage/types";

/**
 * GDPR purge (step 14, docs/rgpd.md, ADR-061). The **only physical deletion**
 * of business data: the person and everything that depends on her (cascade),
 * her stored files, and in the append-only logs (opened by
 * `binivol.allow_purge` for this transaction only) every line about her is
 * **anonymised**: identifiers replaced by a pseudonym, values erased. A
 * minimal trace remains: « 1 fiche purgée le …, par …, règle … », without
 * personal data. A file that cannot be deleted is kept in `storage_orphans`
 * and tried again later; the purge itself goes on.
 */

export interface PurgeCandidate {
  id: string;
  ref: string;
  name: string;
  rule: PurgeRule;
  /** Departure date or closure of the last candidacy. */
  since: Date | null;
}

/** People eligible today (TOPAZE, /admin/purge). */
export async function purgeCandidates(
  db: DbOrTx,
  actor: Actor | null,
  day: Date = toParisDay(),
): Promise<PurgeCandidate[]> {
  if (actor) authorize(actor, "person.purge");
  const { abandonedRetentionMonths } = await automationSettings(db);
  const rows = await db.person.findMany({
    where: {
      OR: [
        { status: "LEFT", purgeEligibleAt: { lte: day } },
        { status: "CANDIDATE", entryDate: null, nivol: null },
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      ref: true,
      firstName: true,
      lastName: true,
      status: true,
      purgeEligibleAt: true,
      entryDate: true,
      nivol: true,
      leftAt: true,
      candidacies: { select: { stage: true, closedAt: true } },
    },
  });
  return rows.flatMap((p) => {
    const rule = purgeRuleOf(p, day, abandonedRetentionMonths);
    if (!rule) return [];
    const closed = p.candidacies.flatMap((c) => (c.closedAt ? [c.closedAt] : []));
    return [
      {
        id: p.id,
        ref: p.ref,
        name: `${p.firstName} ${p.lastName}`,
        rule,
        since:
          rule === "RETENTION"
            ? p.leftAt
            : (closed.sort((a, b) => b.getTime() - a.getTime())[0] ?? null),
      },
    ];
  });
}

/** Identifiers of every row about a person (for the anonymisation of the logs). */
async function footprint(tx: Tx, personId: string) {
  const where = { personId };
  const [records, wishes, appointments, candidacies, followUps, mentorships, notifications] =
    await Promise.all([
      tx.trainingRecord.findMany({ where, select: { id: true } }),
      tx.trainingWish.findMany({ where, select: { id: true } }),
      tx.appointment.findMany({ where, select: { id: true } }),
      tx.candidacy.findMany({
        where,
        select: { id: true, events: { select: { id: true } } },
      }),
      tx.followUp.findMany({ where, select: { id: true } }),
      tx.mentorship.findMany({
        where: { OR: [{ menteeId: personId }, { mentorId: personId }] },
        select: { id: true },
      }),
      tx.notification.findMany({ where, select: { id: true } }),
    ]);
  const [skills, languages, licenses, diplomas, activities, annexes] = await Promise.all([
    tx.personSkill.findMany({ where, select: { id: true } }),
    tx.personLanguage.findMany({ where, select: { id: true } }),
    tx.personLicense.findMany({ where, select: { id: true } }),
    tx.personDeclaredDiploma.findMany({ where, select: { id: true } }),
    tx.personWishedActivity.findMany({ where, select: { id: true } }),
    tx.personAnnex.findMany({ where, select: { id: true } }),
  ]);
  const [sensitive, dossier] = await Promise.all([
    sensitiveFootprint(tx, personId),
    dossierFootprint(tx, personId),
  ]);
  const ids = [
    personId,
    ...[
      ...records,
      ...wishes,
      ...appointments,
      ...candidacies,
      ...candidacies.flatMap((c) => c.events),
      ...followUps,
      ...mentorships,
      ...notifications,
      ...skills,
      ...languages,
      ...licenses,
      ...diplomas,
      ...activities,
      ...annexes,
    ].map((r) => r.id),
    ...sensitive.rowIds,
    ...dossier.rowIds,
  ];
  return { ids, storageKeys: [...sensitive.storageKeys, ...dossier.storageKeys] };
}

export interface PurgeOutcome {
  purged: number;
  /** Files kept for a new attempt. */
  orphans: number;
}

async function deleteFiles(db: DbOrTx, storage: StorageService, keys: string[]): Promise<number> {
  let failed = 0;
  for (const key of keys) {
    try {
      await storage.delete(key);
      await db.storageOrphan.deleteMany({ where: { storageKey: key } });
    } catch (cause) {
      failed += 1;
      const lastError = cause instanceof Error ? cause.name : "Erreur";
      await db.storageOrphan.upsert({
        where: { storageKey: key },
        create: { storageKey: key, lastError },
        update: { attempts: { increment: 1 }, lastError, lastTriedAt: new Date() },
      });
    }
  }
  return failed;
}

/**
 * Purges the given people, **each one re-checked**: a person who is not
 * eligible today is refused, unless `early` (TOPAZE's early erasure, with a
 * reason). `actor` null: the daily task in AUTOMATIC mode.
 */
export async function purgePeople(
  db: Db,
  storage: StorageService,
  actor: Actor | null,
  input: { personIds: string[]; early?: { reason: string } },
  day: Date = toParisDay(),
): Promise<PurgeOutcome> {
  if (actor) authorize(actor, "person.purge");
  if (input.early && !actor)
    throw new DomainError("INVALID_DATA", "Effacement anticipé : TOPAZE seul.");
  const eligible = new Map((await purgeCandidates(db, null, day)).map((c) => [c.id, c.rule]));
  let purged = 0;
  let orphans = 0;
  for (const personId of [...new Set(input.personIds)]) {
    const rule: PurgeRule | undefined = input.early ? "EARLY" : eligible.get(personId);
    if (!rule) {
      throw new DomainError("INVALID_DATA", "Cette fiche n'est pas éligible à la purge.");
    }
    const keys = await db.$transaction(
      async (tx) => {
        const exists = await tx.person.findUnique({
          where: { id: personId },
          select: { id: true },
        });
        if (!exists) return null;
        const { ids, storageKeys } = await footprint(tx, personId);
        const alias = pseudonym();
        await tx.$executeRawUnsafe("SET LOCAL binivol.allow_purge = 'on'");
        await tx.$executeRaw`
          UPDATE audit_logs SET entity_id = ${alias}, old_value = NULL, new_value = NULL
          WHERE entity_id = ANY(${ids}::text[])`;
        await tx.$executeRaw`
          UPDATE access_logs SET person_id = ${alias}, context = NULL
          WHERE person_id = ${personId}`;
        await tx.automatedMessage.deleteMany({ where: { personId } });
        // « À faire »: the tasks stay, detached from the person (step 16).
        await detachTodosFromPerson(tx, personId);
        // Everything else follows by cascade (schema: onDelete Cascade).
        await tx.person.delete({ where: { id: personId } });
        await tx.auditLog.create({
          data: {
            actorId: actor?.userId ?? null,
            actorLabel: actor ? actor.name : "Système",
            action: "PURGE",
            entity: "Person",
            entityId: alias,
            field: "purge",
            newValue: {
              count: 1,
              rule,
              ruleLabel: PURGE_RULE_LABELS[rule],
              ...(input.early ? { reason: input.early.reason } : {}),
            },
          },
        });
        return storageKeys;
      },
      { timeout: 60_000, maxWait: 20_000 },
    );
    if (keys === null) continue;
    purged += 1;
    orphans += await deleteFiles(db, storage, keys);
  }
  return { purged, orphans };
}

/** Files whose deletion failed, tried again (TOPAZE or the daily task). */
export async function retryStorageOrphans(
  db: DbOrTx,
  storage: StorageService,
  actor: Actor | null,
): Promise<{ deleted: number; remaining: number }> {
  if (actor) authorize(actor, "person.purge");
  const rows = await db.storageOrphan.findMany({ select: { storageKey: true } });
  const failed = await deleteFiles(
    db,
    storage,
    rows.map((r) => r.storageKey),
  );
  return { deleted: rows.length - failed, remaining: failed };
}

export async function storageOrphans(db: DbOrTx, actor: Actor) {
  authorize(actor, "person.purge");
  return db.storageOrphan.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, attempts: true, lastError: true, createdAt: true, lastTriedAt: true },
  });
}

/**
 * Daily task: AUTOMATIC mode purges the eligible people; MANUAL mode (the
 * default) only tells TOPAZE, once per set of people.
 */
export async function runPurge(
  db: Db,
  storage: StorageService,
  day: Date,
): Promise<{ mode: "MANUAL" | "AUTOMATIC"; eligible: number; purged: number }> {
  const { purgeMode } = await automationSettings(db);
  const candidates = await purgeCandidates(db, null, day);
  await retryStorageOrphans(db, storage, null);
  if (candidates.length === 0) return { mode: purgeMode, eligible: 0, purged: 0 };
  if (purgeMode === "AUTOMATIC") {
    const { purged } = await purgePeople(
      db,
      storage,
      null,
      { personIds: candidates.map((c) => c.id) },
      day,
    );
    return { mode: purgeMode, eligible: candidates.length, purged };
  }
  const key = createHash("sha256")
    .update(
      candidates
        .map((c) => c.id)
        .sort()
        .join(","),
    )
    .digest("hex")
    .slice(0, 24);
  const topaze = await db.user.findMany({
    where: { active: true, profiles: { some: { profile: "TOPAZE" } } },
    select: { id: true },
  });
  await db.notification.createMany({
    skipDuplicates: true,
    data: topaze.map((u) => ({
      userId: u.id,
      title: `${String(candidates.length)} fiche${candidates.length > 1 ? "s" : ""} à purger`,
      body: "La purge attend ta validation (RGPD).",
      href: "/admin/purge",
      dedupeKey: `PURGE_PENDING:${key}`,
    })),
  });
  return { mode: purgeMode, eligible: candidates.length, purged: 0 };
}

/**
 * Early erasure (right to erasure, opposition): TOPAZE purges a person
 * before the end of her retention, with a reason kept in the trace.
 */
export async function earlyPurge(
  db: Db,
  storage: StorageService,
  actor: Actor,
  input: { ref: string; reason: string },
  day: Date = toParisDay(),
): Promise<PurgeOutcome> {
  authorize(actor, "person.purge");
  const person = await db.person.findUnique({ where: { ref: input.ref }, select: { id: true } });
  if (!person) throw new DomainError("INVALID_DATA", "Fiche introuvable.");
  return purgePeople(
    db,
    storage,
    actor,
    { personIds: [person.id], early: { reason: input.reason } },
    day,
  );
}
