import { describe, expect, it } from "vitest";
import { b3CheckSchema, completeFollowUpSchema } from "../followUpForms";

describe("follow-up forms", () => {
  it("parses a point: empty report and next date become null", () => {
    expect(
      completeFollowUpSchema.parse({
        followUpId: "f1",
        doneAt: "2026-11-06",
        summary: " ",
        nextDate: "",
      }),
    ).toEqual({
      followUpId: "f1",
      doneAt: new Date("2026-11-06T00:00:00.000Z"),
      summary: null,
      nextDate: null,
    });
  });

  it("refuses a report over 2 000 characters and an unknown B3 outcome", () => {
    expect(
      completeFollowUpSchema.safeParse({
        followUpId: "f1",
        doneAt: "2026-11-06",
        summary: "x".repeat(2001),
      }).success,
    ).toBe(false);
    expect(
      b3CheckSchema.safeParse({ personId: "p", checkedAt: "2026-11-06", status: "OK" }).success,
    ).toBe(false);
  });
});
