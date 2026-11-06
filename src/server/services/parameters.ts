import type { Prisma } from "@/generated/prisma/client";
import { parseGaiaChecklist } from "@/lib/gaia";
import { withAudit } from "../audit";
import type { DbOrTx } from "../db";
import { DomainError } from "../errors";
import { gaiaToLines, parameterDef, parseParameter, PARAMETERS } from "../parameters";
import { authorize } from "../policy/can";
import type { Actor } from "../policy/types";

/** /admin/parametres (step 14): current values as editable text. */
export async function parametersOverview(
  db: DbOrTx,
  actor: Actor,
): Promise<Record<string, string>> {
  authorize(actor, "setting.manage");
  const rows = await db.setting.findMany({
    where: { key: { in: PARAMETERS.map((p) => p.key) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(
    PARAMETERS.map((p) => {
      const value = byKey.get(p.key);
      if (p.kind === "gaia") return [p.key, gaiaToLines(parseGaiaChecklist(value))];
      const text =
        typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : "";
      return [p.key, text];
    }),
  );
}

/** Saves one parameter (validated, audited). */
export async function saveParameter(
  db: DbOrTx,
  actor: Actor,
  key: string,
  raw: string,
): Promise<void> {
  authorize(actor, "setting.manage");
  const def = parameterDef(key);
  if (!def) throw new DomainError("INVALID_DATA", "Paramètre inconnu.");
  const parsed = parseParameter(def, raw);
  if (!parsed.ok) throw new DomainError("INVALID_DATA", parsed.error);
  const value = parsed.value as Prisma.InputJsonValue;
  await withAudit(db, { userId: actor.userId, label: actor.name }, async (tx, audit) => {
    const before = await tx.setting.findUnique({ where: { key } });
    if (before) {
      const after = await tx.setting.update({
        where: { key },
        data: { value, updatedById: actor.userId },
      });
      audit.updated("Setting", before.id, before, after);
    } else {
      const created = await tx.setting.create({
        data: {
          key,
          value,
          description: def.help,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      audit.created("Setting", created.id, created);
    }
  });
}
