// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DomainError, findConstraintRule, translateDbError } from "@/server/errors";
import { escapeLike, searchTerms } from "@/server/repositories/personRepository";
import { formatRef, parseRef } from "@/server/sequences";

describe("readable refs", () => {
  it("pads to five digits and keeps growing", () => {
    expect(formatRef("P-", 1)).toBe("P-00001");
    expect(formatRef("S-", 99999)).toBe("S-99999");
    expect(formatRef("F-", 123456)).toBe("F-123456");
  });

  it("parses a ref", () => {
    expect(parseRef(" p-00042 ")).toEqual({ prefix: "P-", value: 42 });
    expect(parseRef("P-42")).toBeNull();
    expect(parseRef("bonjour")).toBeNull();
  });
});

describe("translateDbError", () => {
  it("maps a unique violation reported by the pg adapter", () => {
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: {
        modelName: "Person",
        driverAdapterError: { cause: { constraint: { index: "persons_nivol_key" } } },
      },
    });
    const translated = translateDbError(error);
    expect(translated).toBeInstanceOf(DomainError);
    expect((translated as DomainError).code).toBe("NIVOL_TAKEN");
    expect((translated as DomainError).message).toBe(
      "Ce NIVOL est déjà attribué à une autre personne.",
    );
  });

  it("maps a CHECK violation by constraint name", () => {
    const error = new Error('violates check constraint "persons_nivol_format"');
    expect(findConstraintRule(error)?.code).toBe("NIVOL_INVALID");
  });

  it("returns unknown errors unchanged", () => {
    const error = new Error("connexion perdue");
    expect(translateDbError(error)).toBe(error);
  });
});

describe("search helpers", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
  it("splits words", () => {
    expect(searchTerms("  Jean-Pierre   Durand, ")).toEqual(["Jean-Pierre", "Durand"]);
    expect(searchTerms(null)).toEqual([]);
  });
});
