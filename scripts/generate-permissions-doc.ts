/**
 * Writes docs/permissions.md from the access matrix. Run with
 * `pnpm docs:permissions` after changing src/server/policy/matrix.ts.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PERMISSIONS_DOC_PATH, renderPermissionsDoc } from "../src/server/policy/permissionsDoc";

async function main() {
  const target = path.resolve(import.meta.dirname, "..", PERMISSIONS_DOC_PATH);
  await writeFile(target, renderPermissionsDoc(), "utf8");
  process.stdout.write(`${PERMISSIONS_DOC_PATH} généré.\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
