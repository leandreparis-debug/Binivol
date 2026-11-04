// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkFreshTarget } from "@/server/maintenance/freshGuard";

describe("checkFreshTarget (db:fresh)", () => {
  it.each([
    "postgresql://u:p@localhost:5432/binivol",
    "postgresql://u:p@127.0.0.1:5432/binivol",
    "postgresql://u:p@[::1]:5432/binivol",
    "postgresql://u:p@db:5432/binivol",
    "postgres://u:p@db-test:5432/binivol_test",
  ])("accepts the local database %s", (url) => {
    expect(checkFreshTarget(url, "development")).toMatchObject({ ok: true });
  });

  it.each([
    ["Supabase", "postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:6543/postgres"],
    ["a VPS", "postgresql://u:p@binivol.exemple.org:5432/binivol"],
    ["a private IP", "postgresql://u:p@10.0.0.5:5432/binivol"],
    ["a look-alike", "postgresql://u:p@localhost.evil.com:5432/binivol"],
  ])("refuses a remote host (%s)", (_label, url) => {
    const result = checkFreshTarget(url, "development");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/refuse l'hôte/);
  });

  it("refuses NODE_ENV=production, even on localhost", () => {
    expect(checkFreshTarget("postgresql://u:p@localhost:5432/binivol", "production")).toEqual({
      ok: false,
      reason: "db:fresh est interdit quand NODE_ENV=production.",
    });
  });

  it("refuses a missing, malformed or non PostgreSQL URL", () => {
    expect(checkFreshTarget(undefined, "development").ok).toBe(false);
    expect(checkFreshTarget("pas une url", "development").ok).toBe(false);
    expect(checkFreshTarget("mysql://u:p@localhost/x", "development").ok).toBe(false);
    expect(checkFreshTarget('postgresql://u:p@localhost:5432/x";DROP', "development").ok).toBe(
      false,
    );
  });
});
