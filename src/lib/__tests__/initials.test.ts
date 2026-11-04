import { describe, expect, it } from "vitest";
import { initials } from "@/lib/initials";

describe("initials", () => {
  it("takes the first letter of each name", () => {
    expect(initials("Camille", "Durand")).toBe("CD");
  });

  it("handles compound first names", () => {
    expect(initials("Jean-Pierre", "Martin")).toBe("JM");
    expect(initials("Marie Claire", "Dupont")).toBe("MD");
  });

  it("keeps accents and upper-cases them", () => {
    expect(initials("élodie", "ândré")).toBe("ÉÂ");
  });

  it("ignores empty or blank parts", () => {
    expect(initials("", "Durand")).toBe("D");
    expect(initials("   ", "Durand")).toBe("D");
    expect(initials("Camille", null)).toBe("C");
    expect(initials(undefined, undefined)).toBe("?");
    expect(initials("", "  ")).toBe("?");
  });
});
