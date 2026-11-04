// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  SENSITIVE_MASK,
  diffRecords,
  isSensitiveField,
  snapshot,
  toAuditValue,
} from "@/server/audit";

describe("diffRecords", () => {
  it("lists changed fields only, skipping technical ones", () => {
    const changes = diffRecords(
      "Person",
      { id: "1", firstName: "Camille", status: "CANDIDATE", updatedAt: new Date(1) },
      { id: "1", firstName: "Camille", status: "ACTIVE", updatedAt: new Date(2) },
    );
    expect(changes).toEqual([{ field: "status", oldValue: "CANDIDATE", newValue: "ACTIVE" }]);
  });

  it("compares dates by value and serialises them as ISO strings", () => {
    const same = diffRecords(
      "Person",
      { entryDate: new Date("2026-01-01") },
      { entryDate: new Date("2026-01-01") },
    );
    expect(same).toEqual([]);
    const changed = diffRecords(
      "Person",
      { entryDate: null },
      { entryDate: new Date("2026-01-01T00:00:00Z") },
    );
    expect(changed).toEqual([
      { field: "entryDate", oldValue: null, newValue: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("masks sensitive values but keeps the fact that they changed", () => {
    const changes = diffRecords(
      "PersonSensitive",
      { birthDate: new Date("2000-01-01"), city: "Versailles" },
      { birthDate: new Date("2000-01-02"), city: "Versailles" },
    );
    expect(changes).toEqual([
      { field: "birthDate", oldValue: SENSITIVE_MASK, newValue: SENSITIVE_MASK },
    ]);
  });

  it("ignores keys absent from the update object", () => {
    expect(
      diffRecords("Person", { firstName: "A", lastName: "B" }, { firstName: "C" }),
    ).toHaveLength(1);
  });
});

describe("sensitivity", () => {
  it("masks whole sensitive tables and selected fields", () => {
    expect(isSensitiveField("EmergencyContact", "phone1")).toBe(true);
    expect(isSensitiveField("Document", "fileName")).toBe(true);
    expect(isSensitiveField("Document", "kind")).toBe(false);
    expect(isSensitiveField("Person", "lastName")).toBe(false);
  });

  it("builds a masked snapshot", () => {
    expect(snapshot("DossierLink", { id: "x", tokenHash: "abc", mode: "REMOTE" })).toEqual({
      tokenHash: SENSITIVE_MASK,
      mode: "REMOTE",
    });
  });

  it("converts values to JSON", () => {
    expect(toAuditValue({ a: new Date("2026-01-01T00:00:00Z"), b: [1n], c: undefined })).toEqual({
      a: "2026-01-01T00:00:00.000Z",
      b: ["1"],
      c: null,
    });
  });
});
