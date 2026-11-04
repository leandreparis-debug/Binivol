// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERMISSIONS_DOC_PATH, renderPermissionsDoc } from "@/server/policy/permissionsDoc";

describe("docs/permissions.md", () => {
  it("is up to date with the matrix (run `pnpm docs:permissions`)", () => {
    expect(readFileSync(PERMISSIONS_DOC_PATH, "utf8")).toBe(renderPermissionsDoc());
  });
});
