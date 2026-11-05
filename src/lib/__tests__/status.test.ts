import { describe, expect, it } from "vitest";
import { STATUSES, STATUS_KEYS, getStatus } from "@/lib/status";

describe("status registry", () => {
  it("lists the volunteer, deadline and dossier statuses", () => {
    expect(STATUS_KEYS).toEqual([
      "candidate",
      "active",
      "paused",
      "suspended",
      "inactive",
      "left",
      "ok",
      "soon",
      "expired",
      "link-active",
      "link-expired",
      "link-used",
      "link-revoked",
      "dossier-none",
      "dossier-draft",
      "dossier-submitted",
      "signature-submitted",
      "signature-volunteer_signed",
      "signature-parent_signed",
      "signature-to_countersign",
      "signature-complete",
      "signature-mail-sent",
      "signature-mail-failed",
      "signature-mail-pending",
    ]);
  });

  it("gives every status a non-empty French label", () => {
    for (const key of STATUS_KEYS) {
      expect(getStatus(key).label.length).toBeGreaterThan(0);
      expect(STATUSES[key].tone).toBeTruthy();
    }
  });
});
