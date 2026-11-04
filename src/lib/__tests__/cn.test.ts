import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("merges conflicting Tailwind classes, last one wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("keeps a custom font size and a colour together", () => {
    expect(cn("text-small text-white")).toBe("text-small text-white");
    expect(cn("text-body text-ink", "text-white")).toBe("text-body text-white");
  });

  it("resolves custom radii", () => {
    expect(cn("rounded-card", "rounded-pill")).toBe("rounded-pill");
  });
});
