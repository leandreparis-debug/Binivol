import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns ok and the version only", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual({
      status: "ok",
      version: expect.stringMatching(/^\d+\.\d+\.\d+/) as string,
    });
  });
});
