import { beforeEach, describe, expect, it } from "vitest";
import { makePerson, makeReference, makeUser, testNivol } from "./factories";
import { getTestDb, resetDatabase } from "./testDatabase";

/**
 * `binivol_share`: the read-only views Binitenue reads (docs/binivol-share.md). The checks run
 * as `binivol_share_reader`, the role Binitenue's `binitenue_app` is a member of.
 */
const db = getTestDb();

/** Runs `query` as the reader role, in a transaction rolled back afterwards. */
async function asReader<T>(
  query: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE binivol_share_reader");
    return query(tx);
  });
}

beforeEach(async () => {
  await resetDatabase(db);
});

describe("binivol_share", () => {
  it("publishes volunteers without candidates nor archived people, and no address", async () => {
    const volunteer = await makePerson(db, { status: "ACTIVE", nivol: testNivol() });
    await makePerson(db, { status: "CANDIDATE" });
    await makePerson(db, { status: "ACTIVE", nivol: testNivol(), archivedAt: new Date() });

    const rows = await asReader(
      (tx) =>
        tx.$queryRaw<{ id: string; status: string; city: string | null }[]>`
        SELECT id, status, city FROM binivol_share.volunteers`,
    );
    expect(rows).toEqual([{ id: volunteer.id, status: "ACTIVE", city: null }]);
  });

  it("publishes appointments with the function code, and passed or ongoing trainings", async () => {
    const person = await makePerson(db, { status: "ACTIVE", nivol: testNivol() });
    const fn = await makeReference(db, { kind: "FUNCTION", code: "CI_TEST" });
    const training = await makeReference(db, { kind: "TRAINING", code: "PSE_TEST" });
    await db.appointment.create({ data: { personId: person.id, referenceId: fn.id } });
    await db.trainingRecord.create({
      data: { personId: person.id, referenceId: training.id, result: "PASSED" },
    });
    await db.trainingRecord.create({
      data: { personId: person.id, referenceId: training.id, result: "FAILED" },
    });

    const [appointments, qualifications] = await asReader(async (tx) => [
      await tx.$queryRaw<{ function_code: string; cancelled: boolean }[]>`
        SELECT function_code, cancelled FROM binivol_share.appointments`,
      await tx.$queryRaw<{ code: string; status: string }[]>`
        SELECT code, status FROM binivol_share.qualifications`,
    ]);
    expect(appointments).toEqual([{ function_code: "CI_TEST", cancelled: false }]);
    expect(qualifications).toEqual([{ code: "PSE_TEST", status: "VALID" }]);
  });

  it("gives the hash of one exact identifier only, and no table to the reader", async () => {
    const user = await makeUser(db, {
      username: "fictif.test",
      passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$ZmljdGlm$ZmljdGlm",
      passwordChangedAt: new Date(),
    });
    await db.userProfile.create({ data: { userId: user.id, profile: "TOPAZE" } });

    const [found, other, accounts] = await asReader(async (tx) => [
      await tx.$queryRaw<{ account_id: string }[]>`
        SELECT account_id FROM binivol_share.account_password_hash(${" Fictif.Test "})`,
      await tx.$queryRaw<{ account_id: string }[]>`
        SELECT account_id FROM binivol_share.account_password_hash(${"fictif"})`,
      await tx.$queryRaw<{ profiles: string[] }[]>`SELECT profiles FROM binivol_share.accounts`,
    ]);
    expect(found).toEqual([{ account_id: user.id }]);
    expect(other).toEqual([]);
    expect(accounts).toEqual([{ profiles: ["TOPAZE"] }]);

    await expect(
      asReader((tx) => tx.$queryRaw`SELECT password_hash FROM public.users`),
    ).rejects.toThrow(/42501|permission denied/);
  });
});
