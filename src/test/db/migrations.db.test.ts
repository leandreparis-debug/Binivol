import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTestDb } from "./testDatabase";

const migrationDirs = readdirSync("prisma/migrations", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("migrations", () => {
  it("are all applied on an empty database, none failed", async () => {
    const rows = await getTestDb().$queryRaw<
      { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
    >`
      SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name
    `;
    expect(rows.map((r) => r.migration_name)).toEqual(migrationDirs);
    expect(rows.every((r) => r.finished_at !== null && r.rolled_back_at === null)).toBe(true);
  });

  it("create the 34 tables (31 domain + accounts, sessions, import_runs), the SQL helpers and the triggers", async () => {
    const db = getTestDb();
    const [tables] = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    expect(Number(tables?.n)).toBe(34);
    const functions = await db.$queryRaw<{ proname: string }[]>`
      SELECT proname FROM pg_proc WHERE proname LIKE 'binivol_%' ORDER BY proname
    `;
    expect(functions.map((f) => f.proname)).toEqual([
      "binivol_check_appointment_reference",
      "binivol_forbid_log_mutation",
      "binivol_next_ref",
      "binivol_normalize",
    ]);
    const triggers = await db.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname
    `;
    expect(triggers.map((t) => t.tgname)).toEqual([
      "access_logs_append_only",
      "appointments_reference_is_function",
      "audit_logs_append_only",
    ]);
  });

  it("normalise text without the unaccent extension", async () => {
    const [row] = await getTestDb().$queryRaw<
      { v: string }[]
    >`SELECT binivol_normalize('Élodie Lætitia CŒUR') AS v`;
    expect(row?.v).toBe("elodie laetitia coeur");
  });
});
