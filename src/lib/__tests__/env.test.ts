import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("applies defaults when variables are absent", () => {
    const env = parseEnv({});
    expect(env.NEXT_PUBLIC_APP_NAME).toBe("Binivol");
    expect(env.APP_URL).toBeUndefined();
    expect(env.ENABLE_DESIGN_PAGE).toBe(false);
  });

  it("treats empty strings as absent", () => {
    expect(parseEnv({ APP_URL: "", NEXT_PUBLIC_APP_NAME: "  " }).APP_URL).toBeUndefined();
  });

  it("reads valid values", () => {
    const env = parseEnv({
      NEXT_PUBLIC_APP_NAME: "Binivol test",
      APP_URL: "https://binivol.example.org",
      ENABLE_DESIGN_PAGE: "true",
    });
    expect(env.NEXT_PUBLIC_APP_NAME).toBe("Binivol test");
    expect(env.APP_URL).toBe("https://binivol.example.org");
    expect(env.ENABLE_DESIGN_PAGE).toBe(true);
  });

  it("throws an explicit error naming the variable, without its value", () => {
    const secret = "pas-une-url-secrete";
    expect(() => parseEnv({ APP_URL: secret })).toThrow(/APP_URL/);
    expect(() => parseEnv({ APP_URL: secret })).not.toThrow(new RegExp(secret));
  });

  it("rejects an unexpected ENABLE_DESIGN_PAGE value", () => {
    expect(() => parseEnv({ ENABLE_DESIGN_PAGE: "oui" })).toThrow(/ENABLE_DESIGN_PAGE/);
  });
});
