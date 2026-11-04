import { afterAll, beforeAll } from "vitest";
import { disconnectTestDb, getTestDb, resetDatabase } from "./testDatabase";

// Each test file starts from an empty, migrated database.
beforeAll(async () => {
  await resetDatabase(getTestDb());
});

afterAll(async () => {
  await disconnectTestDb();
});
