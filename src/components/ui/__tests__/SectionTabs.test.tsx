import { describe, expect, it } from "vitest";
import { isActivePath } from "@/components/layout/activePath";

describe("isActivePath", () => {
  it("matches the home route exactly", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/benevoles", "/")).toBe(false);
  });
  it("matches sections and their sub-routes", () => {
    expect(isActivePath("/benevoles", "/benevoles")).toBe(true);
    expect(isActivePath("/benevoles/42", "/benevoles")).toBe(true);
    expect(isActivePath("/benevoles-archives", "/benevoles")).toBe(false);
  });
});
