import type { Prisma } from "@/generated/prisma/client";
import type { Db, DbOrTx } from "@/server/db";

let counter = 0;

/** Synthetic NIVOL for tests (right format, starts with 999 to stand out). */
export function testNivol(): string {
  counter += 1;
  return `999${String(counter).padStart(8, "0")}T`;
}

/** Creates a person with sensible defaults (a candidate without NIVOL). */
export function makePerson(db: DbOrTx, data: Partial<Prisma.PersonUncheckedCreateInput> = {}) {
  counter += 1;
  return db.person.create({
    data: {
      firstName: `Test${counter}`,
      lastName: "Fictif",
      notes: "Donnée fictive (test)",
      ...data,
    },
  });
}

export function makeReference(
  db: DbOrTx,
  data: Partial<Prisma.ReferenceItemUncheckedCreateInput> = {},
) {
  counter += 1;
  return db.referenceItem.create({
    data: {
      code: `TEST_${counter}`,
      label: `Référence test ${counter}`,
      category: "AUTRE",
      kind: "TRAINING",
      ...data,
    },
  });
}

export function makeUser(db: Db, data: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  counter += 1;
  return db.user.create({
    data: { email: `user${counter}@binivol.test`, name: `Utilisateur ${counter}`, ...data },
  });
}
