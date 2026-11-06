import { describe, expect, it } from "vitest";
import { hitRateLimit, rateKey } from "@/server/rateLimit";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();

describe("rate limit (database, fixed window)", () => {
  it("allows the limit, refuses the next hit, starts again after the window", async () => {
    const key = rateKey("test", "203.0.113.7", "pepper");
    expect(key).not.toContain("203.0.113.7");
    const rule = { limit: 3, windowSeconds: 60 };
    const t0 = new Date("2026-11-06T10:00:00Z");
    const hits = [];
    for (let i = 0; i < 4; i += 1) hits.push(await hitRateLimit(db, key, rule, t0));
    expect(hits).toEqual([true, true, true, false]);
    expect(await hitRateLimit(db, key, rule, new Date("2026-11-06T10:01:01Z"))).toBe(true);
    // Another client is not affected.
    expect(await hitRateLimit(db, rateKey("test", "198.51.100.1", "pepper"), rule, t0)).toBe(true);
  });
});
