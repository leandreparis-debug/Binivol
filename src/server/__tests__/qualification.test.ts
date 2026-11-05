import { describe, expect, it } from "vitest";
import { functionState, trainingState, type RecordFact } from "../qualification";

const day = new Date("2026-11-06T00:00:00.000Z");
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const rec = (over: Partial<RecordFact>): RecordFact => ({
  result: "PASSED",
  date: d("2025-03-01"),
  expiresAt: null,
  cancelledAt: null,
  ...over,
});

describe("training state (one per person and reference)", () => {
  it.each([
    ["nothing", [], "NONE"],
    ["passed, no expiry", [rec({})], "VALID"],
    ["passed, expires in 90 days", [rec({ expiresAt: d("2027-02-04") })], "VALID"],
    ["passed, expires in 30 days", [rec({ expiresAt: d("2026-12-06") })], "EXPIRING"],
    ["passed, expired", [rec({ expiresAt: d("2026-11-05") })], "EXPIRED"],
    ["passed, date unknown", [rec({ date: null })], "VALID_UNDATED"],
    [
      "registered to a future session",
      [rec({ result: "REGISTERED", date: d("2026-12-01") })],
      "REGISTERED",
    ],
    ["to confirm", [rec({ result: "TO_CONFIRM" })], "TO_CONFIRM"],
    ["failed only", [rec({ result: "FAILED" })], "NONE"],
  ] as const)("%s → %s", (_name, records, expected) => {
    expect(trainingState(records, day, 60).status).toBe(expected);
  });

  it("ignores cancelled lines", () => {
    const cancelled = rec({ cancelledAt: new Date() });
    expect(trainingState([cancelled], day, 60).status).toBe("NONE");
  });

  it("the most recent pass wins: an old expired one does not hide a renewal", () => {
    const old = rec({ date: d("2024-01-10"), expiresAt: d("2024-12-31") });
    const renewed = rec({ date: d("2026-02-10"), expiresAt: d("2026-12-31") });
    const state = trainingState([old, renewed], day, 30);
    expect(state).toMatchObject({ status: "VALID", obtainedAt: d("2026-02-10") });
    // A renewal that expired more recently than an undated pass: the dated one counts first.
    expect(trainingState([rec({ date: null }), old], day, 30).status).toBe("EXPIRED");
  });

  it("31/12 rule: obtained in 2026, still valid on 06/11, expiring within 60 days", () => {
    expect(
      trainingState([rec({ date: d("2026-01-20"), expiresAt: d("2026-12-31") })], day, 60).status,
    ).toBe("EXPIRING");
  });

  it("a registration to a past session is a result to report", () => {
    const state = trainingState(
      [rec({ result: "REGISTERED", date: null, sessionStart: d("2026-10-01") })],
      day,
      60,
    );
    expect(state).toMatchObject({ status: "REGISTERED", pendingResult: true });
    expect(trainingState([rec({})], day, 60).pendingResult).toBe(false);
  });

  it("an expired pass with a renewal planned shows the registration", () => {
    const expired = rec({ expiresAt: d("2026-01-01") });
    const planned = rec({ result: "REGISTERED", date: d("2026-12-10") });
    expect(trainingState([expired, planned], day, 60).status).toBe("REGISTERED");
  });
});

describe("function state", () => {
  it("active, ended, cancelled, none", () => {
    expect(
      functionState([{ startDate: d("2025-01-01"), endDate: null, cancelledAt: null }], day).status,
    ).toBe("FUNCTION_ACTIVE");
    expect(functionState([{ startDate: null, endDate: null, cancelledAt: null }], day).status).toBe(
      "FUNCTION_ACTIVE",
    );
    expect(
      functionState(
        [{ startDate: d("2024-01-01"), endDate: d("2025-01-01"), cancelledAt: null }],
        day,
      ).status,
    ).toBe("FUNCTION_ENDED");
    expect(
      functionState([{ startDate: d("2025-01-01"), endDate: null, cancelledAt: new Date() }], day)
        .status,
    ).toBe("NONE");
    expect(
      functionState([{ startDate: d("2027-01-01"), endDate: null, cancelledAt: null }], day).status,
    ).toBe("NONE");
  });
});
