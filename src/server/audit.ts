import type { AuditAction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { inTransaction, type DbOrTx, type Tx } from "./db";

/**
 * Audit trail. Entries are written in the same transaction as the change they
 * describe, so a rolled-back change leaves no trace and a committed one always
 * has its entries. `audit_logs` is append-only (database trigger).
 */

/** Who performs a change. `userId` is null for imports and system jobs. */
export interface Actor {
  userId: string | null;
  /** Shown when there is no user: « Import », « Système ». */
  label?: string;
}

export const SYSTEM_ACTOR: Actor = { userId: null, label: "Système" };
export const IMPORT_ACTOR: Actor = { userId: null, label: "Import" };

/** Placeholder written instead of a sensitive value. */
export const SENSITIVE_MASK = "[sensible]";

/**
 * Sensitive fields per entity (Prisma model name). `"*"` masks every field.
 * Matches the sensitivity column of docs/data-model.md.
 */
export const SENSITIVE_FIELDS: Record<string, "*" | readonly string[]> = {
  PersonSensitive: "*",
  EmergencyContact: "*",
  Document: ["fileName", "storageKey", "sha256"],
  DossierLink: ["tokenHash"],
  DossierSubmission: ["data"],
  OtpChallenge: ["codeHash", "email"],
  Signature: ["imageKey", "ipHash", "userAgent", "documentHashes"],
};

/** Technical fields never worth an audit entry. */
const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt", "createdById", "updatedById"]);

/** True when the value of `field` on `entity` must not be logged in clear. */
export function isSensitiveField(entity: string, field: string): boolean {
  const rule = SENSITIVE_FIELDS[entity];
  if (rule === undefined) return false;
  return rule === "*" || rule.includes(field);
}

type JsonValue = Prisma.InputJsonValue | null;

/** Converts a column value into JSON for the log (dates as ISO strings). */
export function toAuditValue(value: unknown): JsonValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toAuditValue(item));
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) out[key] = toAuditValue(item);
    return out;
  }
  return null;
}

function masked(entity: string, field: string, value: unknown): JsonValue {
  if (value === undefined || value === null) return null;
  return isSensitiveField(entity, field) ? SENSITIVE_MASK : toAuditValue(value);
}

/** One changed field. Values are already masked when sensitive. */
export interface FieldChange {
  field: string;
  oldValue: JsonValue;
  newValue: JsonValue;
}

/**
 * Field-by-field difference between two versions of a row. Technical fields
 * are skipped; sensitive values are replaced by `"[sensible]"` (the change
 * itself is still recorded). Only keys present in `after` are compared, so a
 * partial update object can be passed.
 */
export function diffRecords(
  entity: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [field, next] of Object.entries(after)) {
    if (IGNORED_FIELDS.has(field) || next === undefined) continue;
    const previous = before[field];
    if (JSON.stringify(toAuditValue(previous)) === JSON.stringify(toAuditValue(next))) continue;
    changes.push({
      field,
      oldValue: masked(entity, field, previous),
      newValue: masked(entity, field, next),
    });
  }
  return changes;
}

/** Masked snapshot of a whole row (used for CREATE entries). */
export function snapshot(entity: string, row: Record<string, unknown>): Prisma.InputJsonObject {
  const out: Record<string, JsonValue> = {};
  for (const [field, value] of Object.entries(row)) {
    if (IGNORED_FIELDS.has(field)) continue;
    out[field] = masked(entity, field, value);
  }
  return out;
}

/** Records audit entries for the current transaction. */
export interface AuditRecorder {
  /** A row was created: one entry with the masked snapshot. */
  created(entity: string, entityId: string, row: Record<string, unknown>): void;
  /** A row changed: one entry per changed field. Returns the number of entries. */
  updated(
    entity: string,
    entityId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): number;
  /** A traced cancellation. */
  cancelled(entity: string, entityId: string, reason?: string | null): void;
  /** An archival (`archivedAt` set). */
  archived(entity: string, entityId: string): void;
  /** Any other entry (IMPORT, EXPORT, LOGIN…). Values are logged as given. */
  log(entry: {
    action: AuditAction;
    entity: string;
    entityId?: string | null;
    field?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
  }): void;
}

/**
 * Runs `fn` in a transaction and writes the audit entries it records in that
 * same transaction, just before commit. If `fn` throws, the transaction rolls
 * back and no entry is written.
 *
 * @example
 * await withAudit(db, actor, async (tx, audit) => {
 *   const before = await tx.person.findUniqueOrThrow({ where: { id } });
 *   const after = await tx.person.update({ where: { id }, data });
 *   audit.updated("Person", id, before, after);
 * });
 */
export async function withAudit<T>(
  db: DbOrTx,
  actor: Actor,
  fn: (tx: Tx, audit: AuditRecorder) => Promise<T>,
): Promise<T> {
  return inTransaction(db, async (tx) => {
    const at = new Date();
    const entries: Prisma.AuditLogCreateManyInput[] = [];
    const base = { at, actorId: actor.userId, actorLabel: actor.label ?? null };

    const recorder: AuditRecorder = {
      created(entity, entityId, row) {
        entries.push({
          ...base,
          action: "CREATE",
          entity,
          entityId,
          newValue: snapshot(entity, row),
        });
      },
      updated(entity, entityId, before, after) {
        const changes = diffRecords(entity, before, after);
        for (const change of changes) {
          entries.push({
            ...base,
            action: "UPDATE",
            entity,
            entityId,
            field: change.field,
            oldValue: change.oldValue ?? undefined,
            newValue: change.newValue ?? undefined,
          });
        }
        return changes.length;
      },
      cancelled(entity, entityId, reason) {
        entries.push({
          ...base,
          action: "CANCEL",
          entity,
          entityId,
          field: "cancelledAt",
          newValue: reason ? { reason } : undefined,
        });
      },
      archived(entity, entityId) {
        entries.push({ ...base, action: "ARCHIVE", entity, entityId, field: "archivedAt" });
      },
      log({ action, entity, entityId, field, oldValue, newValue }) {
        entries.push({
          ...base,
          action,
          entity,
          entityId: entityId ?? null,
          field: field ?? null,
          oldValue: toAuditValue(oldValue) ?? undefined,
          newValue: toAuditValue(newValue) ?? undefined,
        });
      },
    };

    const result = await fn(tx, recorder);
    if (entries.length > 0) await tx.auditLog.createMany({ data: entries });
    return result;
  });
}
