import { describe, expect, it } from "vitest";
import { DomainError } from "@/server/errors";
import { personRepository } from "@/server/repositories/personRepository";
import { makePerson, makeReference, makeUser, testNivol } from "@/test/db/factories";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();

describe("persons", () => {
  it("rejects a duplicate NIVOL with a business message", async () => {
    const nivol = testNivol();
    const repo = personRepository(db);
    await repo.create({ firstName: "A", lastName: "Un", nivol, status: "ACTIVE" });
    const attempt = repo.create({ firstName: "B", lastName: "Deux", nivol, status: "ACTIVE" });
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({
      code: "NIVOL_TAKEN",
      message: "Ce NIVOL est déjà attribué à une autre personne.",
    });
  });

  it.each(["0001234567A", "00012345678a", "ABCDEFGHIJKL", "00012345678 A"])(
    "rejects the badly formatted NIVOL %s (CHECK)",
    async (nivol) => {
      await expect(makePerson(db, { nivol })).rejects.toThrow(/persons_nivol_format/);
    },
  );

  it("translates a format error too", async () => {
    await expect(
      personRepository(db).create({ firstName: "A", lastName: "B", nivol: "bad" }),
    ).rejects.toMatchObject({
      code: "NIVOL_INVALID",
    });
  });

  it("rejects ACTIVE without NIVOL unless imported from the legacy workbook", async () => {
    await expect(makePerson(db, { status: "ACTIVE" })).rejects.toThrow(/persons_nivol_required/);
    await expect(makePerson(db, { status: "PAUSED" })).rejects.toThrow(/persons_nivol_required/);
    await expect(makePerson(db, { status: "ACTIVE", legacyImport: true })).resolves.toMatchObject({
      status: "ACTIVE",
    });
  });

  it("accepts CANDIDATE, INACTIVE and LEFT without NIVOL", async () => {
    await expect(makePerson(db, { status: "CANDIDATE" })).resolves.toBeTruthy();
    await expect(makePerson(db, { status: "INACTIVE" })).resolves.toBeTruthy();
    await expect(
      makePerson(db, { status: "LEFT", leftAt: new Date("2026-01-15") }),
    ).resolves.toBeTruthy();
  });

  it("requires leftAt when the status is LEFT", async () => {
    await expect(makePerson(db, { status: "LEFT" })).rejects.toThrow(/persons_left_requires_date/);
  });
});

describe("candidacies", () => {
  it("allows only one open candidacy per person (partial unique index)", async () => {
    const person = await makePerson(db);
    await db.candidacy.create({ data: { personId: person.id } });
    await expect(db.candidacy.create({ data: { personId: person.id } })).rejects.toThrow(
      /candidacies_one_open/,
    );
  });

  it("accepts a new candidacy once the previous one is closed", async () => {
    const person = await makePerson(db);
    const first = await db.candidacy.create({ data: { personId: person.id } });
    await db.candidacy.update({
      where: { id: first.id },
      data: { stage: "ABANDONED", closedAt: new Date() },
    });
    await expect(db.candidacy.create({ data: { personId: person.id } })).resolves.toBeTruthy();
  });

  it("keeps closedAt consistent with the stage", async () => {
    const person = await makePerson(db);
    await expect(
      db.candidacy.create({ data: { personId: person.id, stage: "DONE" } }),
    ).rejects.toThrow(/candidacies_closed_matches_stage/);
    await expect(
      db.candidacy.create({
        data: { personId: person.id, stage: "MEETING", closedAt: new Date() },
      }),
    ).rejects.toThrow(/candidacies_closed_matches_stage/);
  });
});

describe("training wishes", () => {
  it("allows one open wish per person and reference, plus closed ones", async () => {
    const person = await makePerson(db);
    const reference = await makeReference(db);
    const base = { personId: person.id, referenceId: reference.id };
    await db.trainingWish.create({ data: { ...base, status: "OPEN" } });
    await expect(
      db.trainingWish.create({ data: { ...base, status: "WAITLISTED" } }),
    ).rejects.toThrow(/training_wishes_one_open/);
    await expect(
      db.trainingWish.create({ data: { ...base, status: "DONE" } }),
    ).resolves.toBeTruthy();
    await expect(
      db.trainingWish.create({ data: { ...base, status: "CANCELLED" } }),
    ).resolves.toBeTruthy();
  });
});

describe("other constraints", () => {
  it("forbids sponsoring oneself", async () => {
    const person = await makePerson(db);
    await expect(
      db.mentorship.create({
        data: { menteeId: person.id, mentorId: person.id, startDate: new Date() },
      }),
    ).rejects.toThrow(/mentorships_not_self/);
  });

  it("only appoints to a FUNCTION reference (trigger)", async () => {
    const person = await makePerson(db);
    const training = await makeReference(db, { kind: "TRAINING" });
    const fn = await makeReference(db, { kind: "FUNCTION", category: "SECOURS" });
    await expect(
      db.appointment.create({ data: { personId: person.id, referenceId: training.id } }),
    ).rejects.toThrow(/type FUNCTION/);
    await expect(
      db.appointment.create({ data: { personId: person.id, referenceId: fn.id } }),
    ).resolves.toMatchObject({
      ref: expect.stringMatching(/^F-\d{5}$/) as string,
    });
  });

  it("stores e-mails in lower case only", async () => {
    await expect(
      db.user.create({ data: { email: "Demo@Binivol.test", name: "X" } }),
    ).rejects.toThrow(/users_email_lowercase/);
  });

  it("keeps a profile once per user and a notification once per dedupe key", async () => {
    const user = await makeUser(db);
    await db.userProfile.create({ data: { userId: user.id, profile: "DIAMANT" } });
    await expect(
      db.userProfile.create({ data: { userId: user.id, profile: "DIAMANT" } }),
    ).rejects.toThrow(/Unique/);
    await db.notification.create({ data: { userId: user.id, title: "A", dedupeKey: "K" } });
    await expect(
      db.notification.create({ data: { userId: user.id, title: "B", dedupeKey: "K" } }),
    ).rejects.toThrow(/Unique/);
  });

  it("rejects a malformed document hash", async () => {
    const person = await makePerson(db);
    await expect(
      db.document.create({
        data: {
          personId: person.id,
          kind: "OTHER",
          storageKey: "k",
          fileName: "f",
          mimeType: "x",
          sizeBytes: 1,
          sha256: "nope",
        },
      }),
    ).rejects.toThrow(/documents_sha256_format/);
  });
});
